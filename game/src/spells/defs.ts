// Sorts de combat préparés à l'Académie des Arcanes.
import type { Cost } from '../core/types';
import { nice } from '../core/util';

export interface SpellDef {
  id: string; name: string; desc: string; icon: string; color: string;
  housing: number; academy: number; cost: Cost; brewTime: number;
  radius: number; duration: number; cooldown: number; // cooldown entre deux lancers du même sort
  power: number; maxLevel: number;
}

export const SPELLS: SpellDef[] = [
  { id: 'lightning', name: 'Foudre', icon: '⚡', color: '#fff176', desc: '3 éclairs foudroyants sur la zone.', housing: 1, academy: 1, cost: { wood: 2500 }, brewTime: 120, radius: 2, duration: 0.6, cooldown: 2, power: 150, maxLevel: 8 },
  { id: 'heal', name: 'Soin', icon: '✚', color: '#69f0ae', desc: 'Soigne les troupes dans la zone pendant 10 s.', housing: 1, academy: 2, cost: { wood: 3500 }, brewTime: 150, radius: 3.5, duration: 10, cooldown: 3, power: 25, maxLevel: 7 },
  { id: 'rage', name: 'Rage', icon: '🔥', color: '#ea80fc', desc: '+40 % vitesse et +80 % dégâts pendant 12 s.', housing: 1, academy: 3, cost: { wood: 4500 }, brewTime: 180, radius: 3.5, duration: 12, cooldown: 3, power: 0.8, maxLevel: 6 },
  { id: 'freeze', name: 'Gel', icon: '❄️', color: '#80d8ff', desc: 'Fige défenses et ennemis pendant 4 s.', housing: 1, academy: 4, cost: { wood: 6000, energy: 50 }, brewTime: 200, radius: 3, duration: 4, cooldown: 4, power: 4, maxLevel: 6 },
  { id: 'shield', name: 'Bouclier', icon: '🛡️', color: '#ffe57f', desc: 'Les troupes de la zone absorbent 300 dégâts.', housing: 1, academy: 5, cost: { wood: 7000, energy: 60 }, brewTime: 220, radius: 3, duration: 15, cooldown: 4, power: 300, maxLevel: 6 },
  { id: 'meteor', name: 'Météore', icon: '☄️', color: '#ff6e40', desc: 'Un météore s\'écrase : énormes dégâts et détruit les murs.', housing: 2, academy: 6, cost: { wood: 12000, energy: 150 }, brewTime: 300, radius: 2.5, duration: 1.2, cooldown: 6, power: 700, maxLevel: 5 },
  { id: 'teleport', name: 'Téléportation', icon: '🌀', color: '#b388ff', desc: 'Rappelle jusqu\'à 8 de vos troupes les plus éloignées vers la zone.', housing: 2, academy: 7, cost: { wood: 15000, energy: 200 }, brewTime: 300, radius: 2, duration: 0.8, cooldown: 6, power: 8, maxLevel: 4 },
];

export function sdef(id: string): SpellDef {
  const s = SPELLS.find(s => s.id === id);
  if (!s) throw new Error('Sort inconnu: ' + id);
  return s;
}
export function spellPower(id: string, level: number): number {
  const s = sdef(id);
  if (id === 'teleport') return s.power + (level - 1) * 2;
  if (id === 'freeze') return s.power + (level - 1) * 0.5;
  if (id === 'rage') return s.power + (level - 1) * 0.1;
  return s.power * Math.pow(1.18, level - 1);
}
export function spellResearchCost(id: string, toLevel: number): { cost: Cost; time: number; labLevel: number } {
  const s = sdef(id);
  return {
    cost: { wood: nice(20000 * s.academy * Math.pow(1.9, toLevel - 2)), ...(toLevel >= 4 ? { energy: nice(1000 * Math.pow(1.7, toLevel - 4)) } : {}) },
    time: Math.min(14 * 3600, Math.round(1200 * Math.pow(2, toLevel - 2))),
    labLevel: Math.min(10, Math.max(2, Math.ceil(s.academy / 1.4 + toLevel))),
  };
}
