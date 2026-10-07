// Requêtes de lecture sur l'état du village (aucune mutation).
import type { GameState, BuildingInstance } from '../core/state';
import { blevel, bdef, maxCount } from '../buildings/defs';
import type { ResKey, Resources } from '../core/types';
import { computeMods, type Mods } from '../research/tech';
import { eventModifiers } from '../events/events';

export function citadelLevel(s: GameState): number {
  return s.buildings.find(b => b.type === 'citadel')?.level ?? 1;
}
export function countOf(s: GameState, type: string): number { return s.buildings.filter(b => b.type === type).length; }
export function ofType(s: GameState, type: string): BuildingInstance[] { return s.buildings.filter(b => b.type === type); }
export function bestLevel(s: GameState, type: string): number {
  let m = 0; for (const b of s.buildings) if (b.type === type && b.level > m) m = b.level; return m;
}
export function mods(s: GameState): Mods { return computeMods(s.research.tech); }

export function builderCount(s: GameState): number { return countOf(s, 'builder_hut'); }
export function busyBuilders(s: GameState): number { return s.buildings.filter(b => b.build).length; }
export function freeBuilders(s: GameState): number { return builderCount(s) - busyBuilders(s); }

/** Capacité de stockage totale par ressource (les cristaux n'ont pas de plafond). */
export function storageCap(s: GameState): Resources {
  const cap: Resources = { gold: 0, wood: 0, energy: 0, crystals: Infinity };
  const m = mods(s);
  for (const b of s.buildings) {
    if (b.level < 1) continue;
    const st = blevel(b.type, b.level).storage;
    if (!st) continue;
    for (const k of Object.keys(st) as ResKey[]) if (k !== 'crystals') cap[k] += st[k] ?? 0;
  }
  cap.gold = Math.floor(cap.gold * (1 + m.storage));
  cap.wood = Math.floor(cap.wood * (1 + m.storage));
  cap.energy = Math.floor(cap.energy * (1 + m.storage));
  return cap;
}

export function productionRates(s: GameState, now: number): Partial<Record<ResKey, number>> {
  const out: Partial<Record<ResKey, number>> = {};
  for (const b of s.buildings) {
    if (b.level < 1 || b.build) continue;
    for (const p of producerRates(s, b, now)) out[p.res] = (out[p.res] ?? 0) + p.perHour;
  }
  return out;
}

export function producerRates(s: GameState, b: BuildingInstance, now: number): { res: ResKey; perHour: number }[] {
  const L = blevel(b.type, b.level);
  if (!L.produces) return [];
  const m = mods(s);
  const ev = eventModifiers(now);
  return L.produces.map(p => ({ res: p.res, perHour: p.perHour * (1 + m.production) * (ev.production[p.res] ?? 1) }));
}

export function producerCapacity(s: GameState, b: BuildingInstance): number {
  const L = blevel(b.type, b.level);
  let cap = L.capacity ?? 0;
  if (b.type === 'quarry') {
    const vault = s.buildings.find(x => x.type === 'crystal_vault' && x.level > 0);
    if (vault) cap += blevel('crystal_vault', vault.level).value ?? 0;
  }
  return cap;
}

export function armyCapacity(s: GameState): number {
  let c = 0;
  for (const b of s.buildings) if (b.type === 'army_camp' && b.level > 0) c += blevel('army_camp', b.level).housing ?? 0;
  return Math.floor(c * (1 + mods(s).armyCapacity));
}
export function spellCapacity(s: GameState): number {
  const a = bestLevel(s, 'academy');
  if (!a) return 0;
  return (blevel('academy', a).housing ?? 0) + mods(s).spellCapacity;
}

/** Peut-on encore construire un exemplaire de ce type ? */
export function canBuildMore(s: GameState, type: string): boolean {
  if (bdef(type).category === 'decoration') return countOf(s, type) < 10;
  return countOf(s, type) < maxCount(type, citadelLevel(s));
}

export function isLevelUnlocked(s: GameState, type: string, level: number): boolean {
  const d = bdef(type);
  const L = d.levels[level - 1];
  if (!L) return false;
  return L.citadel <= citadelLevel(s);
}
