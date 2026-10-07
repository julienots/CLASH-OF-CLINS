// Catalogue de la boutique : offres, apparences, décorations, ressources, pass, packs.
import type { GameState } from '../core/state';
import { fail, ok, type ActionResult, type Resources } from '../core/types';
import { Rng } from '../core/rng';
import { storageCap, citadelLevel } from '../village/query';
import { crystalsForResources, gain } from '../resources/economy';
import { HEROES } from '../heroes/defs';
import { BUILDING_LIST } from '../buildings/defs';
import { dayIndex } from '../events/events';

/** Produits achetables avec de l'argent réel (Google Play Billing). */
export interface IapProduct { id: string; name: string; desc: string; price: string; consumable: boolean; icon: string; grant: { crystals?: number; resources?: Partial<Resources>; cosmetics?: string[]; premiumPass?: boolean; builder?: boolean }; limit?: number; highlight?: string }
export const IAP_PRODUCTS: IapProduct[] = [
  { id: 'crystals_small', name: 'Bourse de cristaux', desc: '120 cristaux', price: '0,99 €', consumable: true, icon: '💎', grant: { crystals: 120 } },
  { id: 'crystals_medium', name: 'Coffret de cristaux', desc: '650 cristaux (+8 %)', price: '4,99 €', consumable: true, icon: '💎', grant: { crystals: 650 }, highlight: 'Populaire' },
  { id: 'crystals_large', name: 'Trésor de cristaux', desc: '1 400 cristaux (+17 %)', price: '9,99 €', consumable: true, icon: '💎', grant: { crystals: 1400 }, highlight: 'Meilleure valeur' },
  { id: 'starter_pack', name: 'Pack de démarrage', desc: '500 cristaux, 3e ouvrier, apparence de Citadelle de jade', price: '2,99 €', consumable: false, icon: '🎁', limit: 1, grant: { crystals: 500, builder: true, cosmetics: ['citadel_jade'] }, highlight: 'Une seule fois' },
  { id: 'season_pass', name: 'Royal Pass Premium', desc: 'Débloque la piste premium de la saison', price: '4,99 €', consumable: false, icon: '👑', grant: { premiumPass: true } },
  { id: 'special_bundle', name: 'Pack du Héros', desc: '1 000 cristaux, Arkon « Tyran des braises », Citadelle d\'obsidienne', price: '14,99 €', consumable: false, icon: '🔥', limit: 1, grant: { crystals: 1000, cosmetics: ['arkon_ember', 'citadel_obsidian'] } },
];
export function iapProduct(id: string) { return IAP_PRODUCTS.find(p => p.id === id); }

/** Applique le contenu d'un produit validé (idempotent par jeton). */
export function grantProduct(s: GameState, productId: string, token: string): ActionResult<string[]> {
  const p = iapProduct(productId);
  if (!p) return fail('Produit inconnu');
  if (s.shop.tokens.includes(token)) return fail('Achat déjà traité');
  if (p.limit && (s.shop.purchases[productId] ?? 0) >= p.limit) return fail('Déjà acheté');
  const out: string[] = [];
  if (p.grant.crystals) { s.resources.crystals += p.grant.crystals; out.push(`💎 +${p.grant.crystals}`); }
  if (p.grant.resources) gain(s, p.grant.resources);
  for (const c of p.grant.cosmetics ?? []) if (!s.inventory.cosmetics.includes(c)) { s.inventory.cosmetics.push(c); out.push(c); }
  if (p.grant.premiumPass) { s.pass.premium = true; out.push('Royal Pass Premium'); }
  if (p.grant.builder) { s.inventory.cosmetics.push('free_builder'); out.push('Ouvrier supplémentaire offert'); }
  s.shop.purchases[productId] = (s.shop.purchases[productId] ?? 0) + 1;
  s.shop.tokens.push(token);
  if (s.shop.tokens.length > 500) s.shop.tokens = s.shop.tokens.slice(-500);
  s.shop.pendingTokens = s.shop.pendingTokens.filter(t => t !== token);
  return ok(out);
}

// ───── Articles en cristaux ─────
export interface CrystalItem { id: string; section: 'offers' | 'skins' | 'decorations' | 'resources'; name: string; desc: string; icon: string; price: number; owned?: boolean; color?: string }

export const CITADEL_SKINS = [
  { id: 'citadel_jade', name: 'Citadelle de jade', color: '#26a69a', price: 600 },
  { id: 'citadel_obsidian', name: 'Citadelle d\'obsidienne', color: '#37474f', price: 1500 },
  { id: 'citadel_sakura', name: 'Citadelle des cerisiers', color: '#f48fb1', price: 900 },
];
export const THEMES = [
  { id: 'classic', name: 'Prairie classique', price: 0, ground: '#7cb342', ground2: '#8bc34a' },
  { id: 'theme_autumn', name: 'Automne doré', price: 500, ground: '#c0a03b', ground2: '#d4b350' },
  { id: 'theme_winter', name: 'Hiver éternel', price: 500, ground: '#dfe9ee', ground2: '#eef4f7' },
  { id: 'theme_desert', name: 'Oasis d\'ambre', price: 500, ground: '#d7b56d', ground2: '#e3c27f' },
];

export function resourceOffers(s: GameState): CrystalItem[] {
  const cap = storageCap(s);
  const out: CrystalItem[] = [];
  for (const res of ['gold', 'wood', 'energy'] as const) {
    if (!cap[res]) continue;
    for (const frac of [0.1, 0.5, 1]) {
      const amount = Math.max(0, Math.floor(cap[res] * frac - (frac === 1 ? s.resources[res] : 0)));
      if (amount <= 0) continue;
      out.push({ id: `res_${res}_${frac}`, section: 'resources', name: `${frac === 1 ? 'Remplir' : Math.round(frac * 100) + ' %'} ${res === 'gold' ? 'd\'or' : res === 'wood' ? 'de bois' : 'd\'énergie'}`, desc: `+${amount}`, icon: res === 'gold' ? '🪙' : res === 'wood' ? '🪵' : '⚡', price: crystalsForResources(amount, res) });
    }
  }
  return out;
}

function dealResource(now: number): 'gold' | 'wood' { return new Rng(dayIndex(now) * 17 + 3).pick(['gold', 'wood'] as const); }

export function crystalCatalog(s: GameState, now: number): CrystalItem[] {
  const out: CrystalItem[] = [];
  // offre du jour (-40 %)
  const d = dayIndex(now);
  const cl = citadelLevel(s);
  const res = dealResource(now);
  out.push({ id: 'deal_' + d, section: 'offers', name: 'Offre du jour', desc: `${Math.round(800 * cl * cl)} ${res === 'gold' ? 'or' : 'bois'} à -40 %`, icon: '⭐', price: Math.max(5, Math.round(crystalsForResources(800 * cl * cl, res) * 0.6)), owned: s.shop.dealBought === d });
  for (const h of HEROES) for (const sk of h.skins) if (sk.crystals > 0) out.push({ id: sk.id, section: 'skins', name: `${h.name} – ${sk.name}`, desc: 'Apparence de héros (cosmétique)', icon: '🦸', price: sk.crystals, owned: s.inventory.cosmetics.includes(sk.id), color: sk.color });
  for (const c of CITADEL_SKINS) out.push({ id: c.id, section: 'skins', name: c.name, desc: 'Apparence de Citadelle (cosmétique)', icon: '🏰', price: c.price, owned: s.inventory.cosmetics.includes(c.id), color: c.color });
  for (const t of THEMES) if (t.price) out.push({ id: t.id, section: 'skins', name: t.name, desc: 'Thème de village (cosmétique)', icon: '🎨', price: t.price, owned: s.inventory.cosmetics.includes(t.id), color: t.ground });
  for (const b of BUILDING_LIST) if (b.category === 'decoration' && b.crystalPrice) out.push({ id: 'deco:' + b.id, section: 'decorations', name: b.name, desc: 'Se place dans le village', icon: '🗿', price: b.crystalPrice, color: b.color });
  out.push(...resourceOffers(s));
  return out;
}

export function buyCrystalItem(s: GameState, id: string, now: number): ActionResult<string> {
  const item = crystalCatalog(s, now).find(i => i.id === id);
  if (!item) return fail('Article indisponible');
  if (item.owned) return fail('Déjà possédé');
  if (item.section === 'decorations') return fail('Placez la décoration depuis le menu Construire');
  if (s.resources.crystals < item.price) return fail('Cristaux insuffisants');
  if (item.section === 'resources' || item.section === 'offers') {
    const cl = citadelLevel(s);
    let add: Partial<Resources> = {};
    if (item.section === 'offers') { add = { [dealResource(now)]: 800 * cl * cl }; s.shop.dealBought = dayIndex(now); }
    else { const [, r, f] = id.split('_'); const cap = storageCap(s)[r as 'gold']; const frac = Number(f); add = { [r]: Math.floor(cap * frac - (frac === 1 ? s.resources[r as 'gold'] : 0)) }; }
    const room = storageCap(s);
    for (const [k, v] of Object.entries(add)) if ((v ?? 0) + s.resources[k as 'gold'] > room[k as 'gold'] + 1) return fail('Stockage insuffisant');
    s.resources.crystals -= item.price;
    gain(s, add);
    return ok(item.name);
  }
  s.resources.crystals -= item.price;
  s.inventory.cosmetics.push(id);
  return ok(item.name);
}

export function setTheme(s: GameState, id: string): ActionResult {
  const t = THEMES.find(x => x.id === id);
  if (!t) return fail('Thème inconnu');
  if (t.price && !s.inventory.cosmetics.includes(id)) return fail('Thème non possédé');
  s.inventory.theme = id;
  return ok();
}
export function setCitadelSkin(s: GameState, id: string | undefined): ActionResult {
  if (id && !s.inventory.cosmetics.includes(id)) return fail('Apparence non possédée');
  s.inventory.citadelSkin = id;
  return ok();
}
