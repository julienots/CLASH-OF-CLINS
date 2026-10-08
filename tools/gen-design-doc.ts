// Génère docs/GAME_DESIGN.md à partir des données réelles du jeu.
import { writeFileSync } from 'node:fs';
import { BUILDING_LIST, maxLevelFor } from '../game/src/buildings/defs';
import { TRAINABLE, UNITS } from '../game/src/units/defs';
import { HEROES, EQUIPMENT } from '../game/src/heroes/defs';
import { SPELLS } from '../game/src/spells/defs';
import { TECH, BRANCHES } from '../game/src/research/tech';
import { CAMPAIGN } from '../game/src/campaign/campaign';
import { citadelUnlocks } from '../game/src/progression/progression';
import { EVENTS } from '../game/src/events/events';
import { IAP_PRODUCTS } from '../game/src/shop/catalog';
import { passTiers } from '../game/src/battlepass/pass';
import { FORMATIONS } from '../game/src/campaign/basegen';
import { fmt } from '../game/src/core/util';

const L: string[] = [];
const p = (s = '') => L.push(s);
const cost = (c: Record<string, number | undefined>) => Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${fmt(v!)} ${({ gold: 'or', wood: 'bois', energy: 'énergie', crystals: '💎' } as any)[k]}`).join(' + ') || '—';
p('# KINGDOMS — Document de game design (généré depuis le code)');
p();
p('> Ce document est produit par `tools/gen-design-doc.ts` à partir des fichiers de données : il reflète exactement le jeu.');
p();
p('## Boucle de jeu');
p('CONSTRUIRE → PRODUIRE → AMÉLIORER → ENTRAÎNER → ATTAQUER → GAGNER → AMÉLIORER → DÉFENDRE → RECOMMENCER');
p();
p('## Citadelle : 15 niveaux');
p('| Niveau | Coût | Débloque |'); p('|---|---|---|');
const cit = BUILDING_LIST.find(b => b.id === 'citadel')!;
for (let l = 1; l <= 15; l++) p(`| ${l} | ${cost(cit.levels[l - 1].cost as any)} | ${l === 1 ? 'Village de départ' : citadelUnlocks(l).join(' · ')} |`);
p();
p('## Bâtiments');
for (const cat of ['special', 'economy', 'military', 'defense', 'wall', 'trap', 'decoration']) {
  p(`### ${({ special: 'Spécial', economy: 'Économie', military: 'Militaire', defense: 'Défense', wall: 'Murs', trap: 'Pièges', decoration: 'Décorations' } as any)[cat]}`);
  p('| Bâtiment | Taille | Niveaux | Débloqué | Description |'); p('|---|---|---|---|---|');
  for (const d of BUILDING_LIST.filter(b => b.category === cat)) p(`| ${d.name} | ${d.size}×${d.size} | ${d.levels.length} | Citadelle ${d.counts.findIndex(n => n > 0) + 1} | ${d.desc} |`);
  p();
}
p('### Statistiques des défenses (niveau 1 → max)');
p('| Défense | Portée | Dégâts | Cadence | Cibles | Spécial |'); p('|---|---|---|---|---|---|');
for (const d of BUILDING_LIST.filter(b => b.category === 'defense')) {
  const a = d.levels[0].defense!, z = d.levels[d.levels.length - 1].defense!;
  p(`| ${d.name} | ${a.minRange ? a.minRange + '–' : ''}${a.range} | ${a.damage} → ${z.damage} | ${a.interval}s | ${a.targets === 'both' ? 'sol+air' : a.targets === 'air' ? 'air' : 'sol'} | ${[a.splash ? 'zone ' + a.splash : '', a.chain ? 'rebonds ×' + a.chain : '', a.multi ? a.multi + ' cibles' : '', a.ramp ? 'montée ×' + a.ramp : '', a.priority ?? ''].filter(Boolean).join(', ')} |`);
}
p();
p(`## Unités (${TRAINABLE.length})`);
p('| Unité | Rôle | Place | PV | DPS | Vitesse | Portée | Cible | Coût | Débloquée |'); p('|---|---|---|---|---|---|---|---|---|---|');
for (const u of TRAINABLE) p(`| ${u.name} | ${u.role} | ${u.housing} | ${u.hp} | ${u.dps} | ${u.speed} | ${u.range} | ${u.target} | ${cost(u.cost as any)} | ${u.building === 'workshop' ? 'Atelier' : u.temporary ? 'Saison' : 'Caserne'} ${u.unlockLevel} |`);
p();
p('## Héros');
for (const h of HEROES) { p(`### ${h.name} — ${h.title}`); p(`${h.desc}  `); p(`PV ${h.baseHp} · DPS ${h.baseDps} · Temple ${h.templeLevel} / Citadelle ${h.citadel}  `); p(`**Compétence** ${h.ability.name} : ${h.ability.desc}  `); p(`**Ultime** ${h.ultimate.name} : ${h.ultimate.desc}  `); p(`**Apparences** : ${h.skins.map(s => s.name).join(', ')}`); p(); }
p('### Équipement (Forge Runique)'); p('| Objet | Héros | Effet | Forge |'); p('|---|---|---|---|');
for (const e of EQUIPMENT) p(`| ${e.icon} ${e.name} | ${e.hero === 'any' ? 'Tous' : UNITS[e.hero]?.name ?? HEROES.find(h => h.id === e.hero)?.name} | ${e.desc} | ${e.forge} |`);
p();
p('## Sorts'); p('| Sort | Effet | Place | Recharge | Académie |'); p('|---|---|---|---|---|');
for (const s of SPELLS) p(`| ${s.icon} ${s.name} | ${s.desc} | ${s.housing} | ${s.cooldown}s | ${s.academy} |`);
p();
p('## Arbre technologique');
for (const b of BRANCHES) { p(`### ${b.icon} ${b.name}`); for (const t of TECH.filter(x => x.branch === b.id)) p(`- **${t.name}** (palier ${t.tier}, labo ${t.lab}) : ${t.desc}${t.requires.length ? ` — requiert ${t.requires.join(', ')}` : ''}`); p(); }
p('## Campagne (30 niveaux)'); p('| # | Région | Niveau | Mécanique introduite | Formation |'); p('|---|---|---|---|---|');
for (const c of CAMPAIGN) p(`| ${c.index} | ${c.region} | ${c.name}${c.boss ? ' 👑' : ''} | ${c.intro} | ${FORMATIONS[c.formation]} (Citadelle ${c.citadel}) |`);
p();
p('## Événements'); for (const e of Object.values(EVENTS)) p(`- ${e.icon} **${e.name}** : ${e.desc}`);
p();
p('## Royal Pass (30 paliers)'); p('| Palier | Gratuit | Premium |'); p('|---|---|---|');
const r = (x: any) => x.kind === 'crystals' ? `💎 ${x.amount}` : x.kind === 'resource' ? `${x.res} ×${x.amount}·CL²` : x.name;
for (const t of passTiers()) p(`| ${t.tier} | ${r(t.free)} | ${r(t.premium)} |`);
p();
p('## Achats intégrés'); p('| ID produit | Nom | Contenu | Prix indicatif | Type |'); p('|---|---|---|---|---|');
for (const x of IAP_PRODUCTS) p(`| \`${x.id}\` | ${x.name} | ${x.desc} | ${x.price} | ${x.consumable ? 'consommable' : 'non consommable'} |`);
void maxLevelFor;
writeFileSync('docs/GAME_DESIGN.md', L.join('\n') + '\n');
console.log('✔ docs/GAME_DESIGN.md');
