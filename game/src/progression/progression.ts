// Expérience, niveaux de joueur, succès et contenu débloqué par la Citadelle.
import type { GameState } from '../core/state';
import { BUILDING_LIST, maxCount, maxLevelFor } from '../buildings/defs';
import { TRAINABLE } from '../units/defs';
import { SPELLS } from '../spells/defs';
import { HEROES } from '../heroes/defs';
import { buildArea } from '../village/grid';

export function xpForLevel(level: number): number { return 30 + level * 20 + level * level * 4; }

export function addXp(s: GameState, xp: number) {
  s.player.xp += Math.max(0, Math.floor(xp));
  while (s.player.xp >= xpForLevel(s.player.level)) {
    s.player.xp -= xpForLevel(s.player.level);
    s.player.level++;
  }
}

export function xpForSeconds(sec: number): number { return Math.max(1, Math.floor(Math.sqrt(sec))); }

// ───── Succès ─────
export interface AchievementDef { id: string; name: string; desc: string; stat: keyof GameState['player']['stats'] | 'campaignStars' | 'citadel'; tiers: number[]; reward: number[] }
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'builder', name: 'Bâtisseur', desc: 'Construire ou améliorer des bâtiments', stat: 'buildingsBuilt', tiers: [10, 75, 300], reward: [10, 50, 200] },
  { id: 'conqueror', name: 'Conquérant', desc: 'Remporter des attaques', stat: 'attacksWon', tiers: [5, 50, 250], reward: [10, 50, 200] },
  { id: 'gold_looter', name: 'Pilleur d\'or', desc: 'Piller de l\'or', stat: 'goldLooted', tiers: [20000, 1000000, 20000000], reward: [10, 50, 200] },
  { id: 'guardian', name: 'Gardien', desc: 'Repousser des attaques et invasions', stat: 'defensesWon', tiers: [3, 30, 200], reward: [10, 50, 200] },
  { id: 'strategist', name: 'Stratège', desc: 'Gagner des étoiles de campagne', stat: 'campaignStars', tiers: [10, 45, 90], reward: [20, 60, 250] },
  { id: 'arcanist', name: 'Arcaniste', desc: 'Lancer des sorts', stat: 'spellsCast', tiers: [10, 100, 600], reward: [10, 40, 150] },
  { id: 'recruiter', name: 'Recruteur', desc: 'Entraîner des unités', stat: 'unitsTrained', tiers: [100, 2500, 25000], reward: [10, 50, 200] },
  { id: 'patron', name: 'Mécène', desc: 'Faire des dons à la guilde', stat: 'donations', tiers: [25, 300, 3000], reward: [10, 50, 200] },
  { id: 'sovereign', name: 'Souverain', desc: 'Améliorer la Citadelle', stat: 'citadel', tiers: [5, 10, 15], reward: [25, 100, 500] },
];

export function achievementProgress(s: GameState, a: AchievementDef): number {
  if (a.stat === 'campaignStars') return Object.values(s.campaign.stars).reduce((x, y) => x + y, 0);
  if (a.stat === 'citadel') return s.buildings.find(b => b.type === 'citadel')?.level ?? 1;
  return s.player.stats[a.stat] as number;
}

// ───── Contenu débloqué par niveau de Citadelle ─────
export function citadelUnlocks(cl: number): string[] {
  const out: string[] = [];
  if (cl > 1) {
    for (const d of BUILDING_LIST) {
      if (d.category === 'decoration' && !d.crystalPrice && maxCount(d.id, cl) > 0 && maxCount(d.id, cl - 1) === 0) { out.push(`Décoration : ${d.name}`); continue; }
      if (d.category === 'decoration') continue;
      const a = maxCount(d.id, cl - 1), b = maxCount(d.id, cl);
      if (a === 0 && b > 0) out.push(`Nouveau : ${d.name}`);
      else if (b > a && d.id !== 'builder_hut') out.push(`+${b - a} ${d.name}`);
      const la = maxLevelFor(d.id, cl - 1), lb = maxLevelFor(d.id, cl);
      if (a > 0 && lb > la && ['barracks', 'academy', 'workshop', 'temple'].includes(d.id)) out.push(`${d.name} niveau ${lb}`);
    }
    const ba = buildArea(cl - 1), bb = buildArea(cl);
    if (bb.max - bb.min > ba.max - ba.min) out.push(`Nouvelle zone : territoire ${bb.max - bb.min}×${bb.max - bb.min}`);
    const brA = maxLevelFor('barracks', cl - 1), brB = maxLevelFor('barracks', cl);
    for (const u of TRAINABLE) if (u.building === 'barracks' && u.unlockLevel > brA && u.unlockLevel <= brB) out.push(`Unité : ${u.name}`);
    const acA = maxLevelFor('academy', cl - 1), acB = maxLevelFor('academy', cl);
    for (const sp of SPELLS) if (sp.academy > acA && sp.academy <= acB) out.push(`Sort : ${sp.name}`);
    for (const h of HEROES) if (h.citadel === cl) out.push(`Héros : ${h.name}`);
    if (cl === 13) out.push('La Citadelle riposte : Couronne de garde (éclairs en chaîne)');
    if (cl === 15) out.push('Titre de Souverain légendaire · Couronne de garde niveau max');
    const wA = maxLevelFor('workshop', cl - 1), wB = maxLevelFor('workshop', cl);
    for (const u of TRAINABLE) if (u.building === 'workshop' && u.unlockLevel > wA && u.unlockLevel <= wB) out.push(`Engin : ${u.name}`);
  }
  return out;
}
