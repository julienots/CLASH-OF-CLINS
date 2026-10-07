// Gestion des ressources : gains plafonnés, dépenses, production, récolte, marché.
import type { GameState, BuildingInstance } from '../core/state';
import type { Cost, Resources, ResKey } from '../core/types';
import { RES_KEYS, fail, ok, type ActionResult } from '../core/types';
import { canAfford, missing } from '../core/util';
import { storageCap, producerRates, producerCapacity, bestLevel, mods } from '../village/query';
import { blevel } from '../buildings/defs';

/** Ajoute des ressources en respectant les capacités. Retourne ce qui a réellement été ajouté. */
export function gain(s: GameState, add: Partial<Resources>): Partial<Resources> {
  const cap = storageCap(s);
  const real: Partial<Resources> = {};
  for (const k of RES_KEYS) {
    const v = add[k];
    if (!v || v <= 0) continue;
    const before = s.resources[k];
    s.resources[k] = Math.min(cap[k], before + v);
    if (s.resources[k] < before) s.resources[k] = before; // déjà au-dessus du plafond : ne jamais retirer
    real[k] = s.resources[k] - before;
  }
  return real;
}

export function spend(s: GameState, cost: Cost): ActionResult {
  if (!canAfford(s.resources, cost)) return fail('Ressources insuffisantes');
  for (const k of RES_KEYS) {
    const v = cost[k] ?? 0;
    if (v < 0 || !Number.isFinite(v)) return fail('Coût invalide');
  }
  for (const k of RES_KEYS) s.resources[k] = Math.max(0, s.resources[k] - (cost[k] ?? 0));
  return ok();
}

export function refund(s: GameState, cost: Cost, ratio: number) {
  const r: Partial<Resources> = {};
  for (const k of RES_KEYS) if (cost[k]) r[k] = Math.floor((cost[k] ?? 0) * ratio);
  gain(s, r);
}

// ───── Accélérations en cristaux (paliers raisonnables) ─────
const SPEED_PTS: [number, number][] = [[0, 0], [60, 1], [3600, 20], [86400, 260], [604800, 1000]];
export function crystalsForTime(sec: number): number {
  if (sec <= 0) return 0;
  for (let i = 1; i < SPEED_PTS.length; i++) {
    const [t1, c1] = SPEED_PTS[i], [t0, c0] = SPEED_PTS[i - 1];
    if (sec <= t1) return Math.max(1, Math.ceil(c0 + (c1 - c0) * (sec - t0) / (t1 - t0)));
  }
  return 1000 + Math.ceil((sec - 604800) / 600);
}
const RES_PTS: [number, number][] = [[0, 0], [100, 1], [1000, 5], [10000, 25], [100000, 125], [1000000, 600], [10000000, 3000]];
export function crystalsForResources(amount: number, res: ResKey): number {
  if (amount <= 0) return 0;
  const mult = res === 'energy' ? 30 : 1;
  const a = amount * mult;
  for (let i = 1; i < RES_PTS.length; i++) {
    const [t1, c1] = RES_PTS[i], [t0, c0] = RES_PTS[i - 1];
    if (a <= t1) return Math.max(1, Math.ceil(c0 + (c1 - c0) * (a - t0) / (t1 - t0)));
  }
  return 3000 + Math.ceil((a - 10000000) / 3000);
}
export function crystalsForMissing(s: GameState, cost: Cost): number {
  const m = missing(s.resources, cost);
  let c = 0;
  for (const k of Object.keys(m) as ResKey[]) if (k !== 'crystals') c += crystalsForResources(m[k] ?? 0, k);
  return c;
}
/** Complète les ressources manquantes avec des cristaux (dans la limite du stockage). */
export function buyMissing(s: GameState, cost: Cost): ActionResult {
  const m = missing(s.resources, cost);
  if (m.crystals) return fail('Cristaux insuffisants');
  const price = crystalsForMissing(s, cost);
  if (s.resources.crystals < price) return fail('Cristaux insuffisants');
  const cap = storageCap(s);
  for (const k of Object.keys(m) as ResKey[]) if ((cost[k] ?? 0) > cap[k]) return fail('Stockage insuffisant : améliorez vos entrepôts');
  s.resources.crystals -= price;
  for (const k of Object.keys(m) as ResKey[]) s.resources[k] += m[k] ?? 0;
  return ok();
}

// ───── Production ─────
export function accrue(s: GameState, b: BuildingInstance, seconds: number, now: number) {
  if (b.level < 1 || b.build || seconds <= 0) return;
  const rates = producerRates(s, b, now);
  if (!rates.length) return;
  const cap = producerCapacity(s, b);
  b.stored = b.stored ?? {};
  for (const r of rates) {
    const cur = b.stored[r.res] ?? 0;
    b.stored[r.res] = Math.min(cap, cur + (r.perHour * seconds) / 3600);
  }
}

export function collect(s: GameState, uid: number): ActionResult<Partial<Resources>> {
  const b = s.buildings.find(x => x.uid === uid);
  if (!b || !b.stored) return fail('Rien à récolter');
  const cap = storageCap(s);
  const got: Partial<Resources> = {};
  for (const k of Object.keys(b.stored) as ResKey[]) {
    const have = Math.floor(b.stored[k] ?? 0);
    if (have < 1) continue;
    const room = Math.max(0, cap[k] - s.resources[k]);
    const take = Math.min(have, room);
    if (take <= 0) continue;
    s.resources[k] += take;
    b.stored[k] = (b.stored[k] ?? 0) - take;
    got[k] = take;
  }
  if (!Object.keys(got).length) return fail('Stockage plein !');
  return ok(got);
}

export function collectAll(s: GameState): Partial<Resources> {
  const total: Partial<Resources> = {};
  for (const b of s.buildings) {
    if (!b.stored) continue;
    const r = collect(s, b.uid);
    if (r.ok && r.data) for (const k of Object.keys(r.data) as ResKey[]) total[k] = (total[k] ?? 0) + (r.data[k] ?? 0);
  }
  return total;
}

// ───── Marché ─────
export function marketFee(s: GameState): number {
  const lvl = bestLevel(s, 'market');
  if (!lvl) return 1;
  return Math.max(0.05, (blevel('market', lvl).value ?? 40) / 100 - mods(s).marketFee);
}
export function trade(s: GameState, from: 'gold' | 'wood', amount: number): ActionResult<number> {
  if (!bestLevel(s, 'market')) return fail('Construisez un marché');
  amount = Math.floor(amount);
  if (!(amount > 0)) return fail('Montant invalide');
  if (s.resources[from] < amount) return fail('Ressources insuffisantes');
  const to = from === 'gold' ? 'wood' : 'gold';
  const out = Math.floor(amount * (1 - marketFee(s)));
  const room = storageCap(s)[to] - s.resources[to];
  if (out > room) return fail('Stockage de destination insuffisant');
  s.resources[from] -= amount;
  s.resources[to] += out;
  return ok(out);
}

export function costWithMods(s: GameState, cost: Cost, eventMult = 1): Cost {
  const m = mods(s);
  const out: Cost = {};
  for (const k of Object.keys(cost) as ResKey[]) {
    const v = cost[k] ?? 0;
    out[k] = k === 'crystals' ? v : Math.round(v * (1 - m.buildCost) * eventMult);
  }
  return out;
}
