// Campagne solo : 30 niveaux répartis dans 6 régions, chacun introduisant une mécanique.
import type { Resources } from '../core/types';
import type { Formation } from './basegen';

export interface CampaignLevel {
  index: number; // 1..30
  name: string;
  region: string;
  intro: string;       // mécanique introduite
  citadel: number;     // puissance de la base
  formation: Formation;
  only?: string[];     // défenses autorisées
  exclude?: string[];
  fill: number;
  penalty: number;
  seed: number;
  reward: Partial<Resources>;
  firstStarBonus: number; // cristaux
  boss?: string;
}

const L: [string, string, number, Formation, number, string[] | undefined, string | undefined][] = [
  // nom, intro, citadelle, formation, fill, défenses autorisées, boss
  ['Avant-poste des Gobelours', 'Déployez vos soldats hors des zones rouges.', 1, 'spread', 0.5, ['cannon'], undefined],
  ['Les Moulins Brisés', 'Les éclaireurs pillent les ressources deux fois plus vite.', 1, 'spread', 0.8, ['cannon'], undefined],
  ['Premier Rempart', 'Les murailles bloquent : les troupes les percent ou les contournent.', 2, 'ring', 0.7, ['cannon', 'watchtower'], undefined],
  ['La Tour Solitaire', 'Les tours de guet touchent aussi les volants.', 2, 'core', 0.8, ['cannon', 'watchtower'], undefined],
  ['Le Fort des Marais', 'Détruisez la Citadelle pour une étoile garantie.', 3, 'ring', 0.8, ['cannon', 'watchtower'], 'Seigneur Bourbier'],
  ['Pluie de Pierres', 'Le mortier a une zone morte : approchez-vous !', 3, 'core', 0.8, ['cannon', 'watchtower', 'mortar'], undefined],
  ['Sentiers Piégés', 'Des bombes cachées guettent les groupes serrés.', 4, 'compartments', 0.8, ['cannon', 'watchtower', 'mortar'], undefined],
  ['Le Ciel Gardé', 'Le lanceur céleste abat les unités volantes.', 4, 'island', 0.85, ['cannon', 'watchtower', 'mortar', 'sky_launcher'], undefined],
  ['Ressorts et Ruses', 'Les pièges à ressort éjectent vos troupes.', 5, 'maze', 0.85, undefined, undefined],
  ['La Citadelle Rouge', 'Les héros défendent leur temple.', 5, 'fortress', 0.9, undefined, 'Baronne Écarlate'],
  ['Brume Arcanique', 'La flèche arcanique enchaîne ses éclairs.', 6, 'core', 0.85, undefined, undefined],
  ['Mines Profondes', 'Les grandes mines dévastent les tanks.', 6, 'compartments', 0.9, undefined, undefined],
  ['Le Givre Éternel', 'Les pièges de givre figent vos troupes.', 7, 'island', 0.9, undefined, undefined],
  ['Les Six Bastions', 'Divisez pour régner : attaquez par deux flancs.', 7, 'maze', 0.9, undefined, undefined],
  ['Le Trône de Fer', 'Une forteresse complète : utilisez vos sorts.', 8, 'fortress', 0.95, undefined, 'Roi Ferrant'],
  ['Carreaux Perçants', 'La baliste vise les unités les plus robustes.', 8, 'ring', 0.9, undefined, undefined],
  ['Le Siège', 'Les engins de siège brisent les remparts.', 9, 'compartments', 0.9, undefined, undefined],
  ['Runes Oubliées', 'Les pièges runiques ralentissent et consument.', 9, 'core', 0.95, undefined, undefined],
  ['Le Col des Vents', 'Base éparpillée : ne laissez rien derrière vous.', 10, 'spread', 0.95, undefined, undefined],
  ['Forteresse Écarlate', 'Le brasier s\'intensifie sur une même cible.', 10, 'fortress', 1, undefined, 'Pyromancienne Vexa'],
  ['Le Labyrinthe Vert', 'Les chevaucheurs sautent les murs.', 11, 'maze', 0.95, undefined, undefined],
  ['Les Îles Suspendues', 'Une attaque aérienne s\'impose.', 11, 'island', 1, undefined, undefined],
  ['Bastion du Crépuscule', 'Les défenses gelées ne tirent plus.', 12, 'compartments', 1, undefined, undefined],
  ['La Tour Tempête', 'La tempête frappe plusieurs cibles à la fois.', 12, 'core', 1, undefined, undefined],
  ['Le Gardien des Âges', 'Combinez héros et sorts pour vaincre.', 13, 'fortress', 1, undefined, 'Golem Ancestral'],
  ['Cité de Verre', 'Une base dense : la foudre est votre alliée.', 13, 'ring', 1, undefined, undefined],
  ['Les Remparts Jumeaux', 'Deux anneaux de murs : préparez vos ingénieurs.', 14, 'maze', 1, undefined, undefined],
  ['Le Nid du Dragon', 'Les défenses aériennes sont légion.', 14, 'island', 1, undefined, undefined],
  ['Veille des Rois', 'Ultime répétition avant le trône.', 15, 'compartments', 1, undefined, undefined],
  ['Le Dernier Royaume', 'Conquérez le royaume le plus puissant.', 15, 'fortress', 1, undefined, 'L\'Empereur Sans-Nom'],
];

export const REGIONS = ['Vallée Verte', 'Marais Sombres', 'Monts de Givre', 'Désert d\'Ambre', 'Terres de Braise', 'Couronne Céleste'];

export const CAMPAIGN: CampaignLevel[] = L.map(([name, intro, cl, formation, fill, only, boss], i) => ({
  index: i + 1,
  name, intro, citadel: cl, formation, only, fill, boss,
  region: REGIONS[Math.floor(i / 5)],
  penalty: i < 10 ? 2 : 1,
  seed: 1000 + i * 7919,
  reward: { gold: Math.round(400 * Math.pow(1.45, i)), wood: Math.round(400 * Math.pow(1.45, i)), ...(i >= 14 ? { energy: Math.round(100 * Math.pow(1.3, i - 14)) } : {}) },
  firstStarBonus: 10 + i * 3,
}));

export function campaignUnlocked(stars: Record<number, number>, index: number): boolean {
  return index === 1 || (stars[index - 1] ?? 0) > 0;
}
