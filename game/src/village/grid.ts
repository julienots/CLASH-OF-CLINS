// Grille d'occupation du village et validation de placement.
import { MAP_SIZE, type BuildingInstance, type GameState } from '../core/state';
import { bdef } from '../buildings/defs';

export function footprint(b: { type: string }): number { return bdef(b.type).size; }

/** Grille [y*MAP+x] -> uid (0 = libre). */
export function occupancy(buildings: BuildingInstance[], ignore?: Set<number>): Int32Array {
  const g = new Int32Array(MAP_SIZE * MAP_SIZE);
  for (const b of buildings) {
    if (ignore?.has(b.uid)) continue;
    const s = footprint(b);
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const x = b.x + dx, y = b.y + dy;
      if (x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE) g[y * MAP_SIZE + x] = b.uid;
    }
  }
  return g;
}

/** Bord de carte non constructible (bande de déploiement garantie). */
export const BORDER = 2;

/** Zone constructible : elle s'agrandit avec la Citadelle (nouvelles zones). */
export function buildArea(citadel: number): { min: number; max: number } {
  const side = Math.min(MAP_SIZE - 2 * BORDER, 26 + (Math.max(1, citadel) - 1));
  const min = Math.floor((MAP_SIZE - side) / 2);
  return { min, max: min + side }; // [min, max)
}

export function inBounds(x: number, y: number, size: number, citadel = 15): boolean {
  const a = buildArea(citadel);
  return x >= a.min && y >= a.min && x + size <= a.max && y + size <= a.max;
}

export function canPlaceAt(grid: Int32Array, x: number, y: number, size: number, citadel = 15): boolean {
  if (!inBounds(x, y, size, citadel)) return false;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (grid[(y + dy) * MAP_SIZE + x + dx] !== 0) return false;
  return true;
}

/** Cherche l'emplacement libre le plus proche du centre (spirale). */
export function findFreeSpot(state: GameState, type: string, near?: { x: number; y: number }, citadel = 15): { x: number; y: number } | null {
  const size = bdef(type).size;
  const grid = occupancy(state.buildings);
  const area = buildArea(citadel);
  const cx = near?.x ?? MAP_SIZE / 2 - size / 2, cy = near?.y ?? MAP_SIZE / 2 - size / 2;
  let best: { x: number; y: number } | null = null, bestD = Infinity;
  for (let y = area.min; y <= area.max - size; y++) for (let x = area.min; x <= area.max - size; x++) {
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d >= bestD) continue;
    // marge d'une case autour des bâtiments (hors murs) pour garder des allées
    const margin = size === 1 ? 0 : 1;
    if (canPlaceAt(grid, x, y, size, citadel) && (margin === 0 || ringFree(grid, x, y, size))) { best = { x, y }; bestD = d; }
  }
  return best;
}

function ringFree(grid: Int32Array, x: number, y: number, size: number): boolean {
  for (let dy = -1; dy <= size; dy++) for (let dx = -1; dx <= size; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= MAP_SIZE || yy >= MAP_SIZE) continue;
    if (grid[yy * MAP_SIZE + xx] !== 0) return false;
  }
  return true;
}
