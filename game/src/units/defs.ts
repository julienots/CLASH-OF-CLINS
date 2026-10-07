// Unités originales de KINGDOMS.
import type { Cost } from '../core/types';
import { nice } from '../core/util';

export type TargetPref = 'any' | 'defense' | 'resource' | 'wall' | 'citadel';

export interface UnitDef {
  id: string;
  name: string;
  desc: string;
  role: string;
  housing: number;
  hp: number;
  dps: number;
  speed: number;        // cases / seconde
  range: number;        // cases
  attackInterval: number;
  splash?: number;
  flying?: boolean;
  target: TargetPref;
  bonusVs?: { kind: 'wall' | 'resource' | 'defense' | 'building'; mult: number };
  jumpsWalls?: boolean;
  suicide?: boolean;    // explose sur la cible (ingénieur)
  heals?: number;       // PV/s soignés en zone (prêtresse)
  deathSpawn?: { unit: string; count: number };
  firstStrike?: number; // multiplicateur de la première frappe (assassin)
  trainTime: number;    // secondes
  cost: Cost;
  building: 'barracks' | 'workshop' | 'event';
  unlockLevel: number;  // niveau de caserne / atelier requis
  maxLevel: number;
  color: string;
  size: number;         // rayon visuel
  temporary?: boolean;  // unité d'événement saisonnier
}

const U: UnitDef[] = [
  { id: 'soldier', name: 'Soldat', role: 'Équilibré', desc: 'Fantassin polyvalent, robuste et bon marché.', housing: 1, hp: 60, dps: 12, speed: 1.6, range: 0.7, attackInterval: 1, target: 'any', trainTime: 15, cost: { wood: 25 }, building: 'barracks', unlockLevel: 1, maxLevel: 10, color: '#e53935', size: 0.28 },
  { id: 'archer', name: 'Archère', role: 'Distance', desc: 'Tire par-dessus les murailles.', housing: 1, hp: 26, dps: 9, speed: 1.8, range: 3.5, attackInterval: 1, target: 'any', trainTime: 18, cost: { wood: 50 }, building: 'barracks', unlockLevel: 2, maxLevel: 10, color: '#43a047', size: 0.26 },
  { id: 'scout', name: 'Éclaireur', role: 'Rapide · Pillard', desc: 'Fonce vers les ressources et les pille deux fois plus vite.', housing: 1, hp: 38, dps: 12, speed: 2.7, range: 0.6, attackInterval: 0.8, target: 'resource', bonusVs: { kind: 'resource', mult: 2 }, trainTime: 20, cost: { wood: 40 }, building: 'barracks', unlockLevel: 3, maxLevel: 9, color: '#fdd835', size: 0.25 },
  { id: 'brute', name: 'Brute', role: 'Tank', desc: 'Encaisse les coups et cible les défenses.', housing: 5, hp: 420, dps: 14, speed: 1.1, range: 0.9, attackInterval: 2, target: 'defense', trainTime: 60, cost: { wood: 250 }, building: 'barracks', unlockLevel: 4, maxLevel: 10, color: '#8d6e63', size: 0.42 },
  { id: 'engineer', name: 'Ingénieur', role: 'Brise-murs', desc: 'Pose une charge qui pulvérise les murailles (×40).', housing: 2, hp: 24, dps: 16, speed: 2.1, range: 0.6, attackInterval: 1, splash: 1.2, target: 'wall', bonusVs: { kind: 'wall', mult: 40 }, suicide: true, trainTime: 30, cost: { wood: 600 }, building: 'barracks', unlockLevel: 5, maxLevel: 8, color: '#ff8f00', size: 0.26 },
  { id: 'airship', name: 'Aéronef', role: 'Bombardier aérien', desc: 'Largue des bombes sur les défenses.', housing: 5, hp: 170, dps: 60, speed: 0.9, range: 0.6, attackInterval: 3, splash: 1.2, flying: true, target: 'defense', trainTime: 90, cost: { wood: 1800 }, building: 'barracks', unlockLevel: 6, maxLevel: 8, color: '#5c6bc0', size: 0.45 },
  { id: 'mage', name: 'Mage', role: 'Dégâts de zone', desc: 'Projette des orbes explosives.', housing: 4, hp: 80, dps: 45, speed: 1.4, range: 3, attackInterval: 1.5, splash: 0.9, target: 'any', trainTime: 75, cost: { wood: 1500 }, building: 'barracks', unlockLevel: 7, maxLevel: 10, color: '#7e57c2', size: 0.3 },
  { id: 'priestess', name: 'Prêtresse', role: 'Soigneuse volante', desc: 'Soigne les troupes terrestres en zone.', housing: 14, hp: 500, dps: 0, speed: 1.8, range: 4, attackInterval: 0.7, heals: 40, flying: true, target: 'any', trainTime: 300, cost: { wood: 5000 }, building: 'barracks', unlockLevel: 8, maxLevel: 7, color: '#fff59d', size: 0.38 },
  { id: 'wyvern', name: 'Wyverne', role: 'Dragon aérien', desc: 'Crache un souffle ardent en zone.', housing: 20, hp: 1700, dps: 150, speed: 1.6, range: 2.5, attackInterval: 1.25, splash: 1.0, flying: true, target: 'any', trainTime: 480, cost: { wood: 20000, energy: 200 }, building: 'barracks', unlockLevel: 9, maxLevel: 8, color: '#00897b', size: 0.6 },
  { id: 'assassin', name: 'Assassin', role: 'Frappe éclair', desc: 'Très rapide ; sa première frappe inflige ×4 dégâts.', housing: 4, hp: 130, dps: 70, speed: 3.1, range: 0.6, attackInterval: 0.6, target: 'defense', firstStrike: 4, trainTime: 120, cost: { wood: 4000, energy: 40 }, building: 'barracks', unlockLevel: 10, maxLevel: 8, color: '#37474f', size: 0.28 },
  { id: 'golem', name: 'Golem', role: 'Colosse', desc: 'Montagne de pierre ; se scinde en golemites à sa mort.', housing: 25, hp: 4200, dps: 34, speed: 0.75, range: 1, attackInterval: 2.5, target: 'defense', deathSpawn: { unit: 'golemite', count: 2 }, trainTime: 600, cost: { wood: 30000, energy: 300 }, building: 'barracks', unlockLevel: 11, maxLevel: 7, color: '#78909c', size: 0.75 },
  { id: 'rider', name: 'Chevaucheur', role: 'Saute-murs', desc: 'Bondit par-dessus les murailles pour frapper les défenses.', housing: 5, hp: 380, dps: 48, speed: 2.4, range: 0.8, attackInterval: 1, target: 'defense', jumpsWalls: true, trainTime: 100, cost: { wood: 3500, energy: 30 }, building: 'barracks', unlockLevel: 12, maxLevel: 8, color: '#a1887f', size: 0.4 },
  { id: 'ram', name: 'Bélier de fer', role: 'Siège', desc: 'Ignore les défenses, enfonce les murs et fonce sur la Citadelle.', housing: 30, hp: 4500, dps: 300, speed: 0.9, range: 1, attackInterval: 1.5, target: 'citadel', bonusVs: { kind: 'wall', mult: 6 }, trainTime: 900, cost: { gold: 100000, energy: 500 }, building: 'workshop', unlockLevel: 1, maxLevel: 4, color: '#546e7a', size: 0.7 },
  { id: 'catapult', name: 'Trébuchet', role: 'Siège longue portée', desc: 'Bombarde les défenses à très longue distance.', housing: 30, hp: 1600, dps: 220, speed: 0.6, range: 9, attackInterval: 4, splash: 1.4, target: 'defense', trainTime: 1200, cost: { gold: 150000, energy: 800 }, building: 'workshop', unlockLevel: 2, maxLevel: 4, color: '#6d4c41', size: 0.7 },
  // Invoquées / temporaires
  { id: 'golemite', name: 'Golemite', role: 'Fragment', desc: 'Éclat de golem.', housing: 0, hp: 600, dps: 18, speed: 1.0, range: 0.8, attackInterval: 1.5, target: 'defense', trainTime: 0, cost: {}, building: 'event', unlockLevel: 99, maxLevel: 7, color: '#90a4ae', size: 0.38 },
  { id: 'phantom', name: 'Spectre des Brumes', role: 'Événement · Volant', desc: 'Unité saisonnière : traverse tout et hante les ressources.', housing: 3, hp: 140, dps: 30, speed: 2.2, range: 1.5, attackInterval: 1, flying: true, target: 'resource', bonusVs: { kind: 'resource', mult: 2 }, trainTime: 45, cost: { wood: 700 }, building: 'event', unlockLevel: 1, maxLevel: 1, color: '#b2ebf2', size: 0.32, temporary: true },
];

// Monstres d'invasion (attaquent le village du joueur)
export const MONSTERS: UnitDef[] = [
  { id: 'm_goblin', name: 'Gobelours', role: 'Monstre', desc: '', housing: 1, hp: 70, dps: 10, speed: 1.9, range: 0.7, attackInterval: 1, target: 'resource', trainTime: 0, cost: {}, building: 'event', unlockLevel: 99, maxLevel: 1, color: '#689f38', size: 0.28 },
  { id: 'm_troll', name: 'Troll des marais', role: 'Monstre', desc: '', housing: 6, hp: 650, dps: 20, speed: 1.0, range: 1, attackInterval: 2, target: 'defense', trainTime: 0, cost: {}, building: 'event', unlockLevel: 99, maxLevel: 1, color: '#33691e', size: 0.5 },
  { id: 'm_bat', name: 'Chiroptère', role: 'Monstre volant', desc: '', housing: 2, hp: 90, dps: 14, speed: 2.4, range: 0.8, attackInterval: 0.8, flying: true, target: 'any', trainTime: 0, cost: {}, building: 'event', unlockLevel: 99, maxLevel: 1, color: '#4a148c', size: 0.3 },
  { id: 'm_shaman', name: 'Chaman sombre', role: 'Monstre', desc: '', housing: 4, hp: 160, dps: 40, speed: 1.3, range: 3, attackInterval: 1.5, splash: 1, target: 'any', trainTime: 0, cost: {}, building: 'event', unlockLevel: 99, maxLevel: 1, color: '#311b92', size: 0.32 },
];

export const UNITS: Record<string, UnitDef> = Object.fromEntries([...U, ...MONSTERS].map(u => [u.id, u]));
export const TRAINABLE = U.filter(u => u.building !== 'event' || u.temporary);

export function udef(id: string): UnitDef {
  const u = UNITS[id];
  if (!u) throw new Error('Unité inconnue: ' + id);
  return u;
}

/** Statistiques d'une unité à un niveau de recherche donné (+ bonus technologiques). */
export function unitStats(id: string, level: number, mods?: { hp?: number; dmg?: number; speed?: number }) {
  const u = udef(id);
  const l = Math.max(1, level);
  return {
    hp: nice(u.hp * Math.pow(1.13, l - 1) * (1 + (mods?.hp ?? 0))),
    dps: u.dps * Math.pow(1.12, l - 1) * (1 + (mods?.dmg ?? 0)),
    heals: (u.heals ?? 0) * Math.pow(1.12, l - 1),
    speed: u.speed * (1 + (mods?.speed ?? 0)),
  };
}

/** Coût de recherche d'un niveau d'unité au laboratoire. */
export function unitResearchCost(id: string, toLevel: number): { cost: Cost; time: number; labLevel: number } {
  const u = udef(id);
  const base = Math.max(1, u.housing) * 400 + (u.unlockLevel * 1500);
  const energy = u.cost.energy ? nice(u.cost.energy * 20 * Math.pow(1.6, toLevel - 2)) : 0;
  const cost: Cost = { wood: nice(base * Math.pow(2.05, toLevel - 2)) };
  if (energy) cost.energy = energy;
  else if (toLevel >= 6) cost.energy = nice(500 * Math.pow(1.7, toLevel - 6));
  return {
    cost,
    time: Math.min(14 * 3600, Math.round(300 * Math.pow(2.1, toLevel - 2))),
    labLevel: Math.min(10, Math.max(1, Math.ceil((u.unlockLevel + toLevel * 1.5) / 2.2))),
  };
}
