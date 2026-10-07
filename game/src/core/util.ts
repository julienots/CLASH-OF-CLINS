import type { Cost, ResKey, Resources } from './types';
import { RES_KEYS } from './types';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt(dist2(ax, ay, bx, by));

export function emptyRes(): Resources { return { gold: 0, wood: 0, energy: 0, crystals: 0 }; }

export function canAfford(res: Resources, cost: Cost): boolean {
  for (const k of RES_KEYS) if ((cost[k] ?? 0) > res[k] + 1e-9) return false;
  return true;
}
export function missing(res: Resources, cost: Cost): Cost {
  const m: Cost = {};
  for (const k of RES_KEYS) { const d = (cost[k] ?? 0) - res[k]; if (d > 0) m[k] = Math.ceil(d); }
  return m;
}
export function scaleCost(c: Cost, f: number): Cost {
  const o: Cost = {};
  for (const k of Object.keys(c) as ResKey[]) o[k] = Math.round((c[k] ?? 0) * f);
  return o;
}
export function costIsZero(c: Cost) { return RES_KEYS.every(k => !c[k]); }

/** Arrondi "lisible" d'un nombre de jeu (ex: 12 347 -> 12 300). */
export function nice(n: number): number {
  if (n < 100) return Math.round(n);
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

export function fmt(n: number): string {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' G';
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' M';
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  if (sec < 60) return sec + 's';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
