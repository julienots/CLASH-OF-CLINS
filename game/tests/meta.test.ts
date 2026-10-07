import { describe, it, expect } from 'vitest';
import { newGame, advance } from '../src/core/game';
import { dispatch } from '../src/core/actions';
import { SaveManager, memoryStorage, serialize, deserialize, SAVE_KEY, BACKUP_KEY, migrate } from '../src/save/save';
import { devVillage } from '../src/debug/cheats';
import { suggestedGuilds, tickGuild } from '../src/guilds/guild';
import { tickWar, fastForwardWar } from '../src/wars/war';
import { PurchaseService, MockBillingProvider, localTestValidator, type PurchaseToken } from '../src/purchases/iap';
import { grantProduct } from '../src/shop/catalog';
import { passTier, XP_PER_TIER } from '../src/battlepass/pass';
import { syncMissions, progressMission } from '../src/progression/missions';
import { armyCapacity } from '../src/village/query';
import { housingOf } from '../src/army/army';
import { TECH } from '../src/research/tech';

const T0 = Date.UTC(2026, 9, 7, 12);
const H = 3600000;

describe('sauvegarde', () => {
  it('aller-retour identique', () => {
    const s = devVillage(8, T0);
    const back = deserialize(serialize(s))!;
    expect(back.buildings.length).toBe(s.buildings.length);
    expect(back.resources).toEqual(s.resources);
  });
  it('détecte la corruption et restaure la copie de secours', () => {
    const st = memoryStorage();
    const m = new SaveManager(st);
    const s = newGame(T0); s.player.name = 'Alpha';
    m.save(s);
    s.player.name = 'Beta';
    m.save(s); // la première devient la sauvegarde de secours
    st.set(SAVE_KEY, st.get(SAVE_KEY)!.replace('Beta', 'Gamma')); // corruption
    const r = m.load(T0);
    expect(r.status).toBe('recovered');
    expect(r.state.player.name).toBe('Alpha');
    expect(st.get(BACKUP_KEY)).not.toBeNull();
  });
  it('migre une sauvegarde v1 (ancien format) sans perte', () => {
    const old: any = { version: 1, createdAt: T0, lastTick: T0, seed: 1, player: { name: 'Ancien', level: 3, xp: 0, trophies: 120, stats: {} }, resources: { gold: 500, wood: 400, food: 300, crystals: 10 }, buildings: [{ uid: 1, type: 'citadel', level: 2, x: 20, y: 20, rot: 0 }, { uid: 2, type: 'tour_supprimee', level: 1, x: 1, y: 1 }], army: { units: { soldier: 3, unite_disparue: 2 }, spells: {}, queue: [], spellQueue: [] }, settings: { music: 1 } };
    const s = migrate(old);
    expect(s.version).toBe(4);
    expect(s.resources.energy).toBe(300);
    expect(s.buildings.length).toBe(1);
    expect(s.army.units.unite_disparue).toBeUndefined();
    expect(s.player.trophies).toBe(120);
    expect(s.pass).toBeDefined();
  });
  it('une sauvegarde illisible donne une nouvelle partie', () => {
    const st = memoryStorage(); st.set(SAVE_KEY, '{oups');
    expect(new SaveManager(st).load(T0).status).toBe('new');
  });
});

describe('armée, recherche, héros', () => {
  it('respecte la capacité des camps et termine l\'entraînement', () => {
    const s = newGame(T0);
    s.resources.wood = 1e5; s.resources.gold = 1e5;
    s.army.units = {};
    expect(dispatch(s, 'train', { unit: 'soldier', count: armyCapacity(s) + 1 }, T0).ok).toBe(false);
    expect(dispatch(s, 'train', { unit: 'soldier', count: 10 }, T0).ok).toBe(true);
    advance(s, T0 + 10 * 15 * 1000);
    expect(s.army.units.soldier).toBe(10);
    expect(housingOf(s.army.units)).toBeLessThanOrEqual(armyCapacity(s));
  });
  it('recherche une unité puis une technologie avec prérequis', () => {
    const s = devVillage(9, T0);
    s.research.active = undefined;
    expect(dispatch(s, 'research', { kind: 'unit', id: 'soldier' }, T0).ok).toBe(true);
    expect(dispatch(s, 'research', { kind: 'unit', id: 'archer' }, T0).ok).toBe(false); // une seule à la fois
    advance(s, T0 + 30 * 24 * H);
    expect(s.research.levels.soldier).toBe(2);
    const t2 = TECH.find(t => t.requires.length)!;
    expect(dispatch(s, 'research', { kind: 'tech', id: t2.id }, T0 + 30 * 24 * H).ok).toBe(false);
  });
  it('éveille les héros au temple et les améliore', () => {
    const s = devVillage(11, T0);
    expect(Object.keys(s.heroes).length).toBeGreaterThanOrEqual(3);
    s.resources.energy = 1e6;
    const lvl = s.heroes.arkon.level;
    expect(dispatch(s, 'heroUpgrade', { id: 'arkon' }, T0).ok).toBe(true);
    advance(s, T0 + 24 * H);
    expect(s.heroes.arkon.level).toBe(lvl + 1);
    s.resources.gold = s.resources.energy = 1e7;
    s.inventory.equipment = [];
    expect(dispatch(s, 'forge', { id: 'runic_blade' }, T0 + 24 * H).ok).toBe(true);
    expect(dispatch(s, 'equip', { hero: 'arkon', item: 'runic_blade' }, T0 + 24 * H).ok).toBe(true);
    expect(dispatch(s, 'equip', { hero: 'lyra', item: 'iron_pavise' }, T0 + 24 * H).ok).toBe(false);
  });
});

describe('guildes et guerres', () => {
  it('rejoindre, discuter, demander des renforts, donner', () => {
    const s = devVillage(6, T0);
    s.player.trophies = 5000;
    const g = suggestedGuilds(s, Math.floor(T0 / 3600000)).find(x => x.open && x.minTrophies <= s.player.trophies)!;
    expect(dispatch(s, 'guildJoin', { id: 'inexistante' }, T0).ok).toBe(false);
    expect(dispatch(s, 'guildJoin', { id: g.id }, T0).ok).toBe(true);
    expect(dispatch(s, 'guildChat', { text: 'Salut <b>tout</b> le monde' }, T0).ok).toBe(true);
    expect(s.guild!.chat.some(m => m.text.includes('<'))).toBe(false);
    expect(dispatch(s, 'guildRequest', {}, T0).ok).toBe(true);
    for (let i = 0; i < 200; i++) tickGuild(s, T0 + 5000 + i * 5000);
    expect(Object.values(s.army.guildTroops).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    s.army.units = { soldier: 5 };
    expect(dispatch(s, 'guildDonate', { unit: 'soldier' }, T0 + 1e6).ok).toBe(true);
    expect(s.army.units.soldier).toBe(4);
  });
  it('déroule une guerre complète : préparation → bataille → score → récompenses', () => {
    const s = devVillage(7, T0);
    s.resources.gold = 1e6;
    expect(dispatch(s, 'guildCreate', { name: 'Testeurs', emblem: '🦁', desc: '' }, T0).ok).toBe(true);
    expect(dispatch(s, 'warStart', {}, T0).ok).toBe(false); // trop peu de membres
    for (let i = 0; i < 9; i++) s.guild!.members.push({ id: 'b' + i, name: 'Bot' + i, trophies: 100, role: 'membre', citadel: 7, donations: 0, bot: true });
    expect(dispatch(s, 'warStart', {}, T0).ok).toBe(true);
    expect(s.war!.phase).toBe('preparation');
    fastForwardWar(s, T0); tickWar(s, T0);
    expect(s.war!.phase).toBe('battle');
    // le joueur attaque
    s.army.units = { soldier: 80, brute: 10 };
    const r = dispatch(s, 'battle', { opponent: { kind: 'war', target: 0 }, seed: 3, commands: Array.from({ length: 90 }, (_, i) => ({ tick: i, t: 'deploy', unit: i < 80 ? 'soldier' : 'brute', x: 0.5 + (i % 40), y: 0.6 })) }, T0 + 1000);
    expect(r.ok).toBe(true);
    expect(s.war!.attacksLeft).toBe(1);
    for (let i = 0; i < 40; i++) tickWar(s, T0 + PREP + i * 100000, 5);
    fastForwardWar(s, T0 + 2000); tickWar(s, T0 + 2000, 5);
    expect(s.war!.phase).toBe('ended');
    expect(['victory', 'defeat', 'draw']).toContain(s.war!.result);
    const c = s.resources.crystals;
    expect(dispatch(s, 'warClaim', {}, T0 + 3000).ok).toBe(true);
    expect(s.resources.crystals).toBeGreaterThan(c);
    expect(dispatch(s, 'warClaim', {}, T0 + 3000).ok).toBe(false);
  });
});
const PREP = 10 * 60000;

describe('boutique, pass et achats', () => {
  it('achète une apparence et un thème en cristaux, sans avantage', () => {
    const s = newGame(T0); s.resources.crystals = 5000;
    expect(dispatch(s, 'buyItem', { id: 'theme_winter' }, T0).ok).toBe(true);
    expect(dispatch(s, 'setTheme', { id: 'theme_winter' }, T0).ok).toBe(true);
    expect(dispatch(s, 'buyItem', { id: 'theme_winter' }, T0).ok).toBe(false);
    expect(dispatch(s, 'setTheme', { id: 'theme_desert' }, T0).ok).toBe(false);
  });
  it('Royal Pass : paliers gratuits/premium', () => {
    const s = newGame(T0);
    s.pass.xp = XP_PER_TIER * 3;
    expect(passTier(s)).toBe(3);
    expect(dispatch(s, 'claimTier', { tier: 1, track: 'free' }, T0).ok).toBe(true);
    expect(dispatch(s, 'claimTier', { tier: 1, track: 'free' }, T0).ok).toBe(false);
    expect(dispatch(s, 'claimTier', { tier: 1, track: 'premium' }, T0).ok).toBe(false);
    expect(dispatch(s, 'claimTier', { tier: 4, track: 'free' }, T0).ok).toBe(false);
    s.resources.crystals = 1000;
    expect(dispatch(s, 'buyPass', {}, T0).ok).toBe(true);
    expect(dispatch(s, 'claimTier', { tier: 1, track: 'premium' }, T0).ok).toBe(true);
  });
  it('missions quotidiennes alimentent le pass', () => {
    const s = newGame(T0);
    syncMissions(s, T0);
    expect(s.missions.daily.length).toBe(3);
    const m = s.missions.daily[0];
    progressMission(s, 'collect', 1e9); progressMission(s, 'win', 99); progressMission(s, 'stars', 99); progressMission(s, 'train', 999); progressMission(s, 'upgrade', 99); progressMission(s, 'spell', 99); progressMission(s, 'donate', 99); progressMission(s, 'destroy', 999); progressMission(s, 'campaign', 9);
    expect(dispatch(s, 'claimMission', { id: m.id }, T0).ok).toBe(true);
    expect(s.pass.xp).toBeGreaterThan(0);
  });
  it('achats intégrés : validation, déjà possédé, erreurs, attente et restauration', async () => {
    const s = newGame(T0);
    const provider = new MockBillingProvider();
    const hooks = { grant: (p: string, t: string) => grantProduct(s, p, t), addPending: (raw: string) => { s.shop.pendingTokens.push(raw); }, isProcessed: (t: string) => s.shop.tokens.includes(t) };
    const svc = new PurchaseService(provider, hooks, localTestValidator);
    const c0 = s.resources.crystals;
    expect((await svc.buy('crystals_medium')).ok).toBe(true);
    expect(s.resources.crystals).toBe(c0 + 650);
    expect((await svc.buy('starter_pack')).ok).toBe(true);
    const again = await svc.buy('starter_pack');
    expect(again.ok).toBe(false);
    expect(again.code).toBe('already_owned');
    provider.failNext = 'cancelled';
    expect((await svc.buy('crystals_small')).code).toBe('cancelled');
    // jeton falsifié refusé
    const fake: PurchaseToken = { productId: 'crystals_large', token: 'test.fake', orderId: 'x', signature: 'bad' };
    expect((await svc.process(fake)).code).toBe('invalid');
    // validation serveur injoignable -> en attente, puis crédit à la reprise
    const offline = new PurchaseService(provider, hooks, async () => { throw new Error('réseau'); });
    const r = await offline.buy('crystals_small');
    expect(r.code).toBe('pending');
    expect(s.shop.pendingTokens.length).toBe(1);
    expect(await svc.retryPending(s.shop.pendingTokens)).toBe(1);
    // restauration sur un nouvel appareil
    const s2 = newGame(T0);
    const svc2 = new PurchaseService(provider, { grant: (p, t) => grantProduct(s2, p, t), addPending: () => {}, isProcessed: t => s2.shop.tokens.includes(t) }, localTestValidator);
    const rest = await svc2.restore();
    expect(rest.restored).toBe(1); // starter_pack (non consommable)
    expect(s2.inventory.cosmetics).toContain('citadel_jade');
  });
});
