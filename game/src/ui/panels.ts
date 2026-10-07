// Panneaux : construction, bâtiment, armée, recherche, héros, marché, ouvriers.
import type { App, PanelHandle } from './app';
import { h, clear } from './dom';
import { buildingIcon, unitIcon, heroIcon, costView, UNIT_EMOJI } from './icons';
import { BUILDING_LIST, bdef, blevel, maxCount, maxLevelFor, type BuildingCategory } from '../buildings/defs';
import { citadelLevel, countOf, canBuildMore, armyCapacity, spellCapacity, storageCap, producerRates, bestLevel } from '../village/query';
import { buildCost, buildTime, finishNowCost } from '../buildings/construction';
import { fmt, fmtTime, canAfford } from '../core/util';
import { citadelUnlocks } from '../progression/progression';
import { TRAINABLE, UNITS, unitStats } from '../units/defs';
import { SPELLS, spellPower } from '../spells/defs';
import { housingOf, spellHousingOf, queuedHousing, queuedSpellHousing, isUnitUnlocked, trainingRemaining, finishTrainingCost, unitTrainTime } from '../army/army';
import { researchOption, researchLevel, finishResearchCost } from '../research/research';
import { BRANCHES, TECH, TECH_BY_ID } from '../research/tech';
import { HEROES, EQUIPMENT, heroCap, heroUpgradeCost } from '../heroes/defs';
import { heroCombatStats, finishHeroCost } from '../heroes/heroes';
import { crystalsForMissing, marketFee } from '../resources/economy';
import { audio } from '../audio/audio';
import { RES_ICON, type ResKey } from '../core/types';
import { BUILDING_EMOJI } from './icons';
export * from './panels2';

const CATS: { id: BuildingCategory | 'all'; name: string }[] = [
  { id: 'economy', name: '🪙 Économie' }, { id: 'military', name: '⚔️ Militaire' }, { id: 'defense', name: '🏰 Défense' },
  { id: 'wall', name: '🧱 Murs' }, { id: 'trap', name: '💣 Pièges' }, { id: 'special', name: '✨ Spécial' }, { id: 'decoration', name: '🌳 Décor' },
];

export function tabs(names: string[], cur: number, on: (i: number) => void): HTMLElement {
  return h('div', { class: 'tabs' }, names.map((n, i) => h('button', { class: 'tab' + (i === cur ? ' on' : ''), onclick: () => { audio.sfx('click'); on(i); } }, n)));
}

let buildTab = 0;
export function openBuildMenu(app: App, onPick: (type: string) => void) {
  const p = app.openPanel('Construire', (body, ph) => {
    const s = app.s, cl = citadelLevel(s), now = Date.now();
    body.append(tabs(CATS.map(c => c.name), buildTab, i => { buildTab = i; ph.refresh(); }));
    const grid = h('div', { class: 'grid', style: { marginTop: '10px' } });
    const cat = CATS[buildTab].id;
    for (const d of BUILDING_LIST) {
      if (d.category !== cat) continue;
      const have = countOf(s, d.id);
      const max = d.category === 'decoration' ? 10 : maxCount(d.id, cl);
      const unlockAt = d.counts.findIndex(n => n > 0) + 1;
      const can = canBuildMore(s, d.id);
      const cost = buildCost(s, d.id, 1, now);
      const time = buildTime(s, d.id, 1);
      const locked = max === 0;
      grid.append(h('div', { class: 'card' + (locked || !can ? ' locked' : ''), 'data-build': d.id, onclick: () => {
        if (locked) { app.toast(`Débloqué à la Citadelle niveau ${unlockAt}`, 'bad'); return; }
        if (!can) { app.toast('Limite atteinte : améliorez la Citadelle', 'bad'); return; }
        p.close(); onPick(d.id);
      } },
        h('div', { class: 'art' }, buildingIcon(d.id, 1)),
        h('h3', null, d.name),
        h('div', { class: 'muted' }, locked ? `🔒 Citadelle niv. ${unlockAt}` : `${have}/${max} construits${time ? ' · ⏱ ' + fmtTime(time) : ''}`),
        costView(cost, s.resources)));
    }
    body.append(grid);
  }, { wide: true });
}

export function finishNowDialog(app: App, uid: number) {
  const b = app.s.buildings.find(x => x.uid === uid);
  if (!b?.build) return;
  const c = finishNowCost(b, Date.now());
  app.confirm('Terminer maintenant', `Terminer immédiatement pour 💎 ${c} ?`, `💎 ${c}`, () => { if (app.act('finish', { uid }).ok) audio.sfx('upgrade'); }, 'purple');
}

export function upgradeWallsDialog(app: App, uids: number[]) {
  const s = app.s, now = Date.now();
  const walls = uids.map(u => s.buildings.find(b => b.uid === u)!).filter(Boolean);
  if (!walls.length) return;
  const cost = buildCost(s, 'wall', walls[0].level + 1, now);
  const total = Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, (v ?? 0) * walls.length]));
  app.openPanel('Améliorer une rangée de murs', (body, ph) => {
    body.append(h('p', null, `${walls.length} murailles niveau ${walls[0].level} → ${walls[0].level + 1}`), costView(total, s.resources),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '10px' } }, h('button', { class: 'btn green', onclick: () => { const r = app.act('upgradeMany', { uids }); if (r.ok) { audio.sfx('upgrade'); app.toast(`${r.data} murailles améliorées`, 'good'); ph.close(); } } }, 'Améliorer')));
  });
}

export function openBuildingInfo(app: App, uid: number, focusUpgrade = false) {
  app.openPanel('Bâtiment', (body, ph) => {
    const s = app.s, now = Date.now();
    const b = s.buildings.find(x => x.uid === uid);
    if (!b) { ph.close(); return; }
    const d = bdef(b.type);
    const L = blevel(b.type, Math.max(1, b.level));
    const next = d.levels[b.level];
    (ph.el.querySelector('h2') as HTMLElement).textContent = `${d.name} · niveau ${b.level}`;
    const stats: [string, string, string?][] = [['PV', fmt(L.hp), next ? fmt(next.hp) : undefined]];
    if (L.produces) for (const pr of producerRates(s, b, now)) stats.push([`Production ${RES_ICON[pr.res]}/h`, fmt(pr.perHour), next?.produces ? fmt(next.produces.find(x => x.res === pr.res)?.perHour ?? 0) : undefined]);
    if (L.capacity) stats.push(['Capacité interne', fmt(L.capacity), next?.capacity ? fmt(next.capacity) : undefined]);
    if (L.storage) for (const [k, v] of Object.entries(L.storage)) if (v) stats.push([`Stockage ${RES_ICON[k as ResKey]}`, fmt(v), next?.storage ? fmt((next.storage as any)[k] ?? 0) : undefined]);
    if (L.defense) {
      const D = L.defense;
      stats.push(['Dégâts / tir', fmt(D.damage), next?.defense ? fmt(next.defense.damage) : undefined], ['Cadence', `${D.interval}s`], ['Portée', `${D.minRange ? D.minRange + '–' : ''}${D.range} cases`], ['Cibles', D.targets === 'both' ? 'Sol & air' : D.targets === 'air' ? 'Air' : 'Sol']);
      if (D.splash) stats.push(['Zone', `${D.splash} case(s)`]);
    }
    if (L.trap) stats.push(['Dégâts', fmt(L.trap.damage), next?.trap ? fmt(next.trap.damage) : undefined], ['Cibles', L.trap.targets === 'air' ? 'Air' : L.trap.targets === 'both' ? 'Sol & air' : 'Sol']);
    if (L.housing) stats.push([b.type === 'academy' ? 'Capacité de sorts' : 'Capacité d\'armée', String(L.housing), next?.housing ? String(next.housing) : undefined]);
    if (L.value !== undefined) stats.push([b.type === 'market' ? 'Commission' : b.type === 'observatory' ? 'Pièges détectés' : b.type === 'guild_portal' ? 'Renforts' : 'Valeur', `${L.value}${b.type === 'market' || b.type === 'observatory' ? ' %' : ''}`, next?.value !== undefined ? `${next.value}` : undefined]);
    body.append(h('div', { class: 'row' }, h('div', { class: 'art', style: { width: '160px' } }, buildingIcon(b.type, Math.max(1, b.level), b.type === 'citadel' ? s.inventory.citadelSkin : undefined)), h('p', { class: 'muted', style: { flex: '1' } }, d.desc)));
    body.append(h('div', { class: 'list' }, stats.map(([k, v, n]) => h('div', { class: 'stat' }, k, h('span', null, h('b', null, v), n && n !== v ? h('span', { style: { color: '#5bd16b' } }, `  → ${n}`) : null)))));
    if (b.type === 'citadel') {
      const un = citadelUnlocks(b.level + 1);
      if (b.level < 15) body.append(h('div', { class: 'section-title' }, `Citadelle niveau ${b.level + 1} débloque`), h('div', { class: 'list' }, un.slice(0, 18).map(u => h('div', { class: 'stat' }, u))));
    }
    if (b.build) {
      body.append(h('div', { class: 'section-title' }, 'Chantier en cours'), h('div', { class: 'progress' }, h('i', { style: { width: Math.round(100 * (now - b.build.startAt) / (b.build.endAt - b.build.startAt)) + '%' } })), h('p', null, `Reste ${fmtTime((b.build.endAt - now) / 1000)}`),
        h('button', { class: 'btn purple', onclick: () => finishNowDialog(app, uid) }, `💎 ${finishNowCost(b, now)} Terminer`));
    } else if (next && d.category !== 'decoration') {
      const cost = buildCost(s, b.type, b.level + 1, now);
      const time = buildTime(s, b.type, b.level + 1);
      const locked = next.citadel > citadelLevel(s);
      const missingC = crystalsForMissing(s, cost);
      body.append(h('div', { class: 'section-title' }, `Amélioration niveau ${b.level + 1}`),
        h('div', { class: 'row between' }, costView(cost, s.resources), h('span', { class: 'muted' }, time ? '⏱ ' + fmtTime(time) : 'Instantané')),
        locked ? h('p', { class: 'muted' }, `🔒 Requiert la Citadelle niveau ${next.citadel}`) :
          h('div', { class: 'row', style: { marginTop: '10px', justifyContent: 'flex-end' } },
            !canAfford(s.resources, cost) && missingC > 0 ? h('button', { class: 'btn purple', onclick: () => { if (app.act('upgradeWithCrystals', { uid }).ok) { audio.sfx('build'); ph.close(); } } }, `💎 ${missingC} + Améliorer`) : null,
            h('button', { class: 'btn green' + (focusUpgrade ? ' pulse' : ''), 'data-btn': 'Améliorer', onclick: () => { if (app.act('upgrade', { uid }).ok) { audio.sfx('build'); ph.close(); } } }, '⬆️ Améliorer')));
    } else if (!next) body.append(h('p', { class: 'muted' }, '★ Niveau maximum atteint'));
  });
}

// ───── Armée ─────
let armyTab = 0;
export function openArmy(app: App) {
  app.openPanel('Armée', (body, ph) => {
    const s = app.s, now = Date.now();
    body.append(tabs(['🪖 Troupes', '📜 Sorts', '🦸 Héros'], armyTab, i => { armyTab = i; ph.refresh(); }));
    if (armyTab === 2) { body.append(heroesView(app)); return; }
    if (armyTab === 0) {
      const cap = armyCapacity(s), used = housingOf(s.army.units), queued = queuedHousing(s);
      const guild = housingOf(s.army.guildTroops);
      body.append(h('div', { class: 'row between', style: { margin: '10px 0' } },
        h('div', null, h('b', null, `Camps : ${used}/${cap}`), queued ? h('span', { class: 'muted' }, ` (+${queued} en formation)`) : null, guild ? h('span', { class: 'muted' }, ` · 🛡️ Renforts : ${guild}`) : null),
        s.army.queue.length ? h('button', { class: 'btn purple small', onclick: () => app.act('finishTraining', {}, { sound: 'train' }) }, `💎 ${finishTrainingCost(s)} Terminer · ${fmtTime(trainingRemaining(s))}`) : null));
      body.append(h('div', { class: 'progress' }, h('i', { style: { width: Math.min(100, Math.round(100 * (used + queued) / Math.max(1, cap))) + '%' } })));
      // armée prête
      const ready = Object.entries(s.army.units).filter(([, n]) => n > 0);
      if (ready.length) body.append(h('div', { class: 'section-title' }, 'Armée prête'), h('div', { class: 'row' }, ready.map(([id, n]) => h('div', { class: 'chip' }, `${UNIT_EMOJI[id] ?? ''} ${UNITS[id].name} ×${n}`))));
      if (s.army.queue.length) {
        const groups: { id: string; n: number; first: number }[] = [];
        s.army.queue.forEach((q, i) => { const g = groups[groups.length - 1]; if (g && g.id === q.id) g.n++; else groups.push({ id: q.id, n: 1, first: i }); });
        body.append(h('div', { class: 'section-title' }, 'En formation'), h('div', { class: 'row' }, groups.map(g => h('button', { class: 'chip', onclick: () => app.act('cancelTrain', { index: g.first + g.n - 1 }) }, `${UNIT_EMOJI[g.id] ?? ''} ×${g.n} ✕`))));
      }
      body.append(h('div', { class: 'section-title' }, 'Entraîner'));
      const grid = h('div', { class: 'grid' });
      for (const u of TRAINABLE) {
        const unlocked = isUnitUnlocked(s, u.id, now);
        if (u.temporary && !unlocked) continue;
        const lvl = researchLevel(s, u.id);
        const st = unitStats(u.id, lvl);
        grid.append(h('div', { class: 'card' + (unlocked ? '' : ' locked'), 'data-unit': u.id },
          h('div', { class: 'art' }, unitIcon(u.id)),
          h('h3', null, `${u.name} `, h('span', { class: 'muted' }, `niv. ${lvl}`)),
          h('div', { class: 'muted' }, u.temporary ? '⏳ Unité de saison · ' + u.role : u.role),
          h('div', { class: 'muted' }, `❤️ ${fmt(st.hp)} · ⚔️ ${Math.round(st.dps)}/s · 🏠 ${u.housing}${u.flying ? ' · ✈️' : ''}`),
          unlocked ? h('div', { class: 'row between' }, costView(u.cost, s.resources), h('span', { class: 'muted' }, fmtTime(unitTrainTime(s, u.id)))) : h('div', { class: 'muted' }, `🔒 ${u.building === 'workshop' ? 'Atelier' : 'Caserne'} niveau ${u.unlockLevel}`),
          unlocked ? h('div', { class: 'row' }, ...[1, 5, 10].map(n => h('button', { class: 'btn small green', onclick: () => { if (app.act('train', { unit: u.id, count: n }).ok) audio.sfx('train'); } }, `+${n}`))) : null));
      }
      body.append(grid);
    } else {
      const cap = spellCapacity(s);
      if (!cap) { body.append(h('p', { class: 'muted', style: { marginTop: '12px' } }, '🔒 Construisez l\'Académie des Arcanes (Citadelle 5) pour préparer des sorts.')); return; }
      const used = spellHousingOf(s.army.spells), q = queuedSpellHousing(s);
      body.append(h('p', null, h('b', null, `Sorts : ${used}/${cap}`), q ? ` (+${q} en préparation)` : ''));
      const grid = h('div', { class: 'grid' });
      for (const sp of SPELLS) {
        const unlocked = bestLevel(s, 'academy') >= sp.academy;
        const lvl = researchLevel(s, sp.id);
        grid.append(h('div', { class: 'card' + (unlocked ? '' : ' locked') },
          h('div', { class: 'art', style: { fontSize: '44px' } }, sp.icon),
          h('h3', null, `${sp.name} `, h('span', { class: 'muted' }, `niv. ${lvl} ×${s.army.spells[sp.id] ?? 0}`)),
          h('div', { class: 'muted' }, sp.desc),
          h('div', { class: 'muted' }, `Puissance ${Math.round(spellPower(sp.id, lvl))} · Recharge ${sp.cooldown}s · 🏠 ${sp.housing}`),
          unlocked ? h('div', { class: 'row between' }, costView(sp.cost, s.resources), h('button', { class: 'btn small green', onclick: () => { if (app.act('brew', { spell: sp.id }).ok) audio.sfx('magic'); } }, '+1')) : h('div', { class: 'muted' }, `🔒 Académie niveau ${sp.academy}`)));
      }
      body.append(grid);
    }
  }, { wide: true });
}

// ───── Recherche ─────
let resTab = 0;
export function openResearch(app: App) {
  app.openPanel('Laboratoire', (body, ph) => {
    const s = app.s, now = Date.now();
    if (!bestLevel(s, 'laboratory')) { body.append(h('p', null, '🔒 Construisez un Laboratoire (Citadelle 3).')); return; }
    const a = s.research.active;
    if (a) body.append(h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, `En cours : ${a.kind === 'tech' ? TECH_BY_ID[a.id].name : (UNITS[a.id]?.name ?? SPELLS.find(x => x.id === a.id)?.name)} ${a.kind !== 'tech' ? 'niv. ' + a.toLevel : ''}`), h('div', { class: 'muted' }, `Reste ${fmtTime((a.endAt - now) / 1000)}`)),
      h('button', { class: 'btn purple small', onclick: () => app.act('finishResearch', {}, { sound: 'upgrade' }) }, `💎 ${finishResearchCost(s, now)}`)));
    body.append(tabs(['⚔️ Unités', '📜 Sorts', '🌳 Arbre technologique'], resTab, i => { resTab = i; ph.refresh(); }));
    const opt = (kind: 'unit' | 'spell' | 'tech', id: string, title: string, icon: Node | string, desc: string) => {
      const o = researchOption(s, kind, id);
      return h('div', { class: 'card' + (o.available ? '' : ' locked') },
        h('div', { class: 'art', style: { fontSize: '40px' } }, icon), h('h3', null, title), h('div', { class: 'muted' }, desc),
        o.available ? h('div', null, costView(o.cost, s.resources), h('div', { class: 'row between' }, h('span', { class: 'muted' }, '⏱ ' + fmtTime(o.time)), h('button', { class: 'btn small green', onclick: () => { if (app.act('research', { kind, id }).ok) audio.sfx('magic'); } }, 'Rechercher'))) : h('div', { class: 'muted' }, o.reason ?? ''));
    };
    const grid = h('div', { class: 'grid', style: { marginTop: '10px' } });
    if (resTab === 0) for (const u of TRAINABLE) { if (u.temporary) continue; const l = researchLevel(s, u.id); grid.append(opt('unit', u.id, `${u.name} ${l} → ${l + 1}`, unitIcon(u.id), `Max ${u.maxLevel} · +13 % PV, +12 % dégâts par niveau`)); }
    if (resTab === 1) for (const sp of SPELLS) { const l = researchLevel(s, sp.id); grid.append(opt('spell', sp.id, `${sp.name} ${l} → ${l + 1}`, sp.icon, `Max ${sp.maxLevel} · plus puissant`)); }
    if (resTab === 2) {
      for (const br of BRANCHES) {
        body.append(h('div', { class: 'section-title', style: { color: br.color } }, `${br.icon} ${br.name}`));
        const row = h('div', { class: 'tree-branch' });
        for (const n of TECH.filter(t => t.branch === br.id)) {
          const owned = !!s.research.tech[n.id];
          const card = opt('tech', n.id, `${owned ? '✅ ' : ''}${n.name}`, ['I', 'II', 'III', 'IV'][n.tier - 1], n.desc + (n.requires.length ? ` · Requiert : ${n.requires.map(r => TECH_BY_ID[r].name).join(', ')}` : ''));
          card.classList.add('tree-node'); if (owned) card.classList.remove('locked');
          row.append(card);
        }
        body.append(row);
      }
      return;
    }
    body.append(grid);
  }, { wide: true });
}

// ───── Héros ─────
function heroesView(app: App): HTMLElement {
  const s = app.s, now = Date.now();
  const wrap = h('div', { class: 'list', style: { marginTop: '10px' } });
  for (const hd of HEROES) {
    const st = s.heroes[hd.id];
    if (!st) { wrap.append(h('div', { class: 'item' }, h('div', { style: { filter: 'grayscale(1)' } }, heroIcon(hd.id)), h('div', { class: 'grow' }, h('b', null, `${hd.name} — ${hd.title}`), h('div', { class: 'muted' }, `🔒 Temple des Héros niv. ${hd.templeLevel} · Citadelle ${hd.citadel}`), h('div', { class: 'muted' }, hd.desc)))); continue; }
    const stats = heroCombatStats(s, hd.id);
    const cap = heroCap(citadelLevel(s));
    const up = heroUpgradeCost(hd.id, st.level + 1);
    const eq = h('div', { class: 'row' }, ...[0, 1].map(i => { const e = EQUIPMENT.find(x => x.id === st.equipment[i]); return h('span', { class: 'chip' }, e ? `${e.icon} ${e.name}` : '— vide —'); }));
    wrap.append(h('div', { class: 'item', style: { alignItems: 'flex-start' } },
      heroIcon(hd.id, st.skin),
      h('div', { class: 'grow' },
        h('b', null, `${hd.name} niv. ${st.level}/${cap}`), h('div', { class: 'muted' }, hd.title),
        h('div', { class: 'muted' }, `❤️ ${fmt(stats.hp)} · ⚔️ ${Math.round(stats.dps)}/s`),
        h('div', { class: 'muted' }, `✨ ${hd.ability.name} : ${hd.ability.desc}`),
        h('div', { class: 'muted' }, `💥 ${hd.ultimate.name} : ${hd.ultimate.desc}`),
        eq,
        h('div', { class: 'row', style: { marginTop: '6px' } },
          st.upgradeEndAt ? h('button', { class: 'btn small purple', onclick: () => app.act('heroFinish', { id: hd.id }, { sound: 'upgrade' }) }, `💎 ${finishHeroCost(s, hd.id, now)} · ${fmtTime((st.upgradeEndAt - now) / 1000)}`)
            : st.level < cap ? h('button', { class: 'btn small green', onclick: () => app.act('heroUpgrade', { id: hd.id }, { sound: 'upgrade' }) }, `⬆️ ${RES_ICON.energy} ${fmt(up.cost.energy ?? 0)} · ${fmtTime(up.time)}`) : h('span', { class: 'muted' }, 'Niveau max pour cette Citadelle'),
          h('button', { class: 'btn small ghost', onclick: () => openHeroGear(app, hd.id) }, '🎒 Équipement'),
          h('button', { class: 'btn small ghost', onclick: () => openHeroSkins(app, hd.id) }, '🎨 Apparence')))));
  }
  return wrap;
}
export function openHeroes(app: App) { armyTab = 2; openArmy(app); }

function openHeroGear(app: App, heroId: string) {
  app.openPanel('Équipement & Forge', body => {
    const s = app.s; const st = s.heroes[heroId];
    const forge = bestLevel(s, 'forge');
    body.append(h('p', { class: 'muted' }, forge ? `Forge Runique niveau ${forge}` : '🔒 Construisez la Forge Runique (Citadelle 6) pour forger de l\'équipement.'));
    const grid = h('div', { class: 'grid' });
    for (const e of EQUIPMENT) {
      if (e.hero !== 'any' && e.hero !== heroId) continue;
      const owned = s.inventory.equipment.includes(e.id);
      const equipped = st.equipment.includes(e.id);
      grid.append(h('div', { class: 'card' + (owned || forge >= e.forge ? '' : ' locked') }, h('div', { class: 'art', style: { fontSize: '40px' } }, e.icon), h('h3', null, e.name), h('div', { class: 'muted' }, e.desc),
        owned ? h('button', { class: 'btn small ' + (equipped ? 'red' : 'green'), onclick: () => app.act(equipped ? 'unequip' : 'equip', { hero: heroId, item: e.id }) }, equipped ? 'Retirer' : 'Équiper')
          : h('div', null, costView(e.cost, s.resources), h('button', { class: 'btn small gold', onclick: () => app.act('forge', { id: e.id }, { sound: 'upgrade' }) }, `⚒️ Forger (niv. ${e.forge})`))));
    }
    body.append(grid);
  });
}
function openHeroSkins(app: App, heroId: string) {
  app.openPanel('Apparences', body => {
    const s = app.s, hd = HEROES.find(x => x.id === heroId)!;
    const grid = h('div', { class: 'grid' });
    for (const sk of hd.skins) {
      const owned = sk.crystals === 0 || s.inventory.cosmetics.includes(sk.id);
      grid.append(h('div', { class: 'card' }, h('div', { class: 'art' }, heroIcon(heroId, sk.id)), h('h3', null, sk.name),
        owned ? h('button', { class: 'btn small green', onclick: () => app.act('heroSkin', { hero: heroId, skin: sk.id }) }, s.heroes[heroId].skin === sk.id ? '✔ Active' : 'Utiliser')
          : h('button', { class: 'btn small purple', onclick: () => app.act('buyItem', { id: sk.id }, { sound: 'reward' }) }, `💎 ${sk.crystals}`)));
    }
    body.append(h('p', { class: 'muted' }, 'Les apparences sont purement cosmétiques.'), grid);
  });
}

// ───── Marché ─────
export function openMarket(app: App) {
  app.openPanel('Marché', body => {
    const s = app.s;
    const fee = Math.round(marketFee(s) * 100);
    body.append(h('p', null, `Commission actuelle : ${fee} %`));
    for (const from of ['gold', 'wood'] as const) {
      const to = from === 'gold' ? 'wood' : 'gold';
      body.append(h('div', { class: 'item' }, h('div', { class: 'grow' }, `${RES_ICON[from]} → ${RES_ICON[to]}`),
        ...[1000, 10000, 100000].map(n => h('button', { class: 'btn small gold', onclick: () => { const r = app.act('trade', { from, amount: n }); if (r.ok) app.toast(`+${fmt(r.data)} ${RES_ICON[to]}`, 'good'); } }, fmt(n)))));
    }
  });
}

export function openBuilders(app: App, select: (uid: number) => void) {
  app.openPanel('Ouvriers', (body, ph: PanelHandle) => {
    const s = app.s, now = Date.now();
    const busy = s.buildings.filter(b => b.build);
    if (!busy.length) body.append(h('p', { class: 'muted' }, 'Tous les ouvriers sont disponibles. Améliorez quelque chose !'));
    for (const b of busy) body.append(h('div', { class: 'item' }, h('span', { style: { fontSize: '26px' } }, BUILDING_EMOJI[b.type] ?? '🏗️'), h('div', { class: 'grow' }, h('b', null, `${bdef(b.type).name} → ${b.build!.toLevel}`), h('div', { class: 'progress' }, h('i', { style: { width: Math.round(100 * (now - b.build!.startAt) / (b.build!.endAt - b.build!.startAt)) + '%' } }))),
      h('span', { class: 'muted' }, fmtTime((b.build!.endAt - now) / 1000)), h('button', { class: 'btn small ghost', onclick: () => { ph.close(); select(b.uid); } }, 'Voir')));
    body.append(h('p', { class: 'muted' }, `Ouvriers : ${countOf(s, 'builder_hut')}/5. Construisez des Ateliers d'ouvrier (onglet Spécial) pour en ajouter.`));
    // suggestions d'améliorations
    const cl = citadelLevel(s);
    const sugg = s.buildings.filter(b => !b.build && b.level < maxLevelFor(b.type, cl) && bdef(b.type).category !== 'wall' && bdef(b.type).category !== 'decoration').slice(0, 8);
    if (sugg.length) body.append(h('div', { class: 'section-title' }, 'Améliorations possibles'), h('div', { class: 'list' }, sugg.map(b => { const c = buildCost(s, b.type, b.level + 1, now); return h('div', { class: 'item' }, h('div', { class: 'grow' }, `${bdef(b.type).name} ${b.level} → ${b.level + 1}`), costView(c, s.resources), h('button', { class: 'btn small green', onclick: () => app.act('upgrade', { uid: b.uid }, { sound: 'build' }) }, '⬆️')); })));
    void storageCap; void clear;
  });
}
