// Outils de debug / test : génère un village complet pour un niveau de Citadelle.
import type { GameState } from '../core/state';
import { newGame, advance } from '../core/game';
import { generateBase } from '../campaign/basegen';
import { storageCap } from '../village/query';
import { syncHeroes } from '../heroes/heroes';

export function devVillage(cl: number, now: number, seed = 1): GameState {
  const s = newGame(now, 'Testeur', seed);
  const base = generateBase({ citadel: cl, seed, levelPenalty: 0, fill: 1, formation: 'compartments' });
  s.buildings = base.buildings.map(b => ({ uid: b.uid, type: b.type, level: b.level, x: b.x, y: b.y, rot: 0 as const }));
  // ouvriers
  let uid = Math.max(...s.buildings.map(b => b.uid)) + 1;
  s.nextUid = uid;
  for (const b of s.buildings) if (b.type === 'gold_mine' || b.type === 'sawmill' || b.type === 'farm' || b.type === 'generator' || b.type === 'quarry') b.stored = {};
  const cap = storageCap(s);
  s.resources = { gold: Math.floor(cap.gold * 0.8), wood: Math.floor(cap.wood * 0.8), energy: Math.floor(cap.energy * 0.8), crystals: 5000 };
  syncHeroes(s);
  advance(s, now);
  void uid;
  return s;
}

/** Remplit les camps avec une armée variée et les sorts disponibles. */
export function devArmy(s: GameState, units: Record<string, number>, spells: Record<string, number> = {}) {
  s.army.units = { ...units };
  s.army.spells = { ...spells };
}
