// Défenses subies pendant l'absence du joueur : des seigneurs (IA) attaquent
// le vrai village du joueur, simulé intégralement avec ses défenses et pièges.
import type { GameState } from '../core/state';
import type { Resources, ResKey } from '../core/types';
import { RES_KEYS } from '../core/types';
import { Rng, hashString } from '../core/rng';
import { blevel } from '../buildings/defs';
import { simulate, type BattleResult } from '../combat/sim';
import { planAttack, botArmy } from '../combat/ai';
import { playerBase, trophyDelta } from '../combat/setup';
import { randomLordName } from '../campaign/basegen';
import { citadelLevel, storageCap } from '../village/query';

export const ATTACK_INTERVAL_MS = 8 * 3600000;
export const SHIELD_MS = 12 * 3600000;

/** Butin exposé : part des stocks répartie sur les entrepôts, plus la moitié des producteurs. */
export function exposedLoot(s: GameState): Record<number, Partial<Resources>> {
  const out: Record<number, Partial<Resources>> = {};
  const cap = storageCap(s);
  const pct = Math.max(0.08, 0.2 - citadelLevel(s) * 0.008);
  for (const b of s.buildings) {
    if (b.level < 1) continue;
    const L = blevel(b.type, b.level);
    const r: Partial<Resources> = {};
    if (L.storage) for (const k of Object.keys(L.storage) as ResKey[]) {
      if (k === 'crystals' || !cap[k]) continue;
      const share = (L.storage[k] ?? 0) / cap[k];
      r[k] = Math.floor(s.resources[k] * share * pct);
    }
    if (b.stored) for (const k of Object.keys(b.stored) as ResKey[]) if (k !== 'crystals') r[k] = (r[k] ?? 0) + Math.floor((b.stored[k] ?? 0) * 0.5);
    if (Object.values(r).some(v => (v ?? 0) > 0)) out[b.uid] = r;
  }
  return out;
}

export function defendOnce(s: GameState, seed: number, now: number): { result: BattleResult; lost: Partial<Resources>; trophies: number; name: string } {
  const rng = new Rng(seed);
  const cl = citadelLevel(s);
  const acl = Math.max(1, Math.min(15, cl + rng.pick([-1, 0, 0, 1])));
  const army = botArmy(acl, seed);
  const unitLevels: Record<string, number> = {};
  for (const k of Object.keys(army.units)) unitLevels[k] = Math.max(1, Math.ceil(acl * 0.5));
  const loot = exposedLoot(s);
  const setup = { seed, mode: 'raid' as const, base: playerBase(s), attacker: { units: army.units, unitLevels, spells: army.spells, spellLevels: {}, heroes: [] }, loot, timeLimit: 180 };
  const result = simulate(setup, planAttack(setup, seed));
  // pertes réellement appliquées : butin pris, d'abord sur les producteurs puis les stocks
  const lost: Partial<Resources> = {};
  for (const k of RES_KEYS) {
    const take = Math.min(s.resources[k], result.loot[k] ?? 0);
    if (take > 0) { s.resources[k] -= take; lost[k] = take; }
  }
  const oppTrophies = Math.max(0, s.player.trophies + rng.int(-60, 60));
  const delta = -trophyDelta(oppTrophies, s.player.trophies, result.stars);
  const trophies = result.stars > 0 ? delta : Math.round(Math.abs(delta) * 0.5);
  s.player.trophies = Math.max(0, s.player.trophies + trophies);
  if (result.stars > 0) s.player.stats.defensesLost++; else s.player.stats.defensesWon++;
  if (result.destruction >= 40) s.player.shieldUntil = now + SHIELD_MS * (result.destruction >= 90 ? 1.33 : 1);
  const name = randomLordName(rng);
  s.log.unshift({ at: now, attacker: name, stars: result.stars, destruction: result.destruction, lost, trophies, kind: 'pvp' });
  s.log = s.log.slice(0, 30);
  return { result, lost, trophies, name };
}

/** À appeler au retour du joueur : simule les attaques reçues pendant l'absence. */
export function processOfflineDefenses(s: GameState, from: number, now: number, max = 2): number {
  if (citadelLevel(s) < 2) return 0; // les tout nouveaux villages sont épargnés
  let n = 0;
  let t = Math.max(from, s.player.shieldUntil);
  while (now - t >= ATTACK_INTERVAL_MS && n < max) {
    t += ATTACK_INTERVAL_MS;
    defendOnce(s, hashString(s.player.id + t) >>> 0, t);
    n++;
    t = Math.max(t, s.player.shieldUntil);
  }
  return n;
}
