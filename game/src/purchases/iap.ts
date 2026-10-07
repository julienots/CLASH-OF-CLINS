// Achats intégrés. Fournisseurs : Google Play Billing (pont Android natif)
// ou fournisseur de test (navigateur / debug uniquement).
// Flux : achat -> jeton -> VALIDATION SERVEUR -> attribution -> consommation/accusé.
import { call, serverConfigured } from '../networking/api';
import { IAP_PRODUCTS, iapProduct } from '../shop/catalog';

export interface ProductInfo { id: string; price: string; title: string }
export interface PurchaseToken { productId: string; token: string; orderId: string; signature?: string; acknowledged?: boolean }
export type PurchaseError = 'cancelled' | 'unavailable' | 'network' | 'already_owned' | 'pending' | 'invalid' | 'unknown';

export interface BillingProvider {
  name: string;
  available(): Promise<boolean>;
  products(ids: string[]): Promise<ProductInfo[]>;
  purchase(id: string): Promise<PurchaseToken>;
  owned(): Promise<PurchaseToken[]>;
  finish(p: PurchaseToken, consumable: boolean): Promise<void>;
}

export class PurchaseFailure extends Error { constructor(public code: PurchaseError, msg?: string) { super(msg ?? code); } }

// ─── Pont Android (voir android/src/.../BillingBridge.java) ───
declare global { interface Window { KingdomsBilling?: { call(method: string, args: string, cbId: string): void }; __kbCb?: Record<string, (r: string) => void> } }

function bridgeCall<T>(method: string, args: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = 'cb' + Math.random().toString(36).slice(2);
    window.__kbCb = window.__kbCb ?? {};
    window.__kbCb[id] = (raw: string) => {
      delete window.__kbCb![id];
      const r = JSON.parse(raw);
      if (r.error) reject(new PurchaseFailure(r.error as PurchaseError, r.message)); else resolve(r.data as T);
    };
    window.KingdomsBilling!.call(method, JSON.stringify(args ?? {}), id);
  });
}

export class AndroidBillingProvider implements BillingProvider {
  name = 'Google Play';
  async available() { return !!window.KingdomsBilling && (await bridgeCall<boolean>('available', {}).catch(() => false)); }
  products(ids: string[]) { return bridgeCall<ProductInfo[]>('products', { ids }); }
  purchase(id: string) { return bridgeCall<PurchaseToken>('purchase', { id }); }
  owned() { return bridgeCall<PurchaseToken[]>('owned', {}); }
  async finish(p: PurchaseToken, consumable: boolean) { await bridgeCall('finish', { token: p.token, consumable }); }
}

/** Fournisseur de test : jamais actif en build release Android (voir main.ts). */
export class MockBillingProvider implements BillingProvider {
  name = 'Boutique de test';
  private ownedList: PurchaseToken[] = [];
  failNext: PurchaseError | null = null;
  async available() { return true; }
  async products(ids: string[]) { return ids.map(id => ({ id, price: iapProduct(id)?.price ?? '?', title: iapProduct(id)?.name ?? id })); }
  async purchase(id: string): Promise<PurchaseToken> {
    if (this.failNext) { const f = this.failNext; this.failNext = null; throw new PurchaseFailure(f); }
    const p = iapProduct(id);
    if (!p) throw new PurchaseFailure('invalid');
    if (!p.consumable && this.ownedList.some(o => o.productId === id)) throw new PurchaseFailure('already_owned');
    const t: PurchaseToken = { productId: id, token: 'test.' + id + '.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), orderId: 'TEST-' + Date.now() };
    t.signature = mockSign(t.token);
    this.ownedList.push(t);
    return t;
  }
  async owned() { return this.ownedList.filter(o => !iapProduct(o.productId)?.consumable); }
  async finish(p: PurchaseToken, consumable: boolean) { if (consumable) this.ownedList = this.ownedList.filter(o => o.token !== p.token); }
}

/** Signature factice des jetons de test, vérifiée par le validateur local/serveur de développement. */
export function mockSign(token: string): string {
  let h = 2166136261;
  const k = 'kingdoms-dev-only:' + token;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export type Validator = (p: PurchaseToken) => Promise<{ valid: boolean; reason?: string }>;

/** Validation côté serveur (Google Play Developer API). */
export const serverValidator: Validator = async p => {
  const r = await call<{ valid: boolean; reason?: string }>('POST', '/iap/verify', p);
  return r;
};
/** Validation locale réservée aux jetons de test (aucun jeton Google n'est accepté localement). */
export const localTestValidator: Validator = async p => ({ valid: p.token.startsWith('test.') && p.signature === mockSign(p.token), reason: 'local-test' });

export interface PurchaseHooks { grant(productId: string, token: string): { ok: boolean; error?: string }; addPending(token: string): void; isProcessed(token: string): boolean }

export class PurchaseService {
  constructor(public provider: BillingProvider, private hooks: PurchaseHooks, private validator: Validator = serverConfigured() ? serverValidator : localTestValidator) {}

  async buy(productId: string): Promise<{ ok: boolean; error?: string; code?: PurchaseError }> {
    if (!iapProduct(productId)) return { ok: false, error: 'Produit inconnu', code: 'invalid' };
    if (!(await this.provider.available())) return { ok: false, error: 'Boutique indisponible sur cet appareil', code: 'unavailable' };
    let p: PurchaseToken;
    try { p = await this.provider.purchase(productId); }
    catch (e) {
      const code = e instanceof PurchaseFailure ? e.code : 'unknown';
      return { ok: false, code, error: MESSAGES[code] };
    }
    return this.process(p);
  }

  /** Valide puis attribue ; si le serveur est injoignable, l'achat reste en attente (jamais perdu). */
  async process(p: PurchaseToken): Promise<{ ok: boolean; error?: string; code?: PurchaseError }> {
    const prod = iapProduct(p.productId);
    if (!prod) return { ok: false, code: 'invalid', error: MESSAGES.invalid };
    if (this.hooks.isProcessed(p.token)) { await this.provider.finish(p, prod.consumable).catch(() => {}); return { ok: false, code: 'already_owned', error: MESSAGES.already_owned }; }
    let v: { valid: boolean };
    try { v = await this.validator(p); }
    catch { this.hooks.addPending(JSON.stringify(p)); return { ok: false, code: 'pending', error: MESSAGES.pending }; }
    if (!v.valid) return { ok: false, code: 'invalid', error: MESSAGES.invalid };
    const g = this.hooks.grant(p.productId, p.token);
    if (!g.ok) return { ok: false, code: 'already_owned', error: g.error };
    await this.provider.finish(p, prod.consumable).catch(() => {});
    return { ok: true };
  }

  /** Restaure les achats non consommables (réinstallation, nouvel appareil). */
  async restore(): Promise<{ restored: number; error?: string }> {
    if (!(await this.provider.available())) return { restored: 0, error: MESSAGES.unavailable };
    let n = 0;
    try {
      for (const p of await this.provider.owned()) {
        if (this.hooks.isProcessed(p.token)) continue;
        const r = await this.process(p);
        if (r.ok) n++;
      }
    } catch { return { restored: n, error: MESSAGES.network }; }
    return { restored: n };
  }

  /** Re-tente les achats en attente de validation. */
  async retryPending(pending: string[]): Promise<number> {
    let n = 0;
    for (const raw of pending) {
      try { const p = JSON.parse(raw) as PurchaseToken; const r = await this.process(p); if (r.ok) n++; } catch { /* reste en attente */ }
    }
    return n;
  }

  allProducts() { return IAP_PRODUCTS; }
}

export const MESSAGES: Record<PurchaseError, string> = {
  cancelled: 'Achat annulé.',
  unavailable: 'Les achats ne sont pas disponibles sur cet appareil.',
  network: 'Connexion impossible. Réessayez plus tard.',
  already_owned: 'Vous possédez déjà cet article.',
  pending: 'Paiement en attente de validation : il sera crédité automatiquement.',
  invalid: 'Achat refusé par la validation.',
  unknown: 'Une erreur inattendue est survenue.',
};
