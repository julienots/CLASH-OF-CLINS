// Arbre technologique : 5 branches (MILITAIRE, DÉFENSE, ÉCONOMIE, MAGIE, TECHNOLOGIE).
import type { Cost } from '../core/types';

export type Branch = 'military' | 'defense' | 'economy' | 'magic' | 'technology';
export const BRANCHES: { id: Branch; name: string; icon: string; color: string }[] = [
  { id: 'military', name: 'Militaire', icon: '⚔️', color: '#e53935' },
  { id: 'defense', name: 'Défense', icon: '🏰', color: '#546e7a' },
  { id: 'economy', name: 'Économie', icon: '🪙', color: '#f9a825' },
  { id: 'magic', name: 'Magie', icon: '✨', color: '#8e24aa' },
  { id: 'technology', name: 'Technologie', icon: '⚙️', color: '#00897b' },
];

export type ModKey =
  | 'unitHp' | 'unitDmg' | 'trainSpeed' | 'heroDmg' | 'unitSpeed'
  | 'defDmg' | 'defHp' | 'wallHp' | 'trapDmg' | 'defRange'
  | 'production' | 'storage' | 'buildCost' | 'loot' | 'marketFee'
  | 'spellPower' | 'spellCooldown' | 'spellCapacity' | 'heroAbility'
  | 'buildSpeed' | 'researchSpeed' | 'offlineCap' | 'scouting' | 'armyCapacity';

export interface TechNode {
  id: string; branch: Branch; tier: number; name: string; desc: string;
  mod: ModKey; value: number; requires: string[]; lab: number; cost: Cost; time: number;
}

const T: TechNode[] = [];
function t(branch: Branch, tier: number, id: string, name: string, desc: string, mod: ModKey, value: number, requires: string[] = []) {
  const lab = Math.min(10, tier * 2);
  const k = Math.pow(3.2, tier - 1);
  const cost: Cost = branch === 'economy' ? { gold: Math.round(15000 * k) } : { wood: Math.round(15000 * k) };
  if (tier >= 3) cost.energy = Math.round(800 * Math.pow(2.5, tier - 3));
  T.push({ id, branch, tier, name, desc, mod, value, requires, lab, cost, time: Math.min(16 * 3600, Math.round(900 * Math.pow(2.6, tier - 1))) });
}

// MILITAIRE
t('military', 1, 'mil_drill', 'Exercices militaires', 'Entraînement des troupes +15 % plus rapide.', 'trainSpeed', 0.15);
t('military', 2, 'mil_steel', 'Acier trempé', '+8 % dégâts pour toutes les unités.', 'unitDmg', 0.08, ['mil_drill']);
t('military', 2, 'mil_mail', 'Cottes de mailles', '+8 % PV pour toutes les unités.', 'unitHp', 0.08, ['mil_drill']);
t('military', 3, 'mil_march', 'Marche forcée', '+8 % vitesse de déplacement.', 'unitSpeed', 0.08, ['mil_steel']);
t('military', 3, 'mil_camps', 'Logistique', '+10 % capacité d\'armée.', 'armyCapacity', 0.1, ['mil_mail']);
t('military', 4, 'mil_legends', 'Légendes vivantes', '+12 % dégâts des héros.', 'heroDmg', 0.12, ['mil_march', 'mil_camps']);
// DÉFENSE
t('defense', 1, 'def_masonry', 'Maçonnerie', '+15 % PV des murailles.', 'wallHp', 0.15);
t('defense', 2, 'def_gunpowder', 'Poudre noire', '+8 % dégâts des défenses.', 'defDmg', 0.08, ['def_masonry']);
t('defense', 2, 'def_buttress', 'Contreforts', '+10 % PV des bâtiments défensifs.', 'defHp', 0.1, ['def_masonry']);
t('defense', 3, 'def_optics', 'Lunettes de visée', '+0,5 case de portée des défenses.', 'defRange', 0.5, ['def_gunpowder']);
t('defense', 3, 'def_traps', 'Pièges sournois', '+20 % dégâts des pièges.', 'trapDmg', 0.2, ['def_buttress']);
t('defense', 4, 'def_bastion', 'Bastion royal', '+10 % dégâts des défenses.', 'defDmg', 0.1, ['def_optics', 'def_traps']);
// ÉCONOMIE
t('economy', 1, 'eco_tools', 'Outils affûtés', '+10 % de production.', 'production', 0.1);
t('economy', 2, 'eco_vaults', 'Coffres renforcés', '+10 % de capacité de stockage.', 'storage', 0.1, ['eco_tools']);
t('economy', 2, 'eco_guilds', 'Guildes marchandes', '-10 % de commission au marché.', 'marketFee', 0.1, ['eco_tools']);
t('economy', 3, 'eco_logistics', 'Logistique de chantier', '-8 % coût des constructions.', 'buildCost', 0.08, ['eco_vaults']);
t('economy', 3, 'eco_plunder', 'Art du pillage', '+15 % de butin.', 'loot', 0.15, ['eco_guilds']);
t('economy', 4, 'eco_golden_age', 'Âge d\'or', '+15 % de production.', 'production', 0.15, ['eco_logistics', 'eco_plunder']);
// MAGIE
t('magic', 1, 'mag_focus', 'Concentration', '-15 % temps de recharge des sorts.', 'spellCooldown', 0.15);
t('magic', 2, 'mag_runes', 'Runes amplifiées', '+10 % puissance des sorts.', 'spellPower', 0.1, ['mag_focus']);
t('magic', 2, 'mag_satchel', 'Besace arcanique', '+1 capacité de sorts.', 'spellCapacity', 1, ['mag_focus']);
t('magic', 3, 'mag_heroic', 'Éveil héroïque', 'Les compétences de héros sont 20 % plus puissantes.', 'heroAbility', 0.2, ['mag_runes']);
t('magic', 3, 'mag_satchel2', 'Grimoire étendu', '+1 capacité de sorts.', 'spellCapacity', 1, ['mag_satchel']);
t('magic', 4, 'mag_archmage', 'Archimagie', '+15 % puissance des sorts.', 'spellPower', 0.15, ['mag_heroic', 'mag_satchel2']);
// TECHNOLOGIE
t('technology', 1, 'tec_scaffold', 'Échafaudages', 'Constructions 10 % plus rapides.', 'buildSpeed', 0.1);
t('technology', 2, 'tec_lenses', 'Lentilles', 'Recherches 10 % plus rapides.', 'researchSpeed', 0.1, ['tec_scaffold']);
t('technology', 2, 'tec_ledger', 'Registres', 'Production hors-ligne prolongée (+12 h).', 'offlineCap', 12, ['tec_scaffold']);
t('technology', 3, 'tec_spyglass', 'Longue-vue', 'Détecte +15 % de pièges en éclaireur.', 'scouting', 15, ['tec_lenses']);
t('technology', 3, 'tec_cranes', 'Grues', 'Constructions 15 % plus rapides.', 'buildSpeed', 0.15, ['tec_ledger']);
t('technology', 4, 'tec_automata', 'Automates', 'Recherches 15 % plus rapides.', 'researchSpeed', 0.15, ['tec_spyglass', 'tec_cranes']);

export const TECH = T;
export const TECH_BY_ID: Record<string, TechNode> = Object.fromEntries(T.map(n => [n.id, n]));

export type Mods = Record<ModKey, number>;
export function computeMods(owned: Record<string, boolean>): Mods {
  const m = {} as Mods;
  for (const n of T) {
    if (!(n.mod in m)) m[n.mod] = 0;
    if (owned[n.id]) m[n.mod] += n.value;
  }
  return m;
}
