// Définitions de tous les bâtiments de KINGDOMS.
// Les tables de niveaux sont générées à partir de courbes paramétrées afin de
// rester cohérentes et faciles à équilibrer.

import type { Cost, ResKey } from '../core/types';
import { nice } from '../core/util';

export type BuildingCategory = 'special' | 'economy' | 'military' | 'defense' | 'wall' | 'trap' | 'decoration';
export type TargetKind = 'ground' | 'air' | 'both';

export interface DefenseStats {
  range: number;        // portée en cases
  minRange?: number;    // zone morte (mortier)
  damage: number;       // dégâts par tir
  interval: number;     // secondes entre deux tirs
  splash?: number;      // rayon de zone
  targets: TargetKind;
  projectile: 'ball' | 'arrow' | 'shell' | 'rocket' | 'arcane' | 'bolt' | 'beam' | 'lightning';
  projSpeed: number;    // cases/s (0 = instantané)
  multi?: number;       // nb de cibles simultanées
  chain?: number;       // rebonds
  ramp?: number;        // multiplicateur max (brasier)
  priority?: 'closest' | 'lowestHp' | 'heroes' | 'strongest';
}

export interface TrapStats {
  trigger: number;      // rayon de déclenchement
  damage: number;
  radius: number;
  targets: TargetKind;
  effect?: 'freeze' | 'launch' | 'slow';
  effectValue?: number; // durée (s) ou capacité éjectée
}

export interface BuildingLevel {
  level: number;
  cost: Cost;
  time: number;         // secondes
  citadel: number;      // niveau de Citadelle requis
  hp: number;
  produces?: { res: ResKey; perHour: number }[];
  capacity?: number;    // capacité interne d'un producteur
  storage?: Partial<Record<ResKey, number>>;
  defense?: DefenseStats;
  trap?: TrapStats;
  housing?: number;     // capacité d'un camp
  value?: number;       // valeur générique (dons du portail, réduction, etc.)
}

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  size: number;
  desc: string;
  counts: number[];     // nb max par niveau de Citadelle (index 0 = CL1)
  levels: BuildingLevel[];
  hidden?: boolean;     // pièges
  crystalPrice?: number; // décorations premium
  color: string;        // teinte principale pour le rendu
}

const geo = (base: number, g: number, l: number) => nice(base * Math.pow(g, l - 1));

/** Génère le tableau des niveaux de Citadelle requis à partir du CL de déblocage. */
function clReq(unlock: number, n: number, step = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.min(15, unlock + Math.floor(i * step)));
  return out;
}

/** counts : "a@cl,b@cl" -> tableau 15 */
function counts(spec: string): number[] {
  const arr = new Array(15).fill(0);
  for (const part of spec.split(',')) {
    const [n, cl] = part.split('@').map(Number);
    for (let i = cl - 1; i < 15; i++) arr[i] = n;
  }
  return arr;
}

interface Gen {
  id: string; name: string; category: BuildingCategory; size: number; desc: string; color: string;
  counts: string; maxLevel: number; unlock: number; step?: number;
  baseCost: Cost; costG?: number; baseTime: number; timeG?: number; baseHp: number; hpG?: number;
  extra?: (l: number) => Partial<BuildingLevel>;
  hidden?: boolean; crystalPrice?: number;
}

function gen(g: Gen): BuildingDef {
  const req = clReq(g.unlock, g.maxLevel, g.step ?? 1);
  const levels: BuildingLevel[] = [];
  for (let l = 1; l <= g.maxLevel; l++) {
    const cost: Cost = {};
    for (const k of Object.keys(g.baseCost) as ResKey[]) {
      const v = g.baseCost[k]!;
      cost[k] = l === 1 && v === 0 ? 0 : geo(v, g.costG ?? 1.75, l);
    }
    levels.push({
      level: l,
      cost,
      time: Math.round(g.baseTime * Math.pow(g.timeG ?? 2.0, l - 1)),
      citadel: req[l - 1],
      hp: geo(g.baseHp, g.hpG ?? 1.18, l),
      ...(g.extra ? g.extra(l) : {}),
    });
  }
  return { id: g.id, name: g.name, category: g.category, size: g.size, desc: g.desc, counts: counts(g.counts), levels, hidden: g.hidden, crystalPrice: g.crystalPrice, color: g.color };
}

// Plafonne la durée de construction à 14h pour garder un rythme mobile agréable.
function capTimes(def: BuildingDef, cap = 14 * 3600): BuildingDef {
  for (const l of def.levels) l.time = Math.min(cap, l.time);
  return def;
}

const D: BuildingDef[] = [];
const add = (d: BuildingDef) => { D.push(capTimes(d)); return d; };

// ───────────────────────── SPÉCIAL ─────────────────────────
add(gen({
  id: 'citadel', name: 'Citadelle', category: 'special', size: 4, color: '#c9a227',
  desc: 'Cœur du royaume. Son niveau détermine tout ce que vous pouvez construire.',
  counts: '1@1', maxLevel: 15, unlock: 1, step: 1,
  baseCost: { gold: 520, wood: 520 }, costG: 2.0, baseTime: 10, timeG: 2.3, baseHp: 1500, hpG: 1.14,
  extra: l => ({
    citadel: l === 1 ? 1 : l - 1,
    storage: { gold: 1000 * l, wood: 1000 * l, energy: l >= 6 ? 500 * l : 0 },
    // à partir du niveau 13, la Citadelle elle-même riposte (Couronne de garde)
    ...(l >= 13 ? { defense: { range: 8, damage: 160 * (l - 12), interval: 1.3, chain: 2, targets: 'both' as const, projectile: 'arcane' as const, projSpeed: 0 } } : {}),
    cost: l === 1 ? {} : { gold: geo(520, 2.0, l), wood: geo(520, 2.0, l), ...(l >= 8 ? { energy: geo(2000, 1.6, l - 7) } : {}) },
  }),
}));
add(gen({
  id: 'builder_hut', name: "Atelier d'ouvrier", category: 'special', size: 2, color: '#a0703c',
  desc: 'Chaque atelier abrite un ouvrier : un chantier simultané de plus.',
  counts: '5@1', maxLevel: 1, unlock: 1, baseCost: { crystals: 0 }, baseTime: 0, baseHp: 250,
}));
add(gen({
  id: 'guild_portal', name: 'Portail de Guilde', category: 'special', size: 3, color: '#7d5fff',
  desc: 'Relie votre village à votre guilde : dons, renforts et guerres.',
  counts: '1@3', maxLevel: 6, unlock: 3, step: 2,
  baseCost: { gold: 10000 }, costG: 2.4, baseTime: 600, timeG: 2.4, baseHp: 1000, hpG: 1.25,
  extra: l => ({ value: 10 + 10 * (l - 1) }),
}));
add(gen({
  id: 'temple', name: 'Temple des Héros', category: 'special', size: 4, color: '#e8e0c8',
  desc: 'Invoque et abrite les héros. Chaque niveau éveille un héros.',
  counts: '1@5', maxLevel: 4, unlock: 5, step: 2,
  baseCost: { gold: 30000, energy: 0 }, costG: 3, baseTime: 1800, timeG: 2.5, baseHp: 1800, hpG: 1.3,
  extra: l => ({ value: l, cost: l === 1 ? { gold: 30000 } : { gold: geo(30000, 3, l), energy: geo(5000, 2.5, l - 1) } }),
}));
add(gen({
  id: 'forge', name: 'Forge Runique', category: 'special', size: 3, color: '#ff7b3a',
  desc: "Forge l'équipement des héros.",
  counts: '1@6', maxLevel: 5, unlock: 6, step: 2,
  baseCost: { gold: 60000, wood: 40000 }, costG: 2.2, baseTime: 3600, timeG: 1.9, baseHp: 1200, hpG: 1.2,
  extra: l => ({ value: l }),
}));
add(gen({
  id: 'observatory', name: 'Observatoire', category: 'special', size: 3, color: '#6fb3ff',
  desc: 'Révèle les régions du monde, prévoit les événements et détecte des pièges ennemis.',
  counts: '1@7', maxLevel: 4, unlock: 7, step: 2,
  baseCost: { wood: 120000 }, costG: 2.3, baseTime: 3600, timeG: 2, baseHp: 1100, hpG: 1.2,
  extra: l => ({ value: l * 15 }), // % de pièges détectés
}));

// ───────────────────────── ÉCONOMIE ─────────────────────────
const prod = (res: ResKey, base: number, cap: number) => (l: number) => ({
  produces: [{ res, perHour: nice(base * Math.pow(1.32, l - 1)) }],
  capacity: nice(cap * Math.pow(1.45, l - 1)),
});
add(gen({
  id: 'gold_mine', name: "Mine d'or", category: 'economy', size: 3, color: '#f2c94c',
  desc: "Extrait de l'or en continu. Touchez-la pour récolter.",
  counts: '2@1,3@2,4@3,5@4,6@6,7@8,8@10', maxLevel: 13, unlock: 1, step: 1,
  baseCost: { wood: 150 }, costG: 1.8, baseTime: 10, timeG: 2.15, baseHp: 400, extra: prod('gold', 350, 900),
}));
add(gen({
  id: 'sawmill', name: 'Scierie', category: 'economy', size: 3, color: '#8b5a2b',
  desc: 'Débite du bois sans relâche.',
  counts: '2@1,3@2,4@3,5@4,6@6,7@8,8@10', maxLevel: 13, unlock: 1, step: 1,
  baseCost: { gold: 150 }, costG: 1.8, baseTime: 10, timeG: 2.15, baseHp: 400, extra: prod('wood', 350, 900),
}));
add(gen({
  id: 'farm', name: 'Ferme', category: 'economy', size: 3, color: '#9ccc65',
  desc: 'Ses récoltes se vendent en or et nourrissent les bûcherons : produit or ET bois.',
  counts: '1@2,2@5,3@9', maxLevel: 10, unlock: 2, step: 1.3,
  baseCost: { gold: 600, wood: 600 }, costG: 1.9, baseTime: 120, timeG: 2.1, baseHp: 450,
  extra: l => ({ produces: [{ res: 'gold', perHour: nice(90 * Math.pow(1.33, l - 1)) }, { res: 'wood', perHour: nice(90 * Math.pow(1.33, l - 1)) }], capacity: nice(600 * Math.pow(1.45, l - 1)) }),
}));
add(gen({
  id: 'quarry', name: 'Carrière de cristal', category: 'economy', size: 3, color: '#b388ff',
  desc: 'Taille lentement des cristaux bruts. Rare et précieux.',
  counts: '1@4,2@10', maxLevel: 6, unlock: 4, step: 2,
  baseCost: { gold: 20000, wood: 20000 }, costG: 2.4, baseTime: 1800, timeG: 2, baseHp: 600,
  extra: l => ({ produces: [{ res: 'crystals', perHour: [0.25, 0.4, 0.55, 0.7, 0.85, 1][l - 1] }], capacity: 6 + l * 4 }),
}));
add(gen({
  id: 'generator', name: "Générateur d'énergie", category: 'economy', size: 3, color: '#4dd0e1',
  desc: "Canalise l'énergie des lignes telluriques, ressource des technologies avancées.",
  counts: '1@6,2@8,3@11', maxLevel: 9, unlock: 6, step: 1,
  baseCost: { gold: 50000, wood: 50000 }, costG: 1.7, baseTime: 1800, timeG: 1.7, baseHp: 700,
  extra: prod('energy', 40, 300),
}));
const store = (res: ResKey, base: number) => (l: number) => ({ storage: { [res]: nice(base * Math.pow(1.85, l - 1)) } });
add(gen({
  id: 'gold_vault', name: "Coffre d'or", category: 'economy', size: 3, color: '#f2c94c',
  desc: "Stocke l'or du royaume.",
  counts: '1@1,2@3,3@6,4@9', maxLevel: 13, unlock: 1, step: 1,
  baseCost: { wood: 300 }, costG: 1.85, baseTime: 15, timeG: 2.15, baseHp: 700, extra: store('gold', 1500),
}));
add(gen({
  id: 'wood_depot', name: 'Entrepôt de bois', category: 'economy', size: 3, color: '#8b5a2b',
  desc: 'Stocke le bois.',
  counts: '1@1,2@3,3@6,4@9', maxLevel: 13, unlock: 1, step: 1,
  baseCost: { gold: 300 }, costG: 1.85, baseTime: 15, timeG: 2.15, baseHp: 700, extra: store('wood', 1500),
}));
add(gen({
  id: 'energy_cell', name: "Cellule d'énergie", category: 'economy', size: 3, color: '#4dd0e1',
  desc: "Stocke l'énergie.",
  counts: '1@6,2@10', maxLevel: 8, unlock: 6, step: 1.2,
  baseCost: { gold: 60000 }, costG: 1.8, baseTime: 3600, timeG: 1.6, baseHp: 900, extra: store('energy', 5000),
}));
add(gen({
  id: 'crystal_vault', name: 'Reliquaire de cristal', category: 'economy', size: 2, color: '#b388ff',
  desc: 'Augmente la capacité des carrières et met les cristaux à l\'abri des pillards.',
  counts: '1@4', maxLevel: 5, unlock: 4, step: 2.5,
  baseCost: { gold: 25000 }, costG: 2.5, baseTime: 1800, timeG: 2, baseHp: 800, extra: l => ({ value: l * 5 }),
}));
add(gen({
  id: 'market', name: 'Marché', category: 'economy', size: 3, color: '#ef8354',
  desc: 'Échangez or et bois. Les améliorations réduisent la commission.',
  counts: '1@3', maxLevel: 5, unlock: 3, step: 2.5,
  baseCost: { gold: 5000, wood: 5000 }, costG: 2.6, baseTime: 600, timeG: 2.5, baseHp: 800,
  extra: l => ({ value: [40, 33, 27, 22, 18][l - 1] }), // % de commission
}));

// ───────────────────────── MILITAIRE ─────────────────────────
add(gen({
  id: 'barracks', name: 'Caserne', category: 'military', size: 3, color: '#d64545',
  desc: 'Entraîne les troupes. Chaque niveau débloque une nouvelle unité.',
  counts: '1@1,2@4', maxLevel: 12, unlock: 1, step: 1,
  baseCost: { gold: 200 }, costG: 1.95, baseTime: 10, timeG: 2.2, baseHp: 500,
}));
add(gen({
  id: 'army_camp', name: "Camp d'entraînement", category: 'military', size: 4, color: '#bf8f4f',
  desc: 'Abrite votre armée. Capacité 50 → 75 → 100 → 125 → 150.',
  counts: '1@1,2@3,3@6,4@9', maxLevel: 5, unlock: 1, step: 2.5,
  baseCost: { gold: 250 }, costG: 3.2, baseTime: 60, timeG: 4, baseHp: 400,
  extra: l => ({ housing: [50, 75, 100, 125, 150][l - 1] }),
}));
add(gen({
  id: 'laboratory', name: 'Laboratoire', category: 'military', size: 3, color: '#26a69a',
  desc: 'Recherche les améliorations d\'unités, de sorts et l\'arbre technologique.',
  counts: '1@3', maxLevel: 10, unlock: 3, step: 1.25,
  baseCost: { gold: 5000 }, costG: 1.9, baseTime: 300, timeG: 1.9, baseHp: 600,
}));
add(gen({
  id: 'academy', name: 'Académie des Arcanes', category: 'military', size: 3, color: '#ab47bc',
  desc: 'Prépare les sorts de combat. Chaque niveau débloque un sort et de la capacité.',
  counts: '1@5', maxLevel: 7, unlock: 5, step: 1.5,
  baseCost: { gold: 25000 }, costG: 2.1, baseTime: 1200, timeG: 1.9, baseHp: 650,
  extra: l => ({ housing: 2 + l }),
}));
add(gen({
  id: 'workshop', name: 'Atelier de siège', category: 'military', size: 4, color: '#78909c',
  desc: 'Construit des engins de siège.',
  counts: '1@8', maxLevel: 3, unlock: 8, step: 3,
  baseCost: { gold: 300000, wood: 200000 }, costG: 2.2, baseTime: 7200, timeG: 2, baseHp: 1500,
}));

// ───────────────────────── DÉFENSE ─────────────────────────
type DefGen = Omit<DefenseStats, 'damage'> & { damage: number; dmgG?: number };
const def = (d: DefGen) => (l: number): Partial<BuildingLevel> => ({
  defense: { ...d, damage: nice(d.damage * Math.pow(d.dmgG ?? 1.22, l - 1)) },
});
add(gen({
  id: 'cannon', name: 'Canon', category: 'defense', size: 3, color: '#455a64',
  desc: 'Défense terrestre fiable à cadence rapide.',
  counts: '2@1,3@3,4@5,5@7,6@9,7@12', maxLevel: 15, unlock: 1, step: 1,
  baseCost: { gold: 250 }, costG: 1.75, baseTime: 15, timeG: 2.05, baseHp: 420,
  extra: def({ range: 9, damage: 9, interval: 0.8, targets: 'ground', projectile: 'ball', projSpeed: 14 }),
}));
add(gen({
  id: 'watchtower', name: 'Tour de guet', category: 'defense', size: 3, color: '#8d6e63',
  desc: 'Des archers postés en hauteur touchent cibles terrestres et aériennes.',
  counts: '1@2,2@3,3@4,4@5,5@7,6@9,7@11,8@13', maxLevel: 15, unlock: 2, step: 0.95,
  baseCost: { gold: 1000 }, costG: 1.72, baseTime: 60, timeG: 1.95, baseHp: 400,
  extra: def({ range: 10, damage: 11, interval: 1, targets: 'both', projectile: 'arrow', projSpeed: 18 }),
}));
add(gen({
  id: 'mortar', name: 'Mortier', category: 'defense', size: 3, color: '#5d4037',
  desc: 'Pilonne les groupes terrestres à longue portée. Zone morte au pied.',
  counts: '1@3,2@6,3@8,4@11', maxLevel: 12, unlock: 3, step: 1,
  baseCost: { gold: 8000 }, costG: 1.75, baseTime: 600, timeG: 1.9, baseHp: 400,
  extra: def({ range: 11, minRange: 4, damage: 20, interval: 5, splash: 1.5, targets: 'ground', projectile: 'shell', projSpeed: 6 }),
}));
add(gen({
  id: 'sky_launcher', name: 'Lanceur céleste', category: 'defense', size: 3, color: '#1e88e5',
  desc: 'Batterie de roquettes dévastatrice contre les unités volantes.',
  counts: '1@4,2@6,3@8,4@11', maxLevel: 11, unlock: 4, step: 1,
  baseCost: { gold: 22000 }, costG: 1.7, baseTime: 1800, timeG: 1.8, baseHp: 800,
  extra: def({ range: 10, damage: 80, interval: 1, splash: 0.8, targets: 'air', projectile: 'rocket', projSpeed: 12 }),
}));
add(gen({
  id: 'arcane_spire', name: 'Flèche arcanique', category: 'defense', size: 2, color: '#8e24aa',
  desc: 'Défense magique dont les éclairs rebondissent d\'ennemi en ennemi.',
  counts: '1@6,2@8,3@10,4@12', maxLevel: 10, unlock: 6, step: 1,
  baseCost: { gold: 90000 }, costG: 1.6, baseTime: 3600, timeG: 1.6, baseHp: 650,
  extra: def({ range: 7, damage: 30, interval: 1.4, chain: 3, targets: 'both', projectile: 'arcane', projSpeed: 0 }),
}));
add(gen({
  id: 'ballista', name: 'Baliste', category: 'defense', size: 3, color: '#6d4c41',
  desc: 'Carreaux perforants qui traversent les rangs ennemis.',
  counts: '1@8,2@10,3@13', maxLevel: 8, unlock: 8, step: 1,
  baseCost: { gold: 500000 }, costG: 1.45, baseTime: 14400, timeG: 1.35, baseHp: 1400,
  extra: def({ range: 12, damage: 120, interval: 2.2, splash: 0.6, targets: 'ground', projectile: 'bolt', projSpeed: 20, priority: 'strongest' }),
}));
add(gen({
  id: 'brazier', name: 'Brasier', category: 'defense', size: 2, color: '#ff5722',
  desc: 'Un rayon de feu qui s\'intensifie tant qu\'il reste sur la même cible.',
  counts: '1@10,2@12,3@15', maxLevel: 6, unlock: 10, step: 1,
  baseCost: { gold: 1500000, energy: 20000 }, costG: 1.3, baseTime: 28800, timeG: 1.2, baseHp: 1800,
  extra: def({ range: 9, damage: 18, interval: 0.25, ramp: 12, targets: 'both', projectile: 'beam', projSpeed: 0, priority: 'heroes' }),
}));
add(gen({
  id: 'storm_tower', name: 'Tour Tempête', category: 'defense', size: 3, color: '#29b6f6',
  desc: 'Frappe plusieurs ennemis à la fois avec la foudre.',
  counts: '1@12,2@14,3@15', maxLevel: 4, unlock: 12, step: 1,
  baseCost: { gold: 4000000, energy: 60000 }, costG: 1.25, baseTime: 36000, timeG: 1.15, baseHp: 3500,
  extra: def({ range: 9, damage: 70, interval: 1.6, multi: 4, targets: 'both', projectile: 'lightning', projSpeed: 0 }),
}));
add(gen({
  id: 'wall', name: 'Muraille', category: 'wall', size: 1, color: '#9e9e9e',
  desc: 'Bloque, ralentit et canalise les ennemis. Glissez pour construire rapidement.',
  counts: '0@1,25@2,50@3,75@4,100@5,125@6,175@7,200@8,225@9,250@10,275@12,300@14', maxLevel: 12, unlock: 2, step: 1.1,
  baseCost: { gold: 50 }, costG: 2.1, baseTime: 0, timeG: 1, baseHp: 300, hpG: 1.45,
}));

// ───────────────────────── PIÈGES ─────────────────────────
const trap = (t: TrapStats, g = 1.3) => (l: number): Partial<BuildingLevel> => ({ trap: { ...t, damage: nice(t.damage * Math.pow(g, l - 1)) } });
add(gen({
  id: 'bomb', name: 'Bombe', category: 'trap', size: 1, color: '#37474f', hidden: true,
  desc: 'Explose au passage des troupes terrestres.',
  counts: '2@3,4@5,6@7,8@10', maxLevel: 9, unlock: 3, step: 1.2,
  baseCost: { gold: 400 }, costG: 1.9, baseTime: 0, timeG: 1, baseHp: 1,
  extra: trap({ trigger: 1.2, damage: 40, radius: 2, targets: 'ground' }),
}));
add(gen({
  id: 'spring_trap', name: 'Piège à ressort', category: 'trap', size: 1, color: '#795548', hidden: true,
  desc: 'Éjecte les troupes terrestres hors de la carte.',
  counts: '2@4,4@6,6@9', maxLevel: 5, unlock: 4, step: 2,
  baseCost: { gold: 2000 }, costG: 2.2, baseTime: 0, timeG: 1, baseHp: 1,
  extra: l => ({ trap: { trigger: 0.8, damage: 0, radius: 0.8, targets: 'ground', effect: 'launch', effectValue: 10 + l * 3 } }),
}));
add(gen({
  id: 'land_mine', name: 'Grande mine', category: 'trap', size: 2, color: '#263238', hidden: true,
  desc: 'Une charge colossale cachée sous les pavés.',
  counts: '1@6,2@8,4@11', maxLevel: 7, unlock: 6, step: 1.3,
  baseCost: { gold: 12500 }, costG: 1.9, baseTime: 0, timeG: 1, baseHp: 1,
  extra: trap({ trigger: 1.5, damage: 225, radius: 3, targets: 'ground' }, 1.25),
}));
add(gen({
  id: 'ice_trap', name: 'Piège de givre', category: 'trap', size: 1, color: '#80deea', hidden: true,
  desc: 'Gèle les ennemis proches pendant quelques secondes.',
  counts: '1@7,2@10,3@13', maxLevel: 5, unlock: 7, step: 2,
  baseCost: { gold: 40000 }, costG: 2, baseTime: 0, timeG: 1, baseHp: 1,
  extra: l => ({ trap: { trigger: 1.5, damage: 10 * l, radius: 3, targets: 'both', effect: 'freeze', effectValue: 2 + l * 0.6 } }),
}));
add(gen({
  id: 'rune_trap', name: 'Piège runique', category: 'trap', size: 2, color: '#ce93d8', hidden: true,
  desc: 'Cercle magique qui ralentit et consume les intrus.',
  counts: '1@9,2@12', maxLevel: 5, unlock: 9, step: 1.5,
  baseCost: { gold: 300000 }, costG: 1.8, baseTime: 0, timeG: 1, baseHp: 1,
  extra: l => ({ trap: { trigger: 1.5, damage: 25 * l, radius: 3.5, targets: 'ground', effect: 'slow', effectValue: 6 } }),
}));
add(gen({
  id: 'air_trap', name: 'Piège aérien', category: 'trap', size: 1, color: '#90a4ae', hidden: true,
  desc: 'Une volée de dards caché qui frappe une unité volante.',
  counts: '1@5,3@7,5@10', maxLevel: 7, unlock: 5, step: 1.5,
  baseCost: { gold: 4000 }, costG: 2.05, baseTime: 0, timeG: 1, baseHp: 1,
  extra: trap({ trigger: 4, damage: 600, radius: 0.5, targets: 'air' }, 1.25),
}));

// ───────────────────────── DÉCORATIONS ─────────────────────────
const deco = (id: string, name: string, color: string, size: number, gold: number, crystals = 0, unlock = 1) =>
  add({
    id, name, category: 'decoration', size, color, desc: crystals ? 'Décoration premium (cosmétique uniquement).' : 'Décoration (cosmétique uniquement).',
    counts: counts(`10@${unlock}`), crystalPrice: crystals || undefined,
    levels: [{ level: 1, cost: crystals ? { crystals } : { gold }, time: 0, citadel: unlock, hp: 1 }],
  });
deco('deco_pine', 'Pin', '#2e7d32', 1, 100);
deco('deco_oak', 'Chêne', '#43a047', 2, 300);
deco('deco_flowers', 'Massif fleuri', '#ec407a', 1, 200);
deco('deco_lantern', 'Lanterne', '#ffca28', 1, 500, 0, 2);
deco('deco_banner', 'Bannière royale', '#c62828', 1, 2000, 0, 3);
deco('deco_fountain', 'Fontaine', '#4fc3f7', 2, 15000, 0, 4);
deco('deco_statue', 'Statue du Fondateur', '#bdbdbd', 2, 50000, 0, 6);
deco('deco_crystal_obelisk', 'Obélisque de cristal', '#b388ff', 2, 0, 250, 1);
deco('deco_dragon_skull', 'Crâne de dragon', '#efebe9', 2, 0, 400, 1);
deco('deco_pumpkin', 'Lanterne-citrouille', '#ff9800', 1, 0, 60, 1);
deco('deco_snowman', 'Bonhomme de neige', '#ffffff', 1, 0, 60, 1);
deco('deco_throne', 'Trône de saison', '#ffd54f', 2, 0, 0, 1); // récompense Royal Pass
deco('deco_hero_statue', 'Statue héroïque', '#cfd8dc', 2, 2000000, 0, 13);
deco('deco_monument', 'Monument du Roi', '#ffd54f', 3, 5000000, 0, 15);

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(D.map(d => [d.id, d]));
export const BUILDING_LIST = D;

export function bdef(id: string): BuildingDef {
  const d = BUILDINGS[id];
  if (!d) throw new Error('Bâtiment inconnu: ' + id);
  return d;
}
export function blevel(id: string, level: number): BuildingLevel {
  const d = bdef(id);
  return d.levels[Math.max(0, Math.min(d.levels.length, level) - 1)];
}
export function maxCount(id: string, citadel: number): number {
  return bdef(id).counts[Math.max(0, Math.min(15, citadel) - 1)] ?? 0;
}
/** Niveau maximum atteignable d'un bâtiment pour un niveau de Citadelle donné. */
export function maxLevelFor(id: string, citadel: number): number {
  let m = 0;
  for (const l of bdef(id).levels) if (l.citadel <= citadel) m = l.level;
  return m;
}
