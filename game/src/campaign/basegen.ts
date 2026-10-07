// Générateur procédural de bases ennemies selon différentes formations.
import { Rng } from '../core/rng';
import { MAP_SIZE } from '../core/state';
import { BUILDING_LIST, bdef, blevel, maxCount, maxLevelFor } from '../buildings/defs';
import type { BaseBuilding } from '../combat/sim';
import type { Resources } from '../core/types';
import { buildArea } from '../village/grid';

export type Formation = 'ring' | 'core' | 'spread' | 'compartments' | 'island' | 'maze' | 'fortress';
export const FORMATIONS: Record<Formation, string> = {
  ring: 'Anneau', core: 'Noyau fortifié', spread: 'Éparpillée', compartments: 'Compartiments', island: 'Îlots', maze: 'Labyrinthe', fortress: 'Forteresse',
};

export interface GenOptions {
  citadel: number;
  seed: number;
  formation?: Formation;
  levelPenalty?: number;    // niveaux retirés en moyenne (bases plus faibles)
  fill?: number;            // proportion des bâtiments autorisés (0..1)
  only?: string[];          // restreint les défenses autorisées (campagne)
  exclude?: string[];
  wallRatio?: number;
}

export interface GeneratedBase { buildings: BaseBuilding[]; formation: Formation; citadel: number }

const OUTER = new Set(['gold_mine', 'sawmill', 'farm', 'quarry', 'generator', 'army_camp', 'barracks', 'laboratory', 'builder_hut', 'workshop', 'academy', 'market', 'forge', 'observatory']);
const PRODUCERS = new Set(['gold_mine', 'sawmill', 'farm', 'quarry', 'generator']);
const INNER = new Set(['gold_vault', 'wood_depot', 'energy_cell', 'crystal_vault', 'temple', 'guild_portal']);

export function generateBase(o: GenOptions): GeneratedBase {
  const rng = new Rng(o.seed);
  const cl = Math.max(1, Math.min(15, o.citadel));
  const formation: Formation = o.formation ?? rng.pick(['ring', 'core', 'compartments', 'island', 'maze', 'fortress'] as Formation[]);
  const area = buildArea(cl);
  const C = MAP_SIZE / 2;
  const half = (area.max - area.min) / 2;
  const occ = new Int8Array(MAP_SIZE * MAP_SIZE); // 0 libre, 1 bâtiment, 2 mur, 3 réservé (marge)
  const out: BaseBuilding[] = [];
  let uid = 1;
  const lvl = (type: string) => {
    if (type === 'citadel') return cl;
    const m = maxLevelFor(type, cl);
    if (m <= 1) return Math.max(1, m);
    const pen = o.levelPenalty ?? 1;
    return Math.max(1, Math.min(m, m - Math.floor(rng.range(0, pen + 1))));
  };
  const fill = o.fill ?? 1;

  // ── 1. Murs selon la formation ──
  const wallBudget = Math.floor(maxCount('wall', cl) * (o.wallRatio ?? 1));
  const wallCells: [number, number][] = [];
  const rect = (r: number, gaps = 0) => {
    const pts: [number, number][] = [];
    const x0 = Math.round(C - r), x1 = Math.round(C + r - 1);
    for (let x = x0; x <= x1; x++) { pts.push([x, x0]); pts.push([x, x1]); }
    for (let y = x0 + 1; y < x1; y++) { pts.push([x0, y]); pts.push([x1, y]); }
    if (gaps) for (let g = 0; g < gaps; g++) { const i = rng.int(0, pts.length - 1); pts.splice(i, 2); }
    return pts;
  };
  const coreR = Math.min(half - 2, 4 + Math.floor(cl / 3));
  switch (formation) {
    case 'ring': wallCells.push(...rect(coreR + 2)); break;
    case 'core': wallCells.push(...rect(4)); wallCells.push(...rect(coreR + 3, 2)); break;
    case 'compartments': {
      const r = coreR + 2;
      wallCells.push(...rect(r));
      for (let i = -r + 1; i < r - 1; i++) { wallCells.push([Math.round(C) + i, Math.round(C) - 1]); wallCells.push([Math.round(C) - 1, Math.round(C) + i]); }
      break;
    }
    case 'island': {
      for (const [ox, oy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
        const x0 = Math.round(C + ox - 3), y0 = Math.round(C + oy - 3);
        for (let i = 0; i < 6; i++) { wallCells.push([x0 + i, y0], [x0 + i, y0 + 5], [x0, y0 + i], [x0 + 5, y0 + i]); }
      }
      wallCells.push(...rect(3));
      break;
    }
    case 'maze': wallCells.push(...rect(3, 1), ...rect(6, 2), ...rect(coreR + 4, 3)); break;
    case 'fortress': wallCells.push(...rect(3), ...rect(coreR + 1), ...rect(coreR + 5, 1)); break;
    case 'spread': for (let i = 0; i < 8; i++) { const x = rng.int(area.min, area.max - 5), y = rng.int(area.min, area.max - 1); for (let k = 0; k < 4; k++) wallCells.push([x + k, y]); } break;
  }
  const seen = new Set<number>();
  let walls = 0;
  for (const [x, y] of wallCells) {
    if (walls >= wallBudget) break;
    if (x < area.min || y < area.min || x >= area.max || y >= area.max) continue;
    const i = y * MAP_SIZE + x;
    if (seen.has(i)) continue;
    seen.add(i);
    occ[i] = 2;
    out.push({ uid: uid++, type: 'wall', level: lvl('wall'), x, y });
    walls++;
  }

  // ── 2. Bâtiments ──
  const list: { type: string; ring: number }[] = [];
  const excl = new Set(o.exclude ?? []);
  for (const d of BUILDING_LIST) {
    if (d.category === 'decoration' || d.category === 'wall' || d.category === 'trap' || excl.has(d.id)) continue;
    if (o.only && d.category === 'defense' && !o.only.includes(d.id)) continue;
    let n = maxCount(d.id, cl);
    if (d.id === 'builder_hut') n = Math.min(n, 2 + Math.floor(cl / 5));
    if (PRODUCERS.has(d.id)) n = Math.ceil(n * 0.6); // les bases ennemies gardent de l'espace pour les défenses
    if (d.id !== 'citadel') n = Math.max(d.category === 'defense' || d.id === 'army_camp' ? Math.min(1, n) : 0, Math.round(n * fill));
    for (let i = 0; i < n; i++) {
      const ring = d.id === 'citadel' ? 0 : d.category === 'defense' ? rng.range(2, coreR + 1) : INNER.has(d.id) ? rng.range(1, coreR) : OUTER.has(d.id) ? rng.range(coreR + 3, half - 1) : rng.range(coreR, half);
      list.push({ type: d.id, ring });
    }
  }
  // priorité : Citadelle, défenses, stockages, militaire, puis le reste (gros bâtiments d'abord à priorité égale)
  const prio = (t: string) => t === 'citadel' ? 0 : bdef(t).category === 'defense' ? 1 : INNER.has(t) ? 2 : bdef(t).category === 'military' ? 3 : PRODUCERS.has(t) ? 5 : 4;
  list.sort((a, b) => prio(a.type) - prio(b.type) || bdef(b.type).size - bdef(a.type).size);
  for (const it of list) {
    const size = bdef(it.type).size;
    const pos = findSpot(occ, size, it.ring, area, rng, C);
    if (!pos) continue;
    for (let dy = -1; dy <= size; dy++) for (let dx = -1; dx <= size; dx++) {
      const x: number = pos.x + dx, y: number = pos.y + dy;
      if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) continue;
      const i = y * MAP_SIZE + x;
      if (dx >= 0 && dy >= 0 && dx < size && dy < size) occ[i] = 1;
      else if (occ[i] === 0) occ[i] = 3;
    }
    out.push({ uid: uid++, type: it.type, level: lvl(it.type), x: pos.x, y: pos.y });
  }

  // ── 3. Pièges dans les allées ──
  for (const d of BUILDING_LIST) {
    if (d.category !== 'trap' || excl.has(d.id)) continue;
    const n = Math.round(maxCount(d.id, cl) * fill);
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 60; tries++) {
        const r = rng.range(2, half - 1), a = rng.range(0, Math.PI * 2);
        const x = Math.round(C + Math.cos(a) * r), y = Math.round(C + Math.sin(a) * r);
        let free = true;
        for (let dy = 0; dy < d.size && free; dy++) for (let dx = 0; dx < d.size; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < area.min || yy < area.min || xx >= area.max || yy >= area.max || (occ[yy * MAP_SIZE + xx] !== 0 && occ[yy * MAP_SIZE + xx] !== 3)) { free = false; break; }
        }
        if (!free) continue;
        for (let dy = 0; dy < d.size; dy++) for (let dx = 0; dx < d.size; dx++) occ[(y + dy) * MAP_SIZE + x + dx] = 1;
        out.push({ uid: uid++, type: d.id, level: lvl(d.id), x, y });
        break;
      }
    }
  }
  // ── 4. Quelques décorations naturelles ──
  for (let i = 0; i < 6; i++) {
    const x = rng.int(area.min, area.max - 1), y = rng.int(area.min, area.max - 1);
    if (occ[y * MAP_SIZE + x] === 0) { occ[y * MAP_SIZE + x] = 1; out.push({ uid: uid++, type: rng.chance(0.6) ? 'deco_pine' : 'deco_flowers', level: 1, x, y }); }
  }
  return { buildings: out, formation, citadel: cl };
}

function findSpot(occ: Int8Array, size: number, ring: number, area: { min: number; max: number }, rng: Rng, C: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bs = Infinity;
  for (let y = area.min; y <= area.max - size; y++) for (let x = area.min; x <= area.max - size; x++) {
    const cx = x + size / 2, cy = y + size / 2;
    const r = Math.max(Math.abs(cx - C), Math.abs(cy - C));
    const score = Math.abs(r - ring) + rng.next() * 1.5;
    if (score >= bs) continue;
    let ok = true;
    for (let dy = 0; dy < size && ok; dy++) for (let dx = 0; dx < size; dx++) if (occ[(y + dy) * MAP_SIZE + x + dx] !== 0) { ok = false; break; }
    if (ok) { best = { x, y }; bs = score; }
  }
  return best;
}

/** Butin disponible par bâtiment pour une base générée. */
export function generateLoot(base: BaseBuilding[], cl: number, rng: Rng, mult = 1): Record<number, Partial<Resources>> {
  const loot: Record<number, Partial<Resources>> = {};
  const pct = Math.max(0.08, 0.22 - cl * 0.009);
  for (const b of base) {
    const L = blevel(b.type, b.level);
    if (L.storage && b.type !== 'citadel') {
      const r: Partial<Resources> = {};
      for (const [k, v] of Object.entries(L.storage)) if (v) r[k as keyof Resources] = Math.floor(v * rng.range(0.35, 0.85) * pct * mult);
      loot[b.uid] = r;
    } else if (L.produces && L.capacity) {
      const r: Partial<Resources> = {};
      for (const p of L.produces) if (p.res !== 'crystals') r[p.res] = Math.floor(L.capacity * rng.range(0.2, 0.7) * 0.5 * mult);
      loot[b.uid] = r;
    } else if (b.type === 'citadel') {
      loot[b.uid] = { gold: Math.floor(500 * cl * cl * mult), wood: Math.floor(500 * cl * cl * mult), ...(cl >= 6 ? { energy: Math.floor(20 * cl * cl * mult) } : {}) };
    }
  }
  return loot;
}

export function totalLoot(loot: Record<number, Partial<Resources>>): Resources {
  const t: Resources = { gold: 0, wood: 0, energy: 0, crystals: 0 };
  for (const r of Object.values(loot)) for (const [k, v] of Object.entries(r)) t[k as keyof Resources] += v ?? 0;
  return t;
}

const SYL1 = ['Bel', 'Cor', 'Dra', 'Eld', 'Fen', 'Gal', 'Hav', 'Ith', 'Kar', 'Lum', 'Mor', 'Nor', 'Ost', 'Pyr', 'Quel', 'Rav', 'Syl', 'Tor', 'Ulm', 'Val', 'Wyn', 'Zan'];
const SYL2 = ['amar', 'dorn', 'ecia', 'fell', 'gard', 'heim', 'ion', 'lys', 'mere', 'nor', 'oth', 'rath', 'stead', 'thal', 'vane', 'wick'];
const TITLES = ['le Hardi', 'la Rusée', 'des Brumes', 'aux Mille Tours', 'le Prudent', 'l\'Indomptable', 'du Nord', 'de Braise', 'la Sage', 'le Bâtisseur'];
export function randomName(rng: Rng): string { return rng.pick(SYL1) + rng.pick(SYL2); }
export function randomLordName(rng: Rng): string { return `${randomName(rng)} ${rng.pick(TITLES)}`; }
