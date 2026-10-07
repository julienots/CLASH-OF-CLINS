// Panneaux : attaque, campagne, guildes & guerres, boutique, pass, missions, monde, profil, classements, réglages.
import type { App } from './app';
import { h } from './dom';
import { costView, buildingIcon, heroIcon } from './icons';
import { fmt, fmtTime } from '../core/util';
import { RES_ICON, type ResKey, type Resources } from '../core/types';
import { citadelLevel, bestLevel } from '../village/query';
import { findOpponent, campaignOpponent, villageOpponent, invasionReward, invasionRewardReady, type Opponent } from '../combat/setup';
import { totalLoot, FORMATIONS } from '../campaign/basegen';
import { CAMPAIGN, campaignUnlocked, REGIONS } from '../campaign/campaign';
import { housingOf } from '../army/army';
import { suggestedGuilds, EMBLEMS, GUILD_CREATE_COST, guildXpForLevel, guildPerks, portalCapacity, requirePortal } from '../guilds/guild';
import { canStartWar, warReward, warOpponent, fastForwardWar } from '../wars/war';
import { IAP_PRODUCTS, crystalCatalog, THEMES, CITADEL_SKINS } from '../shop/catalog';
import { passTiers, passTier, PASS_TIERS, XP_PER_TIER, PASS_CRYSTAL_PRICE, type Reward } from '../battlepass/pass';
import { SEASON_MISSIONS, missionDef } from '../progression/missions';
import { ACHIEVEMENTS, achievementProgress, xpForLevel } from '../progression/progression';
import { currentEvent, upcomingEvents, currentSeason, EVENTS } from '../events/events';
import { WORLD_REGIONS, worldSites, regionDiscovered, siteReady } from '../world/world';
import { HEROES } from '../heroes/defs';
import { UNITS } from '../units/defs';
import { audio } from '../audio/audio';
import { Rng, hashString } from '../core/rng';
import { randomName } from '../campaign/basegen';
import { isOnline, serverConfigured, call, checkOnline } from '../networking/api';
import { MESSAGES } from '../purchases/iap';
import { bus } from '../core/events';
import { tabs, openResearch, openHeroes } from './panels';

const lootLine = (r: Partial<Resources>) => h('div', { class: 'cost' }, ...(Object.entries(r) as [ResKey, number][]).filter(([, v]) => v > 0).map(([k, v]) => h('span', null, `${RES_ICON[k]} ${fmt(v)}`)));

// ───── Attaque ─────
export function openAttack(app: App) {
  app.openPanel('Attaquer', (body, ph) => {
    const s = app.s, now = Date.now();
    const army = housingOf(s.army.units) + housingOf(s.army.guildTroops);
    body.append(h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, `Armée prête : ${army} places`), h('div', { class: 'muted' }, `${Object.keys(s.heroes).length} héros · ${Object.values(s.army.spells).reduce((a, b) => a + b, 0)} sorts`)), army === 0 ? h('span', { class: 'chip', style: { color: '#ff9b9b' } }, 'Entraînez des troupes !') : null));
    const card = (icon: string, title: string, desc: string, btn: HTMLElement) => h('div', { class: 'item', style: { padding: '12px' } }, h('span', { style: { fontSize: '34px' } }, icon), h('div', { class: 'grow' }, h('b', null, title), h('div', { class: 'muted' }, desc)), btn);
    body.append(h('div', { class: 'list', style: { marginTop: '10px' } },
      card('⚔️', 'Raid multijoueur', 'Trouvez un seigneur à piller. Gagnez du butin et des trophées.', h('button', { class: 'btn gold', 'data-btn': 'Raid', onclick: () => { ph.close(); openRaidSearch(app, (Math.random() * 2 ** 31) >>> 0); } }, 'Chercher')),
      card('🗺️', 'Campagne', `${Object.values(s.campaign.stars).reduce((a, b) => a + b, 0)}/90 ★ · 30 niveaux dans 6 régions.`, h('button', { class: 'btn green', 'data-btn': 'Campagne', onclick: () => { ph.close(); openCampaign(app); } }, 'Jouer')),
      card('🛡️', 'Défendre le village', invasionRewardReady(s, now) ? `Repoussez une horde de monstres. Récompense : ${Object.entries(invasionReward(s, 0)).map(([k, v]) => RES_ICON[k as ResKey] + fmt(v as number)).join(' ')}` : 'Entraînement défensif (récompense en recharge).', h('button', { class: 'btn red', 'data-btn': 'Défendre', onclick: () => { ph.close(); app.nav.invasion(); } }, 'Défendre')),
      s.war?.phase === 'battle' ? card('🏳️', 'Guerre de guilde', `${s.war.attacksLeft} attaque(s) restante(s) contre ${s.war.enemyName}.`, h('button', { class: 'btn purple', onclick: () => { ph.close(); openWar(app); } }, 'Guerre')) : null,
      card('🌍', 'Carte du monde', 'Villages, gisements et événements à découvrir.', h('button', { class: 'btn ghost', onclick: () => { ph.close(); openWorld(app); } }, 'Explorer'))));
  });
}

function opponentPreview(app: App, opp: Opponent, body: HTMLElement) {
  const loot = totalLoot(opp.loot);
  body.append(h('div', { class: 'item' }, h('span', { style: { fontSize: '40px' } }, '🏰'), h('div', { class: 'grow' }, h('b', null, opp.name), h('div', { class: 'muted' }, `Citadelle ${opp.citadel} · ${FORMATIONS[opp.formation]}${opp.trophies ? ' · 🏆 ' + opp.trophies : ''}`), h('div', { class: 'muted' }, `${opp.buildings.filter(b => b.type !== 'wall').length} bâtiments · ${opp.buildings.filter(b => b.type === 'wall').length} murs${opp.heroes?.length ? ' · héros en défense : ' + opp.heroes.map(x => HEROES.find(y => y.id === x.id)?.name).join(', ') : ''}`))));
  if (loot.gold || loot.wood || loot.energy) body.append(h('div', { class: 'section-title' }, 'Butin disponible'), lootLine(loot));
}

export function openRaidSearch(app: App, seed: number) {
  const s = app.s;
  const opp = findOpponent(s, seed, Date.now());
  const nextCost = Math.max(10, citadelLevel(s) * citadelLevel(s) * 15);
  app.openPanel('Adversaire trouvé', (body, ph) => {
    opponentPreview(app, opp, body);
    body.append(h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } },
      h('button', { class: 'btn ghost', onclick: () => {
        if (s.resources.gold < nextCost) { app.toast('Or insuffisant', 'bad'); return; }
        s.resources.gold -= nextCost; app.changed(); ph.close(); openRaidSearch(app, (seed * 1103515245 + 12345) >>> 0);
      } }, `Suivant · 🪙 ${fmt(nextCost)}`),
      h('button', { class: 'btn gold', 'data-btn': 'Lancer', onclick: () => { ph.close(); app.nav.battle(opp, { kind: 'raid', seed }); } }, '⚔️ Attaquer')));
  });
}

export function openCampaign(app: App) {
  app.openPanel('Campagne', body => {
    const s = app.s;
    for (let r = 0; r < REGIONS.length; r++) {
      body.append(h('div', { class: 'section-title' }, `${r + 1}. ${REGIONS[r]}`));
      const list = h('div', { class: 'list' });
      for (const lv of CAMPAIGN.slice(r * 5, r * 5 + 5)) {
        const st = s.campaign.stars[lv.index] ?? 0;
        const open = campaignUnlocked(s.campaign.stars, lv.index);
        list.append(h('div', { class: 'item' + (open ? '' : ' locked'), style: { opacity: open ? '1' : '.5' } },
          h('span', { class: 'chip' }, `#${lv.index}`),
          h('div', { class: 'grow' }, h('b', null, lv.name + (lv.boss ? ' 👑' : '')), h('div', { class: 'muted' }, `💡 ${lv.intro}`), h('div', { class: 'muted' }, `Puissance : Citadelle ${lv.citadel} · ${FORMATIONS[lv.formation]}`), lootLine(lv.reward)),
          h('div', { class: 'stars', style: { fontSize: '18px' } }, [0, 1, 2].map(i => h('span', { class: i < st ? 'on' : '' }, '★'))),
          open ? h('button', { class: 'btn small green', 'data-campaign': lv.index, onclick: () => { app.closeAllPanels(); app.nav.battle(campaignOpponent(lv.index), { kind: 'campaign', index: lv.index }); } }, 'Jouer') : h('span', null, '🔒')));
      }
      body.append(list);
    }
  }, { wide: true });
}

// ───── Guilde ─────
let guildTab = 0;
export function openGuild(app: App) {
  bus.emit('tut', 'guild');
  app.openPanel('Guilde', (body, ph) => {
    const s = app.s, now = Date.now();
    const req = requirePortal(s);
    if (req) { body.append(h('p', null, '🔒 ' + req), h('p', { class: 'muted' }, 'Les guildes permettent de discuter, d\'échanger des renforts, de donner des ressources et de mener des guerres.')); return; }
    if (!serverConfigured() || !isOnline()) body.append(h('div', { class: 'chip offline-pill', style: { marginBottom: '8px' } }, '📴 Hors-ligne : guilde locale avec compagnons simulés. Les guildes de joueurs réels nécessitent le serveur.'));
    if (!s.guild) {
      body.append(tabs(['🔎 Rejoindre', '➕ Créer'], guildTab, i => { guildTab = i; ph.refresh(); }));
      if (guildTab === 0) {
        const list = h('div', { class: 'list', style: { marginTop: '10px' } });
        for (const g of suggestedGuilds(s, Math.floor(now / 3600000))) list.append(h('div', { class: 'item' }, h('span', { style: { fontSize: '30px' } }, g.emblem), h('div', { class: 'grow' }, h('b', null, `${g.name} · niv. ${g.level}`), h('div', { class: 'muted' }, `${g.members}/30 membres · 🏆 min ${g.minTrophies} · ${g.open ? 'Ouverte' : 'Sur invitation'}`), h('div', { class: 'muted' }, g.desc)),
          h('button', { class: 'btn small green', onclick: () => { if (app.act('guildJoin', { listing: g }).ok) audio.sfx('reward'); } }, 'Rejoindre')));
        body.append(list);
      } else {
        let emblem = EMBLEMS[0];
        const name = h('input', { class: 'field', placeholder: 'Nom de la guilde', maxlength: 24 }) as HTMLInputElement;
        const desc = h('input', { class: 'field', placeholder: 'Description', maxlength: 120 }) as HTMLInputElement;
        const embRow = h('div', { class: 'row' }, EMBLEMS.map(e => h('button', { class: 'btn small ghost', onclick: (ev: Event) => { emblem = e; embRow.querySelectorAll('button').forEach(b => b.classList.remove('gold')); (ev.currentTarget as HTMLElement).classList.add('gold'); } }, e)));
        body.append(h('div', { class: 'list', style: { marginTop: '10px' } }, name, desc, h('div', { class: 'muted' }, 'Emblème :'), embRow,
          h('button', { class: 'btn gold', onclick: () => { if (app.act('guildCreate', { name: name.value, emblem, desc: desc.value }).ok) audio.sfx('reward'); } }, `Fonder · 🪙 ${fmt(GUILD_CREATE_COST)}`)));
      }
      return;
    }
    const g = s.guild;
    body.append(h('div', { class: 'item' }, h('span', { style: { fontSize: '36px' } }, g.emblem), h('div', { class: 'grow' }, h('b', null, `${g.name} · niveau ${g.level}`), h('div', { class: 'muted' }, g.desc), h('div', { class: 'progress gold' }, h('i', { style: { width: Math.round(100 * g.xp / guildXpForLevel(g.level)) + '%' } }))),
      h('div', { class: 'muted' }, `${g.members.length}/30`)));
    body.append(tabs(['💬 Chat', '👥 Membres', '🎁 Dons', '⚔️ Guerre'], guildTab, i => { guildTab = i; ph.refresh(); }));
    if (guildTab === 0) {
      const chat = h('div', { class: 'chat', style: { marginTop: '10px' } }, g.chat.filter(m => m.at <= now).slice(-60).map(m => h('div', { class: 'm' + (m.system ? ' sys' : m.from === s.player.name ? ' me' : '') }, m.system ? m.text : h('span', null, h('b', null, m.from + ' : '), m.text))));
      const input = h('input', { class: 'field', placeholder: 'Message…', maxlength: 200, onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') send(); } }) as HTMLInputElement;
      const send = () => { if (app.act('guildChat', { text: input.value }).ok) { input.value = ''; } };
      body.append(chat, h('div', { class: 'row', style: { marginTop: '8px', flexWrap: 'nowrap' } }, input, h('button', { class: 'btn', onclick: send }, 'Envoyer')));
      setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 0);
    } else if (guildTab === 1) {
      const invite = h('input', { class: 'field', placeholder: 'Nom du joueur à inviter' }) as HTMLInputElement;
      body.append(h('div', { class: 'row', style: { margin: '10px 0', flexWrap: 'nowrap' } }, invite, h('button', { class: 'btn small', onclick: () => { if (app.act('guildInvite', { name: invite.value }).ok) invite.value = ''; } }, 'Inviter')));
      body.append(h('div', { class: 'list' }, [...g.members].sort((a, b) => b.trophies - a.trophies).map((m, i) => h('div', { class: 'item' }, h('b', null, `#${i + 1}`), h('div', { class: 'grow' }, h('b', null, m.name + (m.bot ? '' : ' (vous)')), h('div', { class: 'muted' }, `${m.role} · Citadelle ${m.citadel} · dons ${m.donations}`)), h('span', null, `🏆 ${fmt(m.trophies)}`)))));
      if (g.invites.length) body.append(h('p', { class: 'muted' }, 'Invitations en attente : ' + g.invites.join(', ')));
      body.append(h('div', { class: 'row', style: { marginTop: '12px', justifyContent: 'flex-end' } }, h('button', { class: 'btn small red', onclick: () => app.confirm('Quitter la guilde', 'Voulez-vous vraiment quitter la guilde ?', 'Quitter', () => app.act('guildLeave'), 'red') }, 'Quitter la guilde')));
    } else if (guildTab === 2) {
      const cap = portalCapacity(s), have = housingOf(s.army.guildTroops);
      body.append(h('div', { class: 'section-title' }, 'Renforts reçus'), h('div', { class: 'progress' }, h('i', { style: { width: Math.round(100 * have / Math.max(1, cap)) + '%' } })), h('p', { class: 'muted' }, `${have}/${cap} — utilisables en attaque et en défense (sortent du Portail).`),
        h('button', { class: 'btn purple', onclick: () => app.act('guildRequest', {}, { sound: 'click' }) }, g.requestAt && now - g.requestAt < 600000 ? `Demande envoyée (${fmtTime((600000 - (now - g.requestAt)) / 1000)})` : 'Demander des renforts'));
      body.append(h('div', { class: 'section-title' }, 'Donner des troupes'), h('div', { class: 'row' }, Object.entries(s.army.units).filter(([, n]) => n > 0).map(([id, n]) => h('button', { class: 'btn small green', onclick: () => app.act('guildDonate', { unit: id }, { sound: 'train' }) }, `${UNITS[id].name} (${n})`))));
      body.append(h('div', { class: 'section-title' }, 'Trésor de guilde (XP de guilde)'), h('div', { class: 'row' }, ...(['gold', 'wood'] as const).flatMap(r => [1000, 10000].map(n => h('button', { class: 'btn small gold', onclick: () => app.act('guildDonateRes', { res: r, amount: n }, { sound: 'coin' }) }, `${RES_ICON[r]} ${fmt(n)}`)))));
      const perks = guildPerks(g.level);
      body.append(h('p', { class: 'muted' }, `Bonus de niveau ${g.level} : ${perks.donationCap * 10} dons/jour.`));
    } else {
      body.append(warView(app));
    }
  }, { wide: true });
}

function warView(app: App): HTMLElement {
  const s = app.s, now = Date.now();
  const w = s.war;
  const wrap = h('div', { style: { marginTop: '10px' } });
  if (!w || (w.phase === 'ended' && w.rewardClaimed)) {
    const err = canStartWar(s);
    wrap.append(h('p', null, 'Guerre de guilde : PRÉPARATION (10 min) → ATTAQUES & DÉFENSES (60 min) → SCORE → RÉCOMPENSES.'),
      h('button', { class: 'btn red' + (err ? ' disabled' : ''), onclick: () => { if (err) { app.toast(err, 'bad'); return; } if (app.act('warStart').ok) audio.sfx('ability'); } }, '⚔️ Déclarer la guerre'),
      err ? h('p', { class: 'muted' }, err) : '');
    if (s.warHistory.length) wrap.append(h('div', { class: 'section-title' }, 'Historique'), h('div', { class: 'list' }, s.warHistory.slice(0, 8).map(x => h('div', { class: 'stat' }, x.enemy, h('b', null, x.result === 'victory' ? '🏆 Victoire' : x.result === 'defeat' ? 'Défaite' : 'Égalité')))));
    return wrap;
  }
  const phaseName = w.phase === 'preparation' ? '🛠️ Préparation' : w.phase === 'battle' ? '⚔️ Jour de bataille' : '🏁 Terminée';
  wrap.append(h('div', { class: 'row between' }, h('b', null, `${s.guild?.emblem} ${s.guild?.name}  ${w.ourStars}★ – ${w.theirStars}★  ${w.enemyName} ${w.enemyEmblem}`), h('span', { class: 'chip' }, `${phaseName}${w.phase !== 'ended' ? ' · ' + fmtTime((w.phaseEndAt - now) / 1000) : ''}`)),
    h('div', { class: 'muted' }, `Destruction moyenne : ${w.ourDestruction}% / ${w.theirDestruction}% · Vos attaques restantes : ${w.attacksLeft}`));
  if (!app.release) wrap.append(h('button', { class: 'btn small ghost', onclick: () => { fastForwardWar(s, Date.now()); app.changed(); } }, '⏩ Avancer la phase (debug)'));
  if (w.phase === 'ended') {
    const r = warReward(s);
    wrap.append(h('h3', null, w.result === 'victory' ? '🏆 VICTOIRE !' : w.result === 'defeat' ? 'Défaite' : 'Égalité'), lootLine(r), h('button', { class: 'btn gold', onclick: () => { if (app.act('warClaim').ok) audio.sfx('reward'); } }, 'Récupérer les récompenses'));
  }
  const col = (title: string, bases: typeof w.ours, enemy: boolean) => h('div', { class: 'list', style: { flex: '1', minWidth: '260px' } }, h('div', { class: 'section-title' }, title), bases.map((b, i) => h('div', { class: 'item' },
    h('b', null, `${i + 1}.`), h('div', { class: 'grow' }, h('b', null, b.name), h('div', { class: 'muted' }, `Citadelle ${b.citadel}`)),
    h('span', { class: 'stars', style: { fontSize: '16px' } }, [0, 1, 2].map(k => h('span', { class: k < b.stars ? 'on' : '' }, '★'))), h('span', { class: 'muted' }, `${b.destruction}%`),
    enemy && w.phase === 'battle' && w.attacksLeft > 0 ? h('button', { class: 'btn small red', onclick: () => { const o = warOpponent(s, i); if (o) { app.closeAllPanels(); app.nav.battle(o, { kind: 'war', target: i }); } } }, 'Attaquer') : null)));
  wrap.append(h('div', { class: 'row', style: { alignItems: 'flex-start' } }, col('Nos bases (défenses)', w.ours, false), col('Bases ennemies', w.theirs, true)));
  wrap.append(h('div', { class: 'section-title' }, 'Journal de guerre'), h('div', { class: 'list' }, w.log.slice(0, 15).map(l => h('div', { class: 'stat' }, l))));
  return wrap;
}
export function openWar(app: App) { guildTab = 3; openGuild(app); }

// ───── Boutique ─────
let shopTab = 0;
export function openShop(app: App) {
  app.openPanel('🛒 Boutique', (body, ph) => {
    const s = app.s, now = Date.now();
    const SECTIONS = ['⭐ Offres', '💎 Packs', '🎨 Skins', '🗿 Décorations', '🪙 Ressources', '👑 Pass'];
    body.append(tabs(SECTIONS, shopTab, i => { shopTab = i; ph.refresh(); }));
    const grid = h('div', { class: 'grid', style: { marginTop: '10px' } });
    const items = crystalCatalog(s, now);
    const buyIap = async (id: string) => {
      audio.sfx('click');
      const r = await app.purchases.buy(id);
      if (r.ok) { audio.sfx('reward'); app.toast('Achat réussi, merci ! 🎉', 'good'); }
      else app.toast(r.error ?? 'Erreur', r.code === 'cancelled' ? '' : 'bad');
      ph.refresh();
    };
    const iapCard = (id: string) => {
      const p = IAP_PRODUCTS.find(x => x.id === id)!;
      const owned = !p.consumable && (s.shop.purchases[id] ?? 0) >= (p.limit ?? 1) && id !== 'season_pass';
      const passOwned = id === 'season_pass' && s.pass.premium;
      return h('div', { class: 'card', 'data-iap': id }, p.highlight ? h('span', { class: 'chip', style: { position: 'absolute', top: '6px', right: '6px', background: '#c62828' } }, p.highlight) : null,
        h('div', { class: 'art', style: { fontSize: '48px' } }, p.icon), h('h3', null, p.name), h('div', { class: 'muted' }, p.desc),
        owned || passOwned ? h('button', { class: 'btn small ghost', disabled: true }, '✔ Possédé') : h('button', { class: 'btn gold', onclick: () => buyIap(id) }, p.price));
    };
    const crystalCard = (it: ReturnType<typeof crystalCatalog>[number]) => h('div', { class: 'card' },
      h('div', { class: 'art', style: { fontSize: '44px', background: it.color ? `radial-gradient(circle, ${it.color}66, transparent)` : undefined } }, it.id.startsWith('deco:') ? buildingIcon(it.id.slice(5)) : it.icon),
      h('h3', null, it.name), h('div', { class: 'muted' }, it.desc),
      it.owned ? h('button', { class: 'btn small ghost', disabled: true }, '✔ Possédé') : h('button', { class: 'btn purple small', onclick: () => {
        if (it.section === 'decorations') { app.toast('Placez-la depuis Construire → Décor (payée en cristaux à la pose)'); return; }
        const r = app.act('buyItem', { id: it.id }); if (r.ok) { audio.sfx('reward'); app.toast(`Acheté : ${r.data}`, 'good'); }
      } }, `💎 ${fmt(it.price)}`));
    switch (shopTab) {
      case 0: for (const it of items.filter(i => i.section === 'offers')) grid.append(crystalCard(it)); grid.append(iapCard('starter_pack'), iapCard('special_bundle')); break;
      case 1: for (const id of ['crystals_small', 'crystals_medium', 'crystals_large']) grid.append(iapCard(id)); break;
      case 2: for (const it of items.filter(i => i.section === 'skins')) grid.append(crystalCard(it)); break;
      case 3: for (const it of items.filter(i => i.section === 'decorations')) grid.append(crystalCard(it)); break;
      case 4: for (const it of items.filter(i => i.section === 'resources')) grid.append(crystalCard(it)); break;
      case 5: grid.append(iapCard('season_pass'), h('div', { class: 'card' }, h('div', { class: 'art', style: { fontSize: '48px' } }, '👑'), h('h3', null, 'Royal Pass (cristaux)'), h('div', { class: 'muted' }, 'Débloque la piste premium de la saison.'), s.pass.premium ? h('button', { class: 'btn small ghost', disabled: true }, '✔ Actif') : h('button', { class: 'btn purple', onclick: () => { if (app.act('buyPass').ok) audio.sfx('reward'); } }, `💎 ${PASS_CRYSTAL_PRICE}`))); break;
    }
    body.append(grid);
    body.append(h('div', { class: 'row between', style: { marginTop: '12px' } },
      h('span', { class: 'muted' }, `Paiements : ${app.purchases.provider.name}. Les cristaux servent aux cosmétiques, accélérations raisonnables, au pass et aux offres.`),
      h('button', { class: 'btn small ghost', onclick: async () => { const r = await app.purchases.restore(); app.toast(r.error ?? `${r.restored} achat(s) restauré(s)`, r.error ? 'bad' : 'good'); ph.refresh(); } }, '↺ Restaurer les achats')));
    if (s.shop.pendingTokens.length) body.append(h('p', { class: 'muted' }, `⏳ ${s.shop.pendingTokens.length} achat(s) en attente de validation. ${MESSAGES.pending}`));
  }, { wide: true });
}

export function openCosmetics(app: App) {
  app.openPanel('Apparence du village', body => {
    const s = app.s;
    body.append(h('div', { class: 'section-title' }, 'Thèmes de village'));
    const g1 = h('div', { class: 'grid' });
    for (const t of THEMES) {
      const owned = !t.price || s.inventory.cosmetics.includes(t.id);
      g1.append(h('div', { class: 'card' }, h('div', { class: 'art', style: { background: `linear-gradient(135deg, ${t.ground}, ${t.ground2})` } }), h('h3', null, t.name),
        owned ? h('button', { class: 'btn small green', onclick: () => app.act('setTheme', { id: t.id }) }, s.inventory.theme === t.id ? '✔ Actif' : 'Utiliser') : h('button', { class: 'btn small purple', onclick: () => app.act('buyItem', { id: t.id }, { sound: 'reward' }) }, `💎 ${t.price}`)));
    }
    body.append(g1, h('div', { class: 'section-title' }, 'Apparence de la Citadelle'));
    const g2 = h('div', { class: 'grid' });
    g2.append(h('div', { class: 'card' }, h('div', { class: 'art' }, buildingIcon('citadel', citadelLevel(s))), h('h3', null, 'Classique'), h('button', { class: 'btn small green', onclick: () => app.act('setCitadelSkin', { id: undefined }) }, !s.inventory.citadelSkin ? '✔ Active' : 'Utiliser')));
    for (const c of CITADEL_SKINS) {
      const owned = s.inventory.cosmetics.includes(c.id);
      g2.append(h('div', { class: 'card' }, h('div', { class: 'art' }, buildingIcon('citadel', citadelLevel(s), c.id)), h('h3', null, c.name),
        owned ? h('button', { class: 'btn small green', onclick: () => app.act('setCitadelSkin', { id: c.id }) }, s.inventory.citadelSkin === c.id ? '✔ Active' : 'Utiliser') : h('button', { class: 'btn small purple', onclick: () => app.act('buyItem', { id: c.id }, { sound: 'reward' }) }, `💎 ${c.price}`)));
    }
    body.append(g2, h('p', { class: 'muted' }, 'Tous les cosmétiques sont purement visuels et ne donnent aucun avantage en combat.'));
  }, { wide: true });
}

// ───── Royal Pass ─────
function rewardText(r: Reward, cl: number) {
  return r.kind === 'crystals' ? `💎 ${r.amount}` : r.kind === 'resource' ? `${RES_ICON[r.res]} ${fmt(r.amount * cl * cl)}` : `🎁 ${r.name}`;
}
export function openPass(app: App) {
  app.openPanel('👑 Royal Pass', (body, ph) => {
    const s = app.s, now = Date.now();
    const season = currentSeason(now);
    const tier = passTier(s);
    const cl = citadelLevel(s);
    body.append(h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, `${season.name} (saison ${season.index})`), h('div', { class: 'muted' }, `Fin dans ${fmtTime((season.endsAt - now) / 1000)} · Unité de saison : ${UNITS[season.unit].name}`),
      h('div', { class: 'progress gold' }, h('i', { style: { width: Math.round(100 * (s.pass.xp % XP_PER_TIER) / XP_PER_TIER) + '%' } })), h('div', { class: 'muted' }, `Palier ${tier}/${PASS_TIERS} · ${s.pass.xp % XP_PER_TIER}/${XP_PER_TIER} XP`)),
      s.pass.premium ? h('span', { class: 'chip', style: { background: '#8a6100' } }, '👑 Premium') : h('button', { class: 'btn gold', onclick: () => { ph.close(); shopTab = 5; openShop(app); } }, 'Passer Premium')));
    body.append(h('div', { class: 'pass-row', style: { margin: '10px 0 4px', fontWeight: '900' } }, h('span'), h('span', null, 'GRATUIT'), h('span', { style: { color: '#ffcf5c' } }, 'PREMIUM')));
    const list = h('div', { class: 'list' });
    for (const t of passTiers()) {
      const reached = tier >= t.tier;
      const cell = (track: 'free' | 'premium', r: Reward) => {
        const claimed = (track === 'free' ? s.pass.claimedFree : s.pass.claimedPremium).includes(t.tier);
        const can = reached && !claimed && (track === 'free' || s.pass.premium);
        return h('div', { class: 'pass-cell' + (track === 'premium' ? ' prem' : '') }, h('span', null, rewardText(r, cl)),
          claimed ? h('span', { class: 'muted' }, '✔ Récupéré') : can ? h('button', { class: 'btn small green', onclick: () => { const x = app.act('claimTier', { tier: t.tier, track }); if (x.ok) { audio.sfx('reward'); app.toast(x.data, 'good'); } } }, 'Récupérer') : h('span', { class: 'muted' }, track === 'premium' && !s.pass.premium ? '🔒' : ''));
      };
      list.append(h('div', { class: 'pass-row' }, h('div', { class: 'pass-tier' + (reached ? ' on' : '') }, t.tier), cell('free', t.free), cell('premium', t.premium)));
    }
    body.append(list);
  }, { wide: true });
}

// ───── Missions & succès ─────
export function openMissions(app: App) {
  app.openPanel('📜 Missions', body => {
    const s = app.s;
    const row = (id: string, prog: number, claimed: boolean) => {
      const d = missionDef(id)!;
      return h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, d.text), h('div', { class: 'progress' }, h('i', { style: { width: Math.round(100 * Math.min(1, prog / d.goal)) + '%' } })), h('div', { class: 'muted' }, `${fmt(prog)}/${fmt(d.goal)} · +${d.xp} XP de pass${d.crystals ? ' · 💎 ' + d.crystals : ''}`)),
        claimed ? h('span', { class: 'muted' }, '✔') : h('button', { class: 'btn small ' + (prog >= d.goal ? 'gold' : 'ghost'), onclick: () => { if (app.act('claimMission', { id }).ok) audio.sfx('reward'); } }, 'Récupérer'));
    };
    body.append(h('div', { class: 'section-title' }, 'Quotidiennes'), h('div', { class: 'list' }, s.missions.daily.map(m => row(m.id, m.progress, m.claimed))));
    body.append(h('div', { class: 'section-title' }, 'Saison'), h('div', { class: 'list' }, SEASON_MISSIONS.map(m => { const st = s.missions.season[m.id] ?? { progress: 0, claimed: false }; return row(m.id, st.progress, st.claimed); })));
    body.append(h('div', { class: 'section-title' }, 'Succès'), h('div', { class: 'list' }, ACHIEVEMENTS.map(a => {
      const st = s.achievements[a.id] ?? { progress: 0, claimedTier: 0 };
      const tier = st.claimedTier; const prog = achievementProgress(s, a);
      const goal = a.tiers[Math.min(tier, a.tiers.length - 1)];
      return h('div', { class: 'item' }, h('span', null, '★'.repeat(tier) + '☆'.repeat(3 - tier)), h('div', { class: 'grow' }, h('b', null, a.name), h('div', { class: 'muted' }, `${a.desc} : ${fmt(prog)}/${fmt(goal)}`)),
        tier >= 3 ? h('span', { class: 'muted' }, 'Terminé') : h('button', { class: 'btn small ' + (prog >= goal ? 'gold' : 'ghost'), onclick: () => { const r = app.act('claimAchievement', { id: a.id }); if (r.ok) { audio.sfx('reward'); app.toast(`💎 +${r.data}`, 'good'); } } }, `💎 ${a.reward[tier]}`));
    })));
  });
}

// ───── Monde ─────
export function openWorld(app: App) {
  app.openPanel('🌍 Carte du monde', (body, ph) => {
    const s = app.s, now = Date.now();
    const map = h('div', { class: 'world-map' });
    for (const r of WORLD_REGIONS) {
      const disc = regionDiscovered(s, r.id, now);
      map.append(h('div', { class: 'region' + (disc ? '' : ' fog'), style: { left: r.x * 100 + '%', top: r.y * 100 + '%', width: '26%', height: '30%', background: `radial-gradient(circle, ${r.color}, ${r.color}55 60%, transparent 70%)` } }, disc ? r.name : '☁️ Inexploré'));
    }
    for (const site of worldSites(s, now)) {
      if (!regionDiscovered(s, site.region, now)) continue;
      const icon = site.kind === 'campaign' ? ((s.campaign.stars[site.campaign!] ?? 0) > 0 ? '🏁' : campaignUnlocked(s.campaign.stars, site.campaign!) ? '⚔️' : '🔒') : site.kind === 'resource' ? (site.res === 'gold' ? '🪙' : site.res === 'wood' ? '🪵' : '⚡') : site.kind === 'event' ? '🗿' : '🏘️';
      const done = site.kind === 'resource' && siteReady(s, site.id, now) > 0;
      map.append(h('div', { class: 'site' + (done ? ' done' : ''), title: site.name, style: { left: site.x * 100 + '%', top: site.y * 100 + '%' }, onclick: () => siteDialog(app, site, ph) }, icon));
    }
    body.append(map, h('p', { class: 'muted' }, `Régions découvertes : ${WORLD_REGIONS.filter(r => regionDiscovered(s, r.id, now)).length}/${WORLD_REGIONS.length}. Terminez une région de campagne ou améliorez l'Observatoire pour en révéler d'autres.`));
  }, { wide: true });
}
function siteDialog(app: App, site: ReturnType<typeof worldSites>[number], parent: { close(): void }) {
  const s = app.s, now = Date.now();
  if (site.kind === 'campaign') { const lv = CAMPAIGN[site.campaign! - 1]; if (!campaignUnlocked(s.campaign.stars, lv.index)) { app.toast('Terminez le niveau précédent', 'bad'); return; } parent.close(); app.nav.battle(campaignOpponent(lv.index), { kind: 'campaign', index: lv.index }); return; }
  if (site.kind === 'resource') {
    const wait = siteReady(s, site.id, now);
    if (wait > 0) { app.toast(`${site.name} : se régénère dans ${fmtTime(wait / 1000)}`); return; }
    const r = app.act('claimSite', { site: site.id });
    if (r.ok) { audio.sfx('coin'); app.toast(`${site.name} : ${Object.entries(r.data).map(([k, v]) => `+${fmt(v as number)} ${RES_ICON[k as ResKey]}`).join(' ')}`, 'good'); }
    return;
  }
  const opp = villageOpponent(site.name, site.citadel!, site.seed!, site.kind === 'event' ? 'event' : 'village', s, now);
  app.openPanel(site.kind === 'event' ? '🗿 Guerre Ancienne' : '🏘️ Village', (body, ph) => {
    opponentPreview(app, opp, body);
    body.append(h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn gold', onclick: () => { ph.close(); parent.close(); app.nav.battle(opp, { kind: site.kind === 'event' ? 'event' : 'village', site: site.id }); } }, '⚔️ Attaquer')));
  });
}

// ───── Événements ─────
export function openEvents(app: App) {
  app.openPanel('Événements', body => {
    const now = Date.now();
    const cur = currentEvent(now);
    body.append(h('div', { class: 'item', style: { borderLeft: `6px solid ${cur.event.color}` } }, h('span', { style: { fontSize: '40px' } }, cur.event.icon), h('div', { class: 'grow' }, h('b', null, `${cur.event.name} — en cours`), h('div', { class: 'muted' }, cur.event.desc), h('div', { class: 'muted' }, `Se termine dans ${fmtTime((cur.endsAt - now) / 1000)}`))));
    if (cur.event.id === 'invasion') body.append(h('button', { class: 'btn red', style: { marginTop: '8px' }, onclick: () => { app.closeAllPanels(); app.nav.invasion(); } }, '🛡️ Repousser l\'invasion'));
    if (cur.event.id === 'ancient_war') body.append(h('button', { class: 'btn gold', style: { marginTop: '8px' }, onclick: () => { app.closeAllPanels(); openWorld(app); } }, '🗿 Explorer les Ruines Anciennes'));
    body.append(h('div', { class: 'section-title' }, bestLevel(app.s, 'observatory') ? 'Prévisions de l\'Observatoire' : 'À venir'));
    for (const u of upcomingEvents(now, bestLevel(app.s, 'observatory') ? 4 : 1)) body.append(h('div', { class: 'stat' }, `${u.event.icon} ${u.event.name}`, h('b', null, `dans ${fmtTime((u.startsAt - now) / 1000)}`)));
    const season = currentSeason(now);
    body.append(h('div', { class: 'section-title' }, 'Saison'), h('div', { class: 'stat' }, season.name, h('b', null, `fin dans ${fmtTime((season.endsAt - now) / 1000)}`)), h('p', { class: 'muted' }, `Unité temporaire : ${UNITS[season.unit].name} · décorations, skins et missions de saison dans le Royal Pass.`));
    void EVENTS;
  });
}

// ───── Profil & classements ─────
export function openProfile(app: App) {
  app.openPanel('Profil', body => {
    const s = app.s;
    const name = h('input', { class: 'field', value: s.player.name, maxlength: 16 }) as HTMLInputElement;
    const st = s.player.stats;
    body.append(h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, name, h('button', { class: 'btn small', onclick: () => { if (app.act('setName', { name: name.value }).ok) app.toast('Nom modifié', 'good'); } }, 'Renommer')));
    const rows: [string, string][] = [
      ['Niveau', `${s.player.level} (${s.player.xp}/${xpForLevel(s.player.level)} XP)`], ['Citadelle', String(citadelLevel(s))], ['Trophées', `${fmt(s.player.trophies)} (record ${fmt(s.player.bestTrophies)})`],
      ['Guilde', s.guild ? `${s.guild.emblem} ${s.guild.name}` : '—'], ['Héros', Object.entries(s.heroes).map(([id, hh]) => `${HEROES.find(x => x.id === id)?.name} ${hh.level}`).join(', ') || '—'],
      ['Attaques gagnées / perdues', `${st.attacksWon} / ${st.attacksLost}`], ['Défenses gagnées / perdues', `${st.defensesWon} / ${st.defensesLost}`], ['Invasions repoussées', String(st.invasionsRepelled)],
      ['Étoiles totales', String(st.starsTotal)], ['Or / bois pillés', `${fmt(st.goldLooted)} / ${fmt(st.woodLooted)}`], ['Unités entraînées', fmt(st.unitsTrained)], ['Bâtiments construits', fmt(st.buildingsBuilt)],
      ['Étoiles de campagne', `${Object.values(s.campaign.stars).reduce((a, b) => a + b, 0)}/90`], ['Collection', `${s.inventory.cosmetics.length} cosmétiques · ${s.inventory.equipment.length} équipements · ${s.inventory.emotes.length} emotes`],
    ];
    body.append(h('div', { class: 'list', style: { marginTop: '10px' } }, rows.map(([k, v]) => h('div', { class: 'stat' }, k, h('b', null, v)))));
    body.append(h('div', { class: 'row', style: { marginTop: '10px' } }, Object.keys(s.heroes).map(id => heroIcon(id, s.heroes[id].skin))));
    body.append(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn', onclick: () => openLeaderboard(app) }, '🏆 Classements'), h('button', { class: 'btn ghost', onclick: () => openDefenseLog(app) }, '🛡️ Journal de défense')));
  });
}

let lbTab = 0;
export function openLeaderboard(app: App) {
  app.openPanel('🏆 Classements', (body, ph) => {
    const s = app.s;
    const CATS = ['Mondial', 'Régional', 'Guilde', 'Amis', 'Saison'];
    body.append(tabs(CATS, lbTab, i => { lbTab = i; ph.refresh(); }));
    const list = h('div', { class: 'list', style: { marginTop: '10px' } });
    body.append(list);
    const render = (rows: { name: string; trophies: number; sub?: string; me?: boolean }[]) => {
      rows.sort((a, b) => b.trophies - a.trophies);
      list.append(...rows.slice(0, 50).map((r, i) => h('div', { class: 'item', style: r.me ? { outline: '2px solid #ffcf5c' } : {} }, h('b', null, `#${i + 1}`), h('div', { class: 'grow' }, h('b', null, r.name), r.sub ? h('div', { class: 'muted' }, r.sub) : null), h('span', null, `🏆 ${fmt(r.trophies)}`))));
    };
    if (serverConfigured() && isOnline()) {
      void call<{ rows: { name: string; trophies: number }[] }>('GET', `/leaderboard?scope=${['global', 'region', 'guild', 'friends', 'season'][lbTab]}`).then(r => render(r.rows)).catch(() => list.append(h('p', { class: 'muted' }, 'Classement indisponible.')));
      return;
    }
    // hors-ligne : classement simulé et déterministe autour du joueur
    body.prepend(h('div', { class: 'chip offline-pill' }, '📴 Hors-ligne : classement simulé (les classements réels nécessitent le serveur).'));
    if (lbTab === 2) { render((s.guild?.members ?? []).map(m => ({ name: m.name, trophies: m.bot ? m.trophies : s.player.trophies, me: !m.bot, sub: `Citadelle ${m.citadel}` }))); if (!s.guild) list.append(h('p', { class: 'muted' }, 'Rejoignez une guilde.')); return; }
    const rng = new Rng(hashString(CATS[lbTab]) + Math.floor(Date.now() / 86400000));
    const base = lbTab === 0 ? 5200 : lbTab === 1 ? 3800 : lbTab === 3 ? s.player.trophies + 300 : 2400;
    const rows: { name: string; trophies: number; sub?: string; me?: boolean }[] = Array.from({ length: 40 }, () => ({ name: randomName(rng), trophies: Math.max(0, Math.round(base - rng.range(0, base * 0.9))), sub: lbTab === 1 ? s.player.region : undefined }));
    rows.push({ name: s.player.name + ' (vous)', trophies: s.player.trophies, me: true, sub: undefined });
    render(rows);
  });
}

export function openDefenseLog(app: App) {
  app.openPanel('🛡️ Journal de défense', body => {
    const s = app.s;
    if (!s.log.length) body.append(h('p', { class: 'muted' }, 'Aucune attaque subie pour l\'instant.'));
    body.append(h('div', { class: 'list' }, s.log.map(l => h('div', { class: 'item' }, h('span', { style: { fontSize: '26px' } }, l.kind === 'invasion' ? '👹' : '⚔️'), h('div', { class: 'grow' }, h('b', null, l.attacker), h('div', { class: 'muted' }, new Date(l.at).toLocaleString('fr-FR')), lootLine(l.lost)),
      h('div', { style: { textAlign: 'right' } }, h('div', { class: 'stars', style: { fontSize: '16px' } }, [0, 1, 2].map(i => h('span', { class: i < l.stars ? 'on' : '' }, '★'))), h('div', null, `${l.destruction}%`), l.trophies ? h('div', null, `🏆 ${l.trophies > 0 ? '+' : ''}${l.trophies}`) : null)))));
    body.append(h('p', { class: 'muted' }, s.player.shieldUntil > Date.now() ? `Bouclier actif encore ${fmtTime((s.player.shieldUntil - Date.now()) / 1000)}.` : 'Aucun bouclier : votre village peut être attaqué pendant votre absence.'));
  });
}

// ───── Menu & réglages ─────
export function openMenu(app: App, village: { setMode(m: 'edit'): void }) {
  app.openPanel('Menu', (body, ph) => {
    const b = (e: string, t: string, f: () => void) => h('button', { class: 'btn ghost', style: { justifyContent: 'flex-start' }, onclick: () => { ph.close(); f(); } }, `${e}  ${t}`);
    body.append(h('div', { class: 'grid' },
      b('👤', 'Profil', () => openProfile(app)), b('🏆', 'Classements', () => openLeaderboard(app)), b('📜', 'Missions & succès', () => openMissions(app)),
      b('⚗️', 'Laboratoire', () => openResearch(app)), b('🦸', 'Héros', () => openHeroes(app)),
      b('🎉', 'Événements', () => openEvents(app)), b('🌍', 'Monde', () => openWorld(app)), b('🗺️', 'Campagne', () => openCampaign(app)),
      b('🛡️', 'Journal de défense', () => openDefenseLog(app)), b('🎨', 'Apparence', () => openCosmetics(app)), b('✏️', 'Mode édition', () => village.setMode('edit')),
      b('⚙️', 'Réglages', () => openSettings(app)), b('❓', 'Aide', () => openHelp(app))));
  });
}

export function openSettings(app: App) {
  app.openPanel('⚙️ Réglages', (body, ph) => {
    const s = app.s;
    const slider = (label: string, key: 'music' | 'sfx') => {
      const inp = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.settings[key], style: { width: '100%' }, oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); app.act('settings', { [key]: v }, { silent: true }); audio.setVolumes(s.settings.music, s.settings.sfx); } });
      return h('div', { class: 'stat' }, label, inp);
    };
    body.append(h('div', { class: 'list' },
      slider('🎵 Musique', 'music'), slider('🔊 Effets', 'sfx'),
      h('div', { class: 'stat' }, '🎨 Qualité graphique', h('div', { class: 'row' }, (['low', 'medium', 'high'] as const).map(q => h('button', { class: 'btn small ' + (s.settings.quality === q ? 'gold' : 'ghost'), onclick: () => { app.act('settings', { quality: q }, { silent: true }); app.r.setQuality(q); ph.refresh(); } }, q === 'low' ? 'BASSE' : q === 'medium' ? 'MOYENNE' : 'HAUTE')))),
      h('div', { class: 'stat' }, '📳 Vibrations', h('button', { class: 'btn small ' + (s.settings.vibration ? 'green' : 'ghost'), onclick: () => { app.act('settings', { vibration: !s.settings.vibration }, { silent: true }); ph.refresh(); } }, s.settings.vibration ? 'Oui' : 'Non')),
      h('div', { class: 'stat' }, '📈 Afficher les FPS', h('button', { class: 'btn small ' + (s.settings.showFps ? 'green' : 'ghost'), onclick: () => { app.act('settings', { showFps: !s.settings.showFps }, { silent: true }); ph.refresh(); } }, s.settings.showFps ? 'Oui' : 'Non')),
      h('div', { class: 'stat' }, '🌐 Connexion', h('span', null, !serverConfigured() ? 'Mode solo (aucun serveur configuré)' : isOnline() ? 'En ligne' : 'Hors-ligne'), serverConfigured() ? h('button', { class: 'btn small ghost', onclick: async () => { await checkOnline(true); ph.refresh(); } }, 'Tester') : null),
      h('div', { class: 'stat' }, '💳 Achats', h('button', { class: 'btn small ghost', onclick: async () => { const r = await app.purchases.restore(); app.toast(r.error ?? `${r.restored} achat(s) restauré(s)`); } }, 'Restaurer')),
      h('div', { class: 'stat' }, '💾 Sauvegarde', h('button', { class: 'btn small ghost', onclick: () => { app.save(true); app.toast('Sauvegardé', 'good'); } }, 'Sauvegarder')),
      h('div', { class: 'stat' }, '🧨 Recommencer', h('button', { class: 'btn small red', onclick: () => app.confirm('Réinitialiser', 'Toute la progression locale sera effacée. Continuer ?', 'Effacer', () => { app.saver.reset(); location.reload(); }, 'red') }, 'Réinitialiser'))));
    body.append(h('p', { class: 'muted' }, `KINGDOMS v1.0.0 · sauvegarde v${s.version} · ${app.release ? 'release' : 'debug'}`));
  });
}

function openHelp(app: App) {
  app.openPanel('❓ Aide', body => {
    body.append(...[
      ['🏰 Citadelle', 'Son niveau (1 à 15) débloque bâtiments, unités, défenses, sorts, héros et agrandit le territoire.'],
      ['🪙 Ressources', 'Or et bois servent aux constructions et à l\'armée. L\'énergie alimente les technologies avancées et les héros. Les cristaux sont la monnaie premium.'],
      ['⚔️ Combat', 'Choisissez une unité en bas, touchez une zone hors du rouge pour la déployer (maintenez pour en déployer plusieurs). 50 % = ★, Citadelle = ★, 100 % = ★.'],
      ['🛡️ Défense', 'Vos défenses et pièges protègent le village pendant votre absence. Une lourde défaite vous accorde un bouclier.'],
      ['🧱 Murs', 'Construire → Murs puis glissez le doigt pour tracer une muraille. Les unités choisissent entre contourner et percer.'],
      ['✏️ Édition', 'Le mode édition permet de sélectionner plusieurs bâtiments et de déplacer toute la disposition (sauvegarde automatique).'],
    ].map(([t, d]) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, t), h('div', { class: 'muted' }, d)))));
  });
}

export function openOfflineReport(app: App, attacks: number) {
  const rep = app.s.offlineReport;
  if (!rep && !attacks) return;
  app.openPanel('Pendant votre absence…', (body, ph) => {
    if (rep) {
      body.append(h('p', null, `Vous êtes parti ${fmtTime(rep.seconds)}.`));
      const g = Object.entries(rep.gained) as [ResKey, number][];
      if (g.length) body.append(h('div', { class: 'list' }, g.map(([k, v]) => h('div', { class: 'stat', style: { fontSize: '18px' } }, `${RES_ICON[k]}`, h('b', null, `+${fmt(v)} ${k === 'gold' ? 'Or' : k === 'wood' ? 'Bois' : k === 'energy' ? 'Énergie' : 'Cristaux'}`)))));
      if (rep.completed.length) body.append(h('div', { class: 'section-title' }, 'Terminé'), h('div', { class: 'list' }, rep.completed.slice(0, 8).map(c => h('div', { class: 'stat' }, '✅ ' + c))));
    }
    if (attacks) body.append(h('div', { class: 'section-title' }, `⚔️ ${attacks} attaque(s) subie(s)`), h('button', { class: 'btn ghost small', onclick: () => { ph.close(); openDefenseLog(app); } }, 'Voir le journal de défense'));
    body.append(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } }, h('button', { class: 'btn gold', onclick: () => ph.close() }, 'Super !')));
    delete app.s.offlineReport;
  });
}
