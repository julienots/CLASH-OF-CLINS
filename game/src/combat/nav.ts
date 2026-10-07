// Navigation terrestre : champs de distance (Dijkstra) partagés par cible.
// Les murs sont franchissables à un coût élevé : l'IA choisit entre contourner
// et percer, comme le ferait un joueur. Les champs sont invalidés à chaque
// destruction de bâtiment ou de mur.

import { MAP_SIZE } from '../core/state';
import type { SBuilding } from './sim';

const N = MAP_SIZE;
const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export class NavGrid {
  /** index bâtiment occupant la case (-1 = libre) */
  readonly owner: Int32Array;
  private buildings: SBuilding[];
  private version = 0;
  private cache = new Map<number, { v: number; at: number; f: Float32Array }>();
  fieldsComputed = 0;
  /** horloge (ticks) fournie par la simulation : limite la fréquence de recalcul */
  now = 0;

  constructor(buildings: SBuilding[]) {
    this.buildings = buildings;
    this.owner = new Int32Array(N * N).fill(-1);
    buildings.forEach((b, i) => {
      for (let dy = 0; dy < b.size; dy++) for (let dx = 0; dx < b.size; dx++) {
        const x = b.x + dx, y = b.y + dy;
        if (x >= 0 && y >= 0 && x < N && y < N) this.owner[y * N + x] = i;
      }
    });
  }

  onDestroyed(_b: SBuilding) { this.version++; }

  private cellState(i: number): 0 | 1 | 2 { // 0 libre, 1 mur, 2 bloqué
    const o = this.owner[i];
    if (o < 0) return 0;
    const b = this.buildings[o];
    if (!b.alive) return 0;
    return b.isWall ? 1 : 2;
  }

  walkable(x: number, y: number): boolean {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return false;
    return this.cellState(cy * N + cx) === 0;
  }

  field(targetIdx: number, target: SBuilding, jumps: boolean): Float32Array {
    const key = targetIdx * 2 + (jumps ? 1 : 0);
    const c = this.cache.get(key);
    // Un champ légèrement périmé (< 0,6 s) reste valide : les cases libérées ne font que raccourcir les chemins.
    if (c && (c.v === this.version || this.now - c.at < 6)) return c.f;
    const f = this.compute(target, targetIdx, jumps, c?.f);
    this.cache.set(key, { v: this.version, at: this.now, f });
    return f;
  }

  private compute(target: SBuilding, targetIdx: number, jumps: boolean, reuse?: Float32Array): Float32Array {
    this.fieldsComputed++;
    const dist = reuse ?? new Float32Array(N * N);
    dist.fill(Infinity);
    const heap = HEAP;
    heap.clear();
    for (let dy = 0; dy < target.size; dy++) for (let dx = 0; dx < target.size; dx++) {
      const x = target.x + dx, y = target.y + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      dist[i] = 0; heap.push(i, 0);
    }
    while (heap.size) {
      const d = heap.topVal();
      const i = heap.pop();
      if (d > dist[i]) continue;
      const x = i % N, y = (i / N) | 0;
      for (let k = 0; k < 8; k++) {
        const dx = DX[k], dy = DY[k], base = DC[k];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ni = ny * N + nx;
        const st = this.owner[ni] === targetIdx ? 0 : this.cellState(ni);
        if (st === 2) continue;
        if (dx && dy) {
          // pas de passage en diagonale entre deux obstacles (évite les fuites entre murs)
          const a = this.owner[y * N + nx] === targetIdx ? 0 : this.cellState(y * N + nx);
          const b = this.owner[ny * N + x] === targetIdx ? 0 : this.cellState(ny * N + x);
          if (a || b) continue;
        }
        let cost = base;
        if (st === 1 && !jumps) {
          const w = this.buildings[this.owner[ni]];
          cost += Math.min(40, 6 + w.hp / 120);
        }
        const nd = d + cost;
        if (nd < dist[ni]) { dist[ni] = nd; heap.push(ni, nd); }
      }
    }
    return dist;
  }

  /** Prochaine étape (centre de case) vers la cible + mur bloquant éventuel. */
  nextStep(x: number, y: number, targetIdx: number, target: SBuilding, jumps: boolean): { x: number; y: number; wall: number } {
    const f = this.field(targetIdx, target, jumps);
    const cx = Math.max(0, Math.min(N - 1, Math.floor(x))), cy = Math.max(0, Math.min(N - 1, Math.floor(y)));
    const here = f[cy * N + cx];
    let best = -1, bv = here === Infinity ? Infinity : here;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const v = f[ny * N + nx];
      if (v < bv - 1e-6) { bv = v; best = ny * N + nx; }
    }
    if (best < 0) return { x: target.cx, y: target.cy, wall: -1 };
    const o = this.owner[best];
    const wall = o >= 0 && this.buildings[o].alive && this.buildings[o].isWall && o !== targetIdx ? o : -1;
    // vise le centre de la case suivante, en lissant vers la cible quand la voie est libre
    return { x: (best % N) + 0.5, y: ((best / N) | 0) + 0.5, wall };
  }

  /** Premier mur rencontré en suivant le gradient (pour les ingénieurs). */
  firstWallOnPath(x: number, y: number, targetIdx: number, target: SBuilding): number {
    const f = this.field(targetIdx, target, false);
    let cx = Math.floor(x), cy = Math.floor(y);
    for (let s = 0; s < 80; s++) {
      const here = f[cy * N + cx];
      if (here === 0) return -1;
      let best = -1, bv = here;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const v = f[ny * N + nx];
        if (v < bv) { bv = v; best = ny * N + nx; }
      }
      if (best < 0) return -1;
      const o = this.owner[best];
      if (o >= 0 && o !== targetIdx && this.buildings[o].alive && this.buildings[o].isWall) return o;
      cx = best % N; cy = (best / N) | 0;
    }
    return -1;
  }
}

const DX = DIRS.map(d => d[0]), DY = DIRS.map(d => d[1]), DC = DIRS.map(d => d[2]);

/** Tas binaire sur tableaux typés (aucune allocation pendant le calcul). */
class MinHeap {
  private k = new Int32Array(N * N * 8);
  private v = new Float32Array(N * N * 8);
  size = 0;
  clear() { this.size = 0; }
  topVal() { return this.v[0]; }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= val) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop(): number {
    const k = this.k, v = this.v;
    const top = k[0];
    const n = --this.size;
    if (n > 0) {
      const lk = k[n], lv = v[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && v[r] < v[l] ? r : l;
        if (v[m] >= lv) break;
        k[i] = k[m]; v[i] = v[m];
        i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}
const HEAP = new MinHeap();
