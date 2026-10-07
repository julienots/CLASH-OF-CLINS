// Sauvegarde versionnée : sérialisation, somme de contrôle, migrations, réparation.
import { SAVE_VERSION, type GameState } from '../core/state';
import { hashString } from '../core/rng';
import { newGame, sanitize } from '../core/game';
import { BUILDINGS } from '../buildings/defs';
import { UNITS } from '../units/defs';
import { RES_KEYS } from '../core/types';

export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const SAVE_KEY = 'kingdoms.save';
export const BACKUP_KEY = 'kingdoms.save.bak';

function checksum(json: string): string { return (hashString(json) >>> 0).toString(16); }

export function serialize(s: GameState): string {
  const copy = { ...s, checksum: undefined };
  const body = JSON.stringify(copy);
  return JSON.stringify({ v: SAVE_VERSION, c: checksum(body), d: body });
}

export type LoadResult = { state: GameState; status: 'ok' | 'migrated' | 'recovered' | 'new' };

export function deserialize(raw: string): GameState | null {
  try {
    const wrap = JSON.parse(raw);
    if (!wrap || typeof wrap.d !== 'string') return null;
    if (checksum(wrap.d) !== wrap.c) return null; // sauvegarde corrompue
    const s = JSON.parse(wrap.d);
    return migrate(s);
  } catch {
    return null;
  }
}

// ───── Migrations ─────
type Migration = (s: any) => void;
const MIGRATIONS: Record<number, Migration> = {
  // v1 -> v2 : ajout des héros et de l'inventaire
  1: s => { s.heroes = s.heroes ?? {}; s.inventory = s.inventory ?? { equipment: [], cosmetics: [], emotes: [], theme: 'classic', effects: [] }; },
  // v2 -> v3 : ajout du Royal Pass et des missions
  2: s => { s.pass = s.pass ?? { season: 1, xp: 0, premium: false, claimedFree: [], claimedPremium: [] }; s.missions = s.missions ?? { day: 0, daily: [], season: {} }; },
  // v3 -> v4 : renommage "food" -> énergie, ajout des troupes de guilde et des événements
  3: s => {
    if (s.resources && 'food' in s.resources) { s.resources.energy = (s.resources.energy ?? 0) + s.resources.food; delete s.resources.food; }
    s.army.guildTroops = s.army.guildTroops ?? {};
    s.events = s.events ?? { lastInvasionAt: 0, invasionsDone: {}, festivalClaimed: {} };
    s.warHistory = s.warHistory ?? [];
  },
};

export function migrate(s: any): GameState {
  let v = typeof s.version === 'number' ? s.version : 1;
  while (v < SAVE_VERSION) {
    MIGRATIONS[v]?.(s);
    v++;
  }
  s.version = SAVE_VERSION;
  return repair(s);
}

/** Répare une sauvegarde structurellement incomplète en complétant avec les valeurs par défaut. */
export function repair(s: any): GameState {
  const base = newGame(s.createdAt ?? Date.now(), s.player?.name ?? 'Souverain', s.seed);
  for (const k of Object.keys(base) as (keyof GameState)[]) if (s[k] === undefined) s[k] = (base as any)[k];
  for (const k of Object.keys(base.player)) if (s.player[k] === undefined) s.player[k] = (base.player as any)[k];
  for (const k of Object.keys(base.player.stats)) if (s.player.stats[k] === undefined) s.player.stats[k] = 0;
  for (const k of RES_KEYS) if (typeof s.resources[k] !== 'number') s.resources[k] = 0;
  for (const k of Object.keys(base.settings)) if (s.settings[k] === undefined) s.settings[k] = (base.settings as any)[k];
  for (const k of Object.keys(base.army)) if (s.army[k] === undefined) s.army[k] = (base.army as any)[k];
  for (const k of Object.keys(base.inventory)) if (s.inventory[k] === undefined) s.inventory[k] = (base.inventory as any)[k];
  for (const k of Object.keys(base.shop)) if (s.shop[k] === undefined) s.shop[k] = (base.shop as any)[k];
  // supprime les bâtiments / unités inconnus (contenu retiré)
  s.buildings = (s.buildings ?? []).filter((b: any) => b && BUILDINGS[b.type] && Number.isFinite(b.x) && Number.isFinite(b.y));
  if (!s.buildings.some((b: any) => b.type === 'citadel')) s.buildings.push(base.buildings[0]);
  const uids = new Set<number>();
  let maxUid = 0;
  for (const b of s.buildings) {
    if (uids.has(b.uid) || !Number.isInteger(b.uid)) b.uid = 0;
    uids.add(b.uid); maxUid = Math.max(maxUid, b.uid);
    b.level = Math.max(0, Math.min(BUILDINGS[b.type].levels.length, b.level | 0));
    if (b.level === 0 && !b.build) b.level = 1;
  }
  for (const b of s.buildings) if (!b.uid) b.uid = ++maxUid;
  s.nextUid = Math.max(s.nextUid ?? 1, maxUid + 1);
  for (const id of Object.keys(s.army.units)) if (!UNITS[id]) delete s.army.units[id];
  s.army.queue = (s.army.queue ?? []).filter((q: any) => UNITS[q.id]);
  sanitize(s);
  return s as GameState;
}

export class SaveManager {
  constructor(private store: StorageBackend) {}

  save(s: GameState) {
    const data = serialize(s);
    const prev = this.store.get(SAVE_KEY);
    if (prev) this.store.set(BACKUP_KEY, prev);
    this.store.set(SAVE_KEY, data);
  }

  load(now: number): LoadResult {
    const raw = this.store.get(SAVE_KEY);
    if (raw) {
      const wrapV = safeVersion(raw);
      const s = deserialize(raw);
      if (s) return { state: s, status: wrapV < SAVE_VERSION ? 'migrated' : 'ok' };
    }
    const bak = this.store.get(BACKUP_KEY);
    if (bak) {
      const s = deserialize(bak);
      if (s) return { state: s, status: 'recovered' };
    }
    return { state: newGame(now), status: 'new' };
  }

  reset() { this.store.remove(SAVE_KEY); this.store.remove(BACKUP_KEY); }
}

function safeVersion(raw: string): number {
  try { const w = JSON.parse(raw); const d = JSON.parse(w.d); return d.version ?? 1; } catch { return 0; }
}

export const memoryStorage = (): StorageBackend => {
  const m = new Map<string, string>();
  return { get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: k => void m.delete(k) };
};
