// Construction, amélioration, déplacement et gestion des ouvriers.
import type { GameState, BuildingInstance } from '../core/state';
import { fail, ok, type ActionResult, type Cost } from '../core/types';
import { bdef, blevel, BUILDINGS } from './defs';
import { canBuildMore, citadelLevel, countOf, freeBuilders, isLevelUnlocked, mods } from '../village/query';
import { canPlaceAt, occupancy, inBounds } from '../village/grid';
import { spend, refund, costWithMods, crystalsForTime, gain } from '../resources/economy';
import { addXp, xpForSeconds } from '../progression/progression';
import { eventModifiers } from '../events/events';
import { MAP_SIZE } from '../core/state';

export const BUILDER_HUT_PRICES = [0, 0, 250, 500, 1000];

export function buildCost(s: GameState, type: string, level: number, now: number): Cost {
  if (type === 'builder_hut') {
    const n = countOf(s, 'builder_hut');
    if (n === 2 && s.inventory.cosmetics.includes('free_builder')) return { crystals: 0 };
    return { crystals: BUILDER_HUT_PRICES[Math.min(4, n)] ?? 2000 };
  }
  const d = bdef(type);
  const base = d.levels[level - 1].cost;
  if (d.category === 'decoration') return base;
  return costWithMods(s, base, eventModifiers(now).buildCost);
}

export function buildTime(s: GameState, type: string, level: number): number {
  const t = blevel(type, level).time;
  return Math.round(t * (1 - mods(s).buildSpeed));
}

export function placeBuilding(s: GameState, type: string, x: number, y: number, now: number): ActionResult<BuildingInstance> {
  if (typeof type !== 'string' || !BUILDINGS[type]) return fail('Bâtiment inconnu');
  const d = bdef(type);
  if (!canBuildMore(s, type)) return fail('Limite atteinte pour ce niveau de Citadelle');
  if (!isLevelUnlocked(s, type, 1)) return fail(`Requiert la Citadelle niveau ${d.levels[0].citadel}`);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return fail('Position invalide');
  const grid = occupancy(s.buildings);
  if (!canPlaceAt(grid, x, y, d.size, citadelLevel(s))) return fail('Emplacement occupé ou hors du territoire');
  const time = buildTime(s, type, 1);
  if (time > 0 && freeBuilders(s) <= 0) return fail('Aucun ouvrier disponible');
  const cost = buildCost(s, type, 1, now);
  const r = spend(s, cost);
  if (!r.ok) return fail(r.error!);
  const b: BuildingInstance = { uid: s.nextUid++, type, level: 0, x, y, rot: 0 };
  if (time > 0) b.build = { toLevel: 1, startAt: now, endAt: now + time * 1000 };
  else completeLevel(s, b, 1, now);
  s.buildings.push(b);
  return ok(b);
}

/** Construction rapide de murs le long d'une ligne de cases. */
export function placeWalls(s: GameState, cells: { x: number; y: number }[], now: number): ActionResult<number> {
  let n = 0;
  for (const c of cells) {
    if (!canBuildMore(s, 'wall')) break;
    const r = placeBuilding(s, 'wall', c.x, c.y, now);
    if (r.ok) n++;
    else if (r.error === 'Ressources insuffisantes') break;
  }
  return n ? ok(n) : fail('Impossible de placer des murailles ici');
}

export function upgradeBuilding(s: GameState, uid: number, now: number): ActionResult {
  const b = s.buildings.find(x => x.uid === uid);
  if (!b) return fail('Bâtiment introuvable');
  if (b.build) return fail('Déjà en chantier');
  const d = bdef(b.type);
  const to = b.level + 1;
  if (to > d.levels.length) return fail('Niveau maximum atteint');
  if (!isLevelUnlocked(s, b.type, to)) return fail(`Requiert la Citadelle niveau ${d.levels[to - 1].citadel}`);
  const time = buildTime(s, b.type, to);
  if (time > 0 && freeBuilders(s) <= 0) return fail('Aucun ouvrier disponible');
  const r = spend(s, buildCost(s, b.type, to, now));
  if (!r.ok) return fail(r.error!);
  if (time > 0) b.build = { toLevel: to, startAt: now, endAt: now + time * 1000 };
  else completeLevel(s, b, to, now);
  return ok();
}

/** Améliore plusieurs murs d'un coup (sélection multiple). */
export function upgradeMany(s: GameState, uids: number[], now: number): ActionResult<number> {
  let n = 0;
  for (const u of uids) if (upgradeBuilding(s, u, now).ok) n++;
  return n ? ok(n) : fail('Aucune amélioration possible');
}

export function cancelBuild(s: GameState, uid: number, now: number): ActionResult {
  const b = s.buildings.find(x => x.uid === uid);
  if (!b?.build) return fail('Aucun chantier');
  const cost = buildCost(s, b.type, b.build.toLevel, now);
  refund(s, cost, 0.5);
  if (b.level === 0) s.buildings = s.buildings.filter(x => x !== b);
  else delete b.build;
  return ok();
}

export function finishNowCost(b: BuildingInstance, now: number): number {
  return b.build ? crystalsForTime((b.build.endAt - now) / 1000) : 0;
}
export function finishNow(s: GameState, uid: number, now: number): ActionResult {
  const b = s.buildings.find(x => x.uid === uid);
  if (!b?.build) return fail('Aucun chantier');
  const c = finishNowCost(b, now);
  if (s.resources.crystals < c) return fail('Cristaux insuffisants');
  s.resources.crystals -= c;
  completeLevel(s, b, b.build.toLevel, now);
  return ok();
}

export function completeLevel(s: GameState, b: BuildingInstance, level: number, at: number) {
  const time = blevel(b.type, level).time;
  b.level = level;
  delete b.build;
  if (blevel(b.type, level).produces) b.stored = b.stored ?? {};
  s.player.stats.buildingsBuilt++;
  addXp(s, xpForSeconds(time));
  if (b.type === 'citadel') {
    // Une nouvelle Citadelle remplit un peu les coffres : sensation de récompense immédiate.
    gain(s, { gold: 500 * level, wood: 500 * level });
  }
  void at;
}

// ───── Achat d'ouvriers ─────
export function buyBuilderHut(s: GameState, x: number, y: number, now: number): ActionResult<BuildingInstance> {
  return placeBuilding(s, 'builder_hut', x, y, now);
}

// ───── Déplacement (mode édition) ─────
export function moveBuildings(s: GameState, moves: { uid: number; x: number; y: number }[]): ActionResult {
  const ids = new Set(moves.map(m => m.uid));
  const grid = occupancy(s.buildings, ids);
  const cl = citadelLevel(s);
  // vérifie que les bâtiments déplacés ne se chevauchent pas entre eux
  const temp = new Int32Array(MAP_SIZE * MAP_SIZE);
  for (const m of moves) {
    const b = s.buildings.find(x => x.uid === m.uid);
    if (!b) return fail('Bâtiment introuvable');
    const size = bdef(b.type).size;
    if (!Number.isInteger(m.x) || !Number.isInteger(m.y) || !inBounds(m.x, m.y, size, cl)) return fail('Hors du territoire');
    if (!canPlaceAt(grid, m.x, m.y, size, cl)) return fail('Emplacement occupé');
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const i = (m.y + dy) * MAP_SIZE + m.x + dx;
      if (temp[i]) return fail('Chevauchement');
      temp[i] = b.uid;
    }
  }
  for (const m of moves) { const b = s.buildings.find(x => x.uid === m.uid)!; b.x = m.x; b.y = m.y; }
  return ok();
}

export function rotateBuilding(s: GameState, uid: number): ActionResult {
  const b = s.buildings.find(x => x.uid === uid);
  if (!b) return fail('Bâtiment introuvable');
  b.rot = b.rot ? 0 : 1;
  return ok();
}

/** Seuls les murs et décorations peuvent être retirés (pas de remboursement). */
export function removeBuilding(s: GameState, uid: number): ActionResult {
  const b = s.buildings.find(x => x.uid === uid);
  if (!b) return fail('Bâtiment introuvable');
  const cat = bdef(b.type).category;
  if (cat !== 'decoration' && cat !== 'wall') return fail('Ce bâtiment ne peut pas être retiré');
  s.buildings = s.buildings.filter(x => x !== b);
  return ok();
}
