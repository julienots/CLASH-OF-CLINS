// Création de partie et avancement du temps (y compris progression hors-ligne).
import { MAP_SIZE, SAVE_VERSION, type GameState } from './state';
import type { Resources } from './types';
import { RES_KEYS } from './types';
import { accrue } from '../resources/economy';
import { completeLevel } from '../buildings/construction';
import { advanceTraining } from '../army/army';
import { completeResearch } from '../research/research';
import { completeHeroUpgrade, syncHeroes } from '../heroes/heroes';
import { bdef } from '../buildings/defs';
import { mods } from '../village/query';
import { currentSeason } from '../events/events';
import { hashString } from './rng';

export function newGame(now: number, name = 'Souverain', seed?: number): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    createdAt: now,
    lastTick: now,
    seed: seed ?? (hashString(name + now) >>> 0),
    player: {
      id: 'p_' + (hashString(name + now + Math.random()) >>> 0).toString(36), name, xp: 0, level: 1, trophies: 0, bestTrophies: 0, region: 'Europe',
      tutorialStep: 0, tutorialDone: false, leagueId: 0, shieldUntil: now + 3 * 86400000,
      stats: { attacksWon: 0, attacksLost: 0, defensesWon: 0, defensesLost: 0, unitsTrained: 0, buildingsBuilt: 0, goldLooted: 0, woodLooted: 0, starsTotal: 0, spellsCast: 0, invasionsRepelled: 0, donations: 0 },
    },
    resources: { gold: 1000, wood: 1000, energy: 0, crystals: 250 },
    buildings: [],
    nextUid: 1,
    army: { units: { soldier: 10 }, spells: {}, queue: [], spellQueue: [], guildTroops: {} },
    research: { levels: {}, tech: {} },
    heroes: {},
    inventory: { equipment: [], cosmetics: [], emotes: ['emote_wave'], theme: 'classic', effects: [] },
    campaign: { stars: {} },
    world: { discovered: ['vale'], claimedSites: {} },
    guild: null,
    war: null,
    warHistory: [],
    pass: { season: currentSeason(now).index, xp: 0, premium: false, claimedFree: [], claimedPremium: [] },
    missions: { day: 0, daily: [], season: {} },
    achievements: {},
    shop: { purchases: {}, pendingTokens: [], dailyDealDay: 0, tokens: [], dealBought: -1 },
    events: { lastInvasionAt: 0, invasionsDone: {}, festivalClaimed: {} },
    log: [],
    settings: { music: 0.6, sfx: 0.8, quality: 'medium', vibration: true, showFps: false, language: 'fr' },
  };
  const c = MAP_SIZE / 2;
  const put = (type: string, x: number, y: number, level = 1) => {
    s.buildings.push({ uid: s.nextUid++, type, level, x, y, rot: 0, ...(bdef(type).levels[0].produces ? { stored: {} } : {}) });
  };
  put('citadel', c - 2, c - 2);
  put('builder_hut', c - 7, c - 7);
  put('builder_hut', c + 5, c - 7);
  put('gold_mine', c + 4, c - 1);
  put('sawmill', c - 7, c - 1);
  put('gold_vault', c - 1, c + 4);
  put('wood_depot', c - 1, c - 7);
  put('army_camp', c + 5, c + 5);
  put('cannon', c - 6, c + 4);
  // décor naturel
  for (const [x, y] of [[c - 12, c - 10], [c + 11, c - 11], [c - 11, c + 10], [c + 10, c + 11], [c + 12, c + 2]]) put('deco_pine', x, y);
  return s;
}

/**
 * Fait avancer l'état jusqu'à `now`. Les fins de chantier/recherche sont appliquées
 * dans l'ordre chronologique et la production est calculée segment par segment,
 * de sorte que le résultat est identique que le jeu tourne en continu ou non.
 */
export function advance(s: GameState, now: number, opts: { report?: boolean } = {}): void {
  if (!(now > s.lastTick)) { s.lastTick = Math.max(s.lastTick, Math.min(now, s.lastTick)); return; }
  const start = s.lastTick;
  const before: Resources = { ...s.resources };
  const storedBefore = totalStored(s);
  const completed: string[] = [];
  // Production hors-ligne plafonnée (24 h + bonus technologique)
  const capMs = (24 + mods(s).offlineCap) * 3600000;
  let t = start;
  let guard = 0;
  while (t < now && guard++ < 10000) {
    let next = now;
    for (const b of s.buildings) if (b.build && b.build.endAt > t && b.build.endAt < next) next = b.build.endAt;
    for (const b of s.buildings) if (b.build && b.build.endAt <= t) next = t; // déjà échu
    if (s.research.active && s.research.active.endAt < next) next = Math.max(t, s.research.active.endAt);
    for (const h of Object.values(s.heroes)) if (h.upgradeEndAt && h.upgradeEndAt < next) next = Math.max(t, h.upgradeEndAt);
    const dt = (next - t) / 1000;
    if (dt > 0) {
      const prodDt = Math.max(0, Math.min(next, start + capMs) - Math.max(t, start)) / 1000;
      for (const b of s.buildings) accrue(s, b, prodDt, t);
      advanceTraining(s, dt);
    }
    t = next;
    for (const b of s.buildings) if (b.build && b.build.endAt <= t) {
      const to = b.build.toLevel;
      completeLevel(s, b, to, b.build.endAt);
      completed.push(`${bdef(b.type).name} niv. ${to}`);
    }
    if (s.research.active && s.research.active.endAt <= t) { completed.push('Recherche terminée'); completeResearch(s); }
    for (const [id, h] of Object.entries(s.heroes)) if (h.upgradeEndAt && h.upgradeEndAt <= t) { completeHeroUpgrade(s, id); completed.push(`Héros ${id} amélioré`); }
  }
  syncHeroes(s);
  s.lastTick = now;
  sanitize(s);
  if (opts.report && now - start > 5 * 60000) {
    const gained: Partial<Resources> = {};
    const storedAfter = totalStored(s);
    for (const k of RES_KEYS) {
      const g = Math.floor(s.resources[k] - before[k] + (storedAfter[k] - storedBefore[k]));
      if (g > 0) gained[k] = g;
    }
    s.offlineReport = { seconds: Math.floor((now - start) / 1000), gained, completed };
  }
}

function totalStored(s: GameState): Resources {
  const r: Resources = { gold: 0, wood: 0, energy: 0, crystals: 0 };
  for (const b of s.buildings) if (b.stored) for (const k of RES_KEYS) r[k] += b.stored[k] ?? 0;
  return r;
}

/** Garde-fou : aucune ressource négative ou non finie ne doit jamais persister. */
export function sanitize(s: GameState) {
  for (const k of RES_KEYS) {
    const v = s.resources[k];
    if (!Number.isFinite(v) || v < 0) s.resources[k] = 0;
  }
  for (const b of s.buildings) if (b.stored) for (const k of RES_KEYS) {
    const v = b.stored[k];
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) b.stored[k] = 0;
  }
  for (const [k, v] of Object.entries(s.army.units)) if (!Number.isFinite(v) || v < 0) s.army.units[k] = 0;
}
