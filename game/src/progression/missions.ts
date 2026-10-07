// Missions quotidiennes et saisonnières (alimentent le Royal Pass).
import type { GameState } from '../core/state';
import { fail, ok, type ActionResult } from '../core/types';
import { Rng } from '../core/rng';
import { dayIndex } from '../events/events';
import { addPassXp } from '../battlepass/pass';
import { ACHIEVEMENTS, achievementProgress } from './progression';

export type MissionKind = 'collect' | 'win' | 'stars' | 'train' | 'upgrade' | 'spell' | 'donate' | 'campaign' | 'invasion' | 'destroy';
export interface MissionDef { id: string; kind: MissionKind; text: string; goal: number; xp: number; crystals?: number }

const DAILY_POOL: MissionDef[] = [
  { id: 'd_collect', kind: 'collect', text: 'Récolter 5 000 ressources', goal: 5000, xp: 150 },
  { id: 'd_win', kind: 'win', text: 'Remporter 2 attaques', goal: 2, xp: 200 },
  { id: 'd_stars', kind: 'stars', text: 'Gagner 5 étoiles', goal: 5, xp: 200 },
  { id: 'd_train', kind: 'train', text: 'Entraîner 40 unités', goal: 40, xp: 120 },
  { id: 'd_upgrade', kind: 'upgrade', text: 'Lancer 2 constructions', goal: 2, xp: 150 },
  { id: 'd_spell', kind: 'spell', text: 'Lancer 3 sorts en combat', goal: 3, xp: 150 },
  { id: 'd_donate', kind: 'donate', text: 'Faire 5 dons à la guilde', goal: 5, xp: 150 },
  { id: 'd_destroy', kind: 'destroy', text: 'Détruire 40 bâtiments', goal: 40, xp: 150 },
  { id: 'd_campaign', kind: 'campaign', text: 'Jouer 1 niveau de campagne', goal: 1, xp: 120 },
];
export const SEASON_MISSIONS: MissionDef[] = [
  { id: 's_win', kind: 'win', text: 'Remporter 25 attaques', goal: 25, xp: 1000, crystals: 25 },
  { id: 's_stars', kind: 'stars', text: 'Gagner 75 étoiles', goal: 75, xp: 1200, crystals: 25 },
  { id: 's_invasion', kind: 'invasion', text: 'Repousser 5 invasions', goal: 5, xp: 1000, crystals: 25 },
  { id: 's_upgrade', kind: 'upgrade', text: 'Lancer 30 constructions', goal: 30, xp: 1000, crystals: 25 },
  { id: 's_donate', kind: 'donate', text: 'Faire 100 dons', goal: 100, xp: 800, crystals: 20 },
  { id: 's_collect', kind: 'collect', text: 'Récolter 500 000 ressources', goal: 500000, xp: 1200, crystals: 25 },
];
export function missionDef(id: string): MissionDef | undefined { return [...DAILY_POOL, ...SEASON_MISSIONS].find(m => m.id === id); }

export function syncMissions(s: GameState, now: number) {
  const d = dayIndex(now);
  if (s.missions.day === d && s.missions.daily.length) return;
  const rng = new Rng(d * 131 + 7);
  const pool = rng.shuffle([...DAILY_POOL]).slice(0, 3);
  s.missions.day = d;
  s.missions.daily = pool.map(m => ({ id: m.id, progress: 0, claimed: false }));
}

export function progressMission(s: GameState, kind: MissionKind, amount: number) {
  if (amount <= 0) return;
  for (const m of s.missions.daily) { const d = missionDef(m.id); if (d?.kind === kind && !m.claimed) m.progress = Math.min(d.goal, m.progress + amount); }
  for (const d of SEASON_MISSIONS) if (d.kind === kind) {
    const st = s.missions.season[d.id] ?? (s.missions.season[d.id] = { progress: 0, claimed: false });
    if (!st.claimed) st.progress = Math.min(d.goal, st.progress + amount);
  }
}

export function claimMission(s: GameState, id: string): ActionResult<number> {
  const d = missionDef(id);
  if (!d) return fail('Mission inconnue');
  const st = s.missions.daily.find(m => m.id === id) ?? s.missions.season[id];
  if (!st) return fail('Mission inactive');
  if (st.claimed) return fail('Déjà récupérée');
  if (st.progress < d.goal) return fail('Mission incomplète');
  st.claimed = true;
  addPassXp(s, d.xp);
  if (d.crystals) s.resources.crystals += d.crystals;
  return ok(d.xp);
}

export function claimAchievement(s: GameState, id: string): ActionResult<number> {
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return fail('Succès inconnu');
  const st = s.achievements[id] ?? (s.achievements[id] = { progress: 0, claimedTier: 0 });
  const tier = st.claimedTier;
  if (tier >= a.tiers.length) return fail('Terminé');
  if (achievementProgress(s, a) < a.tiers[tier]) return fail('Objectif non atteint');
  st.claimedTier++;
  s.resources.crystals += a.reward[tier];
  return ok(a.reward[tier]);
}
