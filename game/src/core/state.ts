// Structure complète de l'état d'une partie (sérialisée telle quelle).
import type { Resources, Quality } from './types';

export const MAP_SIZE = 44;          // taille de la carte de village (cases)
export const SAVE_VERSION = 4;

export interface Construction { toLevel: number; startAt: number; endAt: number }

export interface BuildingInstance {
  uid: number;
  type: string;
  level: number;          // 0 = en construction initiale
  x: number;
  y: number;
  rot: 0 | 1;             // orientation visuelle (murs, décorations)
  build?: Construction;
  stored?: Partial<Resources>; // ressources accumulées (producteurs)
  skin?: string;
}

export interface QueueItem { id: string; kind: 'unit' | 'spell'; progress: number } // progress en secondes

export interface HeroState {
  level: number;
  upgradeEndAt?: number;
  equipment: string[];      // 2 emplacements
  skin: string;
}

export interface GuildMember { id: string; name: string; trophies: number; role: 'chef' | 'adjoint' | 'ancien' | 'membre'; citadel: number; donations: number; bot: boolean }
export interface ChatMsg { from: string; text: string; at: number; system?: boolean }
export interface GuildState {
  id: string; name: string; emblem: string; desc: string; level: number; xp: number;
  members: GuildMember[]; chat: ChatMsg[]; requestAt?: number; donatedToday: number; lastDonationDay: number;
  invites: string[];
}

export interface WarBase { memberId: string; name: string; citadel: number; seed: number; stars: number; destruction: number; attacked: boolean }
export interface WarState {
  id: string; enemyName: string; enemyEmblem: string;
  phase: 'preparation' | 'battle' | 'ended';
  phaseEndAt: number; prepEndAt: number; battleEndAt: number;
  ours: WarBase[]; theirs: WarBase[];
  attacksLeft: number;
  ourStars: number; theirStars: number; ourDestruction: number; theirDestruction: number;
  result?: 'victory' | 'defeat' | 'draw'; rewardClaimed?: boolean;
  log: string[];
  schedule: { at: number; side: 'ours' | 'theirs'; attacker: number; target: number; done: boolean }[];
}

export interface DefenseLog { at: number; attacker: string; stars: number; destruction: number; lost: Partial<Resources>; trophies: number; kind: 'pvp' | 'invasion' }

export interface Settings { music: number; sfx: number; quality: Quality; vibration: boolean; showFps: boolean; language: 'fr' | 'en' }

export interface GameState {
  version: number;
  createdAt: number;
  lastTick: number;
  seed: number;
  player: {
    id: string; name: string; xp: number; level: number; trophies: number; bestTrophies: number; region: string;
    tutorialStep: number; tutorialDone: boolean; leagueId: number;
    stats: { attacksWon: number; attacksLost: number; defensesWon: number; defensesLost: number; unitsTrained: number; buildingsBuilt: number; goldLooted: number; woodLooted: number; starsTotal: number; spellsCast: number; invasionsRepelled: number; donations: number };
    shieldUntil: number;
  };
  resources: Resources;
  buildings: BuildingInstance[];
  nextUid: number;
  army: { units: Record<string, number>; spells: Record<string, number>; queue: QueueItem[]; spellQueue: QueueItem[]; guildTroops: Record<string, number> };
  research: { levels: Record<string, number>; tech: Record<string, boolean>; active?: { id: string; kind: 'unit' | 'spell' | 'tech'; toLevel: number; endAt: number } };
  heroes: Record<string, HeroState>;
  inventory: { equipment: string[]; cosmetics: string[]; emotes: string[]; theme: string; effects: string[]; activeEffect?: string; citadelSkin?: string };
  campaign: { stars: Record<number, number> };
  world: { discovered: string[]; claimedSites: Record<string, number> };
  guild: GuildState | null;
  war: WarState | null;
  warHistory: { enemy: string; result: string; at: number }[];
  pass: { season: number; xp: number; premium: boolean; claimedFree: number[]; claimedPremium: number[] };
  missions: { day: number; daily: { id: string; progress: number; claimed: boolean }[]; season: Record<string, { progress: number; claimed: boolean }> };
  achievements: Record<string, { progress: number; claimedTier: number }>;
  shop: { purchases: Record<string, number>; pendingTokens: string[]; dailyDealDay: number; tokens: string[]; dealBought: number };
  events: { lastInvasionAt: number; invasionsDone: Record<string, boolean>; festivalClaimed: Record<string, boolean> };
  log: DefenseLog[];
  settings: Settings;
  offlineReport?: { seconds: number; gained: Partial<Resources>; completed: string[] };
  checksum?: string;
}
