// Les quatre héros originaux de KINGDOMS.
import type { Cost } from '../core/types';
import { nice } from '../core/util';

export interface HeroAbility { id: string; name: string; desc: string }

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  templeLevel: number;   // niveau de temple requis
  citadel: number;
  baseHp: number;
  baseDps: number;
  speed: number;
  range: number;
  attackInterval: number;
  splash?: number;
  flying?: boolean;
  target: 'any' | 'defense';
  ability: HeroAbility;   // compétence active (1 fois par combat)
  ultimate: HeroAbility;  // se charge en infligeant des dégâts
  color: string;
  accent: string;
  skins: { id: string; name: string; color: string; accent: string; crystals: number }[];
}

export const HEROES: HeroDef[] = [
  {
    id: 'arkon', name: 'Arkon', title: 'Seigneur de guerre', templeLevel: 1, citadel: 5,
    desc: 'Guerrier implacable, il charge au cœur des lignes ennemies.',
    baseHp: 1400, baseDps: 95, speed: 1.6, range: 1, attackInterval: 1.2, target: 'any',
    ability: { id: 'warcry', name: 'Cri de guerre', desc: 'Soigne Arkon de 35 % et enrage les troupes proches pendant 8 s.' },
    ultimate: { id: 'earthsplitter', name: 'Fendeur de terre', desc: 'Frappe le sol : dégâts massifs en zone et étourdit les défenses 3 s.' },
    color: '#c62828', accent: '#ffd54f',
    skins: [
      { id: 'arkon_default', name: 'Armure de bronze', color: '#c62828', accent: '#ffd54f', crystals: 0 },
      { id: 'arkon_frost', name: 'Jarl du Givre', color: '#4fc3f7', accent: '#e1f5fe', crystals: 900 },
      { id: 'arkon_ember', name: 'Tyran des braises', color: '#212121', accent: '#ff5722', crystals: 1200 },
    ],
  },
  {
    id: 'lyra', name: 'Lyra', title: 'Archère mystique', templeLevel: 2, citadel: 7,
    desc: 'Ses flèches lunaires traversent la pierre comme la brume.',
    baseHp: 650, baseDps: 120, speed: 1.9, range: 5, attackInterval: 0.8, target: 'any',
    ability: { id: 'veil', name: 'Voile lunaire', desc: 'Devient invisible 4 s et soigne 25 % de ses PV.' },
    ultimate: { id: 'starfall', name: 'Pluie d\'étoiles', desc: 'Une volée de 12 flèches stellaires s\'abat sur la zone ciblée.' },
    color: '#3949ab', accent: '#b3e5fc',
    skins: [
      { id: 'lyra_default', name: 'Sylve nocturne', color: '#3949ab', accent: '#b3e5fc', crystals: 0 },
      { id: 'lyra_sun', name: 'Héraut solaire', color: '#ffb300', accent: '#fff8e1', crystals: 900 },
    ],
  },
  {
    id: 'bronn', name: 'Bronn', title: 'Rempart vivant', templeLevel: 3, citadel: 9,
    desc: 'Forgeron-colosse, il protège ses alliés derrière son pavois de fer.',
    baseHp: 3200, baseDps: 60, speed: 1.2, range: 1, attackInterval: 1.5, target: 'defense',
    ability: { id: 'bulwark', name: 'Rempart', desc: 'Accorde un bouclier de 30 % de ses PV aux troupes proches.' },
    ultimate: { id: 'anvil', name: 'Enclume céleste', desc: 'Provocation : attire le feu des défenses et réduit les dégâts subis de 70 % pendant 6 s.' },
    color: '#6d4c41', accent: '#b0bec5',
    skins: [
      { id: 'bronn_default', name: 'Fer noir', color: '#6d4c41', accent: '#b0bec5', crystals: 0 },
      { id: 'bronn_gold', name: 'Bastion doré', color: '#ffb300', accent: '#fff3e0', crystals: 1100 },
    ],
  },
  {
    id: 'nyx', name: 'Nyx', title: 'Lame d\'ombre', templeLevel: 4, citadel: 11,
    desc: 'Insaisissable, elle se fond dans l\'ombre pour frapper les défenses clés.',
    baseHp: 900, baseDps: 210, speed: 2.8, range: 0.8, attackInterval: 0.5, target: 'defense',
    ability: { id: 'shadowstep', name: 'Pas de l\'ombre', desc: 'Se téléporte sur la défense la plus puissante et frappe ×5.' },
    ultimate: { id: 'eclipse', name: 'Éclipse', desc: 'Toutes les défenses dans un large rayon sont aveuglées 4 s.' },
    color: '#4a148c', accent: '#e040fb',
    skins: [
      { id: 'nyx_default', name: 'Voile d\'améthyste', color: '#4a148c', accent: '#e040fb', crystals: 0 },
      { id: 'nyx_blood', name: 'Lune de sang', color: '#b71c1c', accent: '#ff8a80', crystals: 1200 },
    ],
  },
];

export const HERO_MAX_LEVEL = 40;
/** Niveau maximal d'un héros selon le niveau de Citadelle. */
export function heroCap(citadel: number): number { return Math.max(0, Math.min(HERO_MAX_LEVEL, (citadel - 4) * 4)); }

export function hdef(id: string): HeroDef {
  const h = HEROES.find(h => h.id === id);
  if (!h) throw new Error('Héros inconnu: ' + id);
  return h;
}
export function heroStats(id: string, level: number, equipBonus = { hp: 0, dmg: 0 }) {
  const h = hdef(id);
  return {
    hp: nice(h.baseHp * Math.pow(1.06, level - 1) * (1 + equipBonus.hp)),
    dps: h.baseDps * Math.pow(1.055, level - 1) * (1 + equipBonus.dmg),
  };
}
export function heroUpgradeCost(id: string, toLevel: number): { cost: Cost; time: number } {
  const i = HEROES.findIndex(h => h.id === id);
  return {
    cost: { energy: nice(2000 * (1 + i * 0.3) * Math.pow(1.13, toLevel - 2)) },
    time: Math.min(12 * 3600, Math.round(600 * Math.pow(1.17, toLevel - 2))),
  };
}

// ───── Équipement (forgé à la Forge Runique) ─────
export interface EquipDef { id: string; name: string; desc: string; hero: string | 'any'; hp: number; dmg: number; forge: number; cost: Cost; icon: string }
export const EQUIPMENT: EquipDef[] = [
  { id: 'runic_blade', name: 'Lame runique', desc: '+15 % dégâts', hero: 'any', hp: 0, dmg: 0.15, forge: 1, cost: { gold: 80000, energy: 1500 }, icon: '🗡️' },
  { id: 'aegis', name: 'Égide de chêne', desc: '+18 % PV', hero: 'any', hp: 0.18, dmg: 0, forge: 1, cost: { wood: 80000, energy: 1500 }, icon: '🛡️' },
  { id: 'war_banner', name: 'Étendard de guerre', desc: '+10 % PV, +10 % dégâts', hero: 'arkon', hp: 0.1, dmg: 0.1, forge: 2, cost: { gold: 200000, energy: 4000 }, icon: '🚩' },
  { id: 'moon_quiver', name: 'Carquois lunaire', desc: '+25 % dégâts', hero: 'lyra', hp: 0, dmg: 0.25, forge: 2, cost: { wood: 200000, energy: 4000 }, icon: '🏹' },
  { id: 'iron_pavise', name: 'Pavois de fer', desc: '+30 % PV', hero: 'bronn', hp: 0.3, dmg: 0, forge: 3, cost: { gold: 400000, energy: 8000 }, icon: '🧱' },
  { id: 'shadow_cloak', name: 'Cape d\'ombre', desc: '+20 % dégâts, +10 % PV', hero: 'nyx', hp: 0.1, dmg: 0.2, forge: 4, cost: { wood: 600000, energy: 12000 }, icon: '🧥' },
  { id: 'phoenix_feather', name: 'Plume de phénix', desc: '+20 % PV, +20 % dégâts', hero: 'any', hp: 0.2, dmg: 0.2, forge: 5, cost: { gold: 1500000, energy: 25000 }, icon: '🪶' },
];
