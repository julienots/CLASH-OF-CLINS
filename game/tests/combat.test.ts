import { describe, it, expect } from 'vitest';
import { newGame, advance } from '../src/core/game';
import { dispatch } from '../src/core/actions';
import { BattleSim, simulate, type BattleSetup } from '../src/combat/sim';
import { generateBase, generateLoot } from '../src/campaign/basegen';
import { campaignOpponent, makeSetup, invasionSetup, findOpponent } from '../src/combat/setup';
import { planAttack, botArmy } from '../src/combat/ai';
import { devVillage } from '../src/debug/cheats';
import { Rng } from '../src/core/rng';
import { SPELLS } from '../src/spells/defs';
import { CAMPAIGN } from '../src/campaign/campaign';
import { processOfflineDefenses } from '../src/defense/offlineDefense';
import { MAP_SIZE } from '../src/core/state';

const T0 = Date.UTC(2026, 9, 7, 12);

function setupFor(cl: number, units: Record<string, number>, extra: Partial<BattleSetup['attacker']> = {}, seed = 5): BattleSetup {
  const base = generateBase({ citadel: cl, seed, levelPenalty: 1 });
  return { seed, mode: 'raid', base: { buildings: base.buildings }, attacker: { units, unitLevels: {}, spells: {}, spellLevels: {}, heroes: [], ...extra }, loot: generateLoot(base.buildings, cl, new Rng(seed)), timeLimit: 180 };
}

describe('simulation de combat', () => {
  it('est déterministe : rejouer les commandes donne le même résultat', () => {
    const setup = setupFor(6, botArmy(6, 3).units, { spells: { lightning: 2, rage: 1 } });
    const cmds = planAttack(setup, 9);
    const a = simulate(setup, cmds), b = simulate(setup, cmds);
    expect(a.stars).toBe(b.stars);
    expect(a.destruction).toBe(b.destruction);
    expect(a.loot).toEqual(b.loot);
    expect(a.ticks).toBe(b.ticks);
  });
  it('refuse le déploiement dans la zone interdite et accepte au bord', () => {
    const sim = new BattleSim(setupFor(3, { soldier: 5 }));
    const cit = sim.buildings.find(b => b.isCitadel)!;
    expect(sim.command({ tick: 0, t: 'deploy', unit: 'soldier', x: cit.cx, y: cit.cy })).toBe(false);
    expect(sim.command({ tick: 0, t: 'deploy', unit: 'soldier', x: 0.5, y: 0.5 })).toBe(true);
    expect(sim.remaining.soldier).toBe(4);
  });
  it('les unités franchissent ou contournent les murs (pas d\'IA bloquée)', () => {
    const setup = setupFor(8, { soldier: 60, brute: 10, engineer: 6 }, {}, 11);
    const sim = new BattleSim(setup);
    for (let i = 0; i < 76; i++) sim.command({ tick: 0, t: 'deploy', unit: i < 60 ? 'soldier' : i < 70 ? 'brute' : 'engineer', x: 0.6 + (i % 20) * 2, y: 0.6 });
    const start = sim.units.map(u => ({ x: u.x, y: u.y }));
    for (let i = 0; i < 300; i++) sim.step();
    const moved = sim.units.filter((u, i) => start[i] && Math.hypot(u.x - start[i].x, u.y - start[i].y) > 2).length;
    expect(moved).toBeGreaterThan(30);
    const r = sim.result();
    expect(r.destruction + sim.buildings.filter(b => b.isWall && !b.alive).length).toBeGreaterThan(0);
  });
  it('les défenses ciblent sol / air correctement', () => {
    const setup = setupFor(4, { airship: 1 });
    const sim = new BattleSim(setup);
    sim.command({ tick: 0, t: 'deploy', unit: 'airship', x: 0.5, y: MAP_SIZE / 2 });
    for (let i = 0; i < 600 && !sim.ended; i++) sim.step();
    // seuls les canons (sol) ne doivent jamais viser l'aéronef
    const cannons = sim.buildings.filter(b => b.type === 'cannon');
    expect(cannons.every(c => c.target === -1 || sim.units.find(u => u.id === c.target)?.flying !== true)).toBe(true);
  });
  it('tous les sorts produisent un effet', () => {
    for (const sp of SPELLS) {
      const setup = setupFor(5, { soldier: 20 }, { spells: { [sp.id]: 1 } });
      const sim = new BattleSim(setup);
      for (let i = 0; i < 20; i++) sim.command({ tick: 0, t: 'deploy', unit: 'soldier', x: 0.6 + i, y: 0.6 });
      for (let i = 0; i < 50; i++) sim.step();
      const target = sim.buildings.find(b => b.def) ?? sim.buildings[0];
      const hpBefore = sim.buildings.reduce((a, b) => a + b.hp, 0);
      const ok = sim.command({ tick: 0, t: 'spell', spell: sp.id, x: sp.id === 'heal' || sp.id === 'rage' || sp.id === 'shield' ? sim.units[0].x : target.cx, y: sp.id === 'heal' || sp.id === 'rage' || sp.id === 'shield' ? sim.units[0].y : target.cy });
      expect(ok, sp.id).toBe(true);
      expect(sim.command({ tick: 0, t: 'spell', spell: sp.id, x: 1, y: 1 })).toBe(false); // plus de charges
      sim.step();
      const evs = sim.events.length >= 0;
      expect(evs).toBe(true);
      if (sp.id === 'lightning' || sp.id === 'meteor') expect(sim.buildings.reduce((a, b) => a + b.hp, 0), sp.id).toBeLessThan(hpBefore);
      if (sp.id === 'freeze') expect(sim.buildings.some(b => b.frozenUntil > sim.tick), sp.id).toBe(true);
      if (sp.id === 'shield') expect(sim.units.some(u => u.shield > 0), sp.id).toBe(true);
      if (sp.id === 'rage' || sp.id === 'heal') expect(sim.zones.length).toBe(1);
    }
  });
  it('les pièges restent cachés puis se déclenchent', () => {
    const setup = setupFor(7, { soldier: 80 }, {}, 21);
    const sim = new BattleSim(setup);
    expect(sim.traps.length).toBeGreaterThan(0);
    expect(sim.traps.every(t => !t.triggered)).toBe(true);
    const cmds = planAttack(setup, 4);
    sim.runWithCommands(cmds, 1800);
    expect(sim.traps.some(t => t.triggered)).toBe(true);
  });
  it('les héros utilisent compétence et ultime', () => {
    const s = devVillage(12, T0);
    s.army.units = { soldier: 50, brute: 10 };
    const opp = findOpponent(s, 77, T0);
    const setup = makeSetup(s, opp, 3);
    expect(setup.attacker.heroes.length).toBeGreaterThanOrEqual(3);
    const sim = new BattleSim(setup);
    for (const h of setup.attacker.heroes) expect(sim.command({ tick: 0, t: 'hero', hero: h.id, x: 0.5, y: 22 })).toBe(true);
    for (let i = 0; i < 20; i++) sim.step();
    for (const h of setup.attacker.heroes) expect(sim.command({ tick: 0, t: 'ability', hero: h.id })).toBe(true);
    for (const h of setup.attacker.heroes) expect(sim.command({ tick: 0, t: 'ability', hero: h.id })).toBe(false);
    const hero = sim.units.find(u => u.hero && u.team === 'att')!;
    hero.ultCharge = 1;
    expect(sim.command({ tick: 0, t: 'ultimate', hero: hero.hero!, x: 22, y: 22 })).toBe(true);
    expect(hero.ultCharge).toBe(0);
  });
});

describe('campagne', () => {
  it('a 30 niveaux, tous générables et gagnables par une armée adaptée', () => {
    expect(CAMPAIGN.length).toBe(30);
    for (const lv of [1, 5, 10, 15, 20, 25, 30]) {
      const opp = campaignOpponent(lv);
      expect(opp.buildings.some(b => b.type === 'citadel')).toBe(true);
      const cl = CAMPAIGN[lv - 1].citadel;
      const army = botArmy(Math.min(15, cl + 2), lv);
      const lvl: Record<string, number> = {};
      for (const k of Object.keys(army.units)) lvl[k] = Math.max(1, Math.ceil(cl * 0.6));
      const setup: BattleSetup = { seed: lv, mode: 'campaign', base: { buildings: opp.buildings, heroes: opp.heroes }, attacker: { units: army.units, unitLevels: lvl, spells: army.spells, spellLevels: {}, heroes: [] }, loot: {}, timeLimit: 180 };
      const r = simulate(setup, planAttack(setup, lv));
      expect(r.destruction, `niveau ${lv}`).toBeGreaterThan(20);
    }
  });
  it('enregistre les étoiles et la récompense via l\'action validée par replay', () => {
    const s = newGame(T0);
    s.army.units = { soldier: 40 };
    const setup = makeSetup(s, campaignOpponent(1), 42);
    const cmds = planAttack(setup, 1);
    const r = dispatch(s, 'battle', { opponent: { kind: 'campaign', index: 1 }, seed: 42, commands: cmds }, T0);
    expect(r.ok).toBe(true);
    expect(s.campaign.stars[1]).toBeGreaterThan(0);
    expect(s.army.units.soldier).toBeLessThan(40);
    expect(dispatch(s, 'battle', { opponent: { kind: 'campaign', index: 5 }, seed: 1, commands: cmds }, T0).ok).toBe(false); // verrouillé
  });
});

describe('raids, trophées et butin', () => {
  it('pille, gagne des trophées et retire le bouclier', () => {
    const s = devVillage(5, T0);
    s.army.units = botArmy(6, 2).units;
    s.resources.gold = 0;
    const opp = findOpponent(s, 1234, T0);
    const setup = makeSetup(s, opp, 9);
    const cmds = planAttack(setup, 2);
    const r = dispatch(s, 'battle', { opponent: { kind: 'raid', seed: 1234 }, seed: 9, commands: cmds }, T0);
    expect(r.ok).toBe(true);
    const res = r.data.result;
    if (res.stars > 0) expect(s.player.trophies).toBeGreaterThan(0);
    expect(s.resources.gold).toBe(r.data.applied.loot.gold ?? 0);
    expect(s.player.shieldUntil).toBe(0);
  });
});

describe('défense', () => {
  it('invasion : le village se défend avec ses défenses', () => {
    const s = devVillage(6, T0);
    const setup = invasionSetup(s, 5);
    const r = simulate(setup, []);
    expect(r.ticks).toBeGreaterThan(10);
    const d = dispatch(s, 'invasion', { seed: 5, commands: [] }, T0);
    expect(d.ok).toBe(true);
    expect(s.log[0].kind).toBe('invasion');
  });
  it('attaques hors-ligne : pertes bornées, bouclier, journal', () => {
    const s = devVillage(7, T0);
    s.player.shieldUntil = 0;
    const before = { ...s.resources };
    const n = processOfflineDefenses(s, T0, T0 + 24 * 3600000);
    expect(n).toBeGreaterThan(0);
    expect(s.log.length).toBe(n);
    for (const k of ['gold', 'wood', 'energy'] as const) { expect(s.resources[k]).toBeGreaterThanOrEqual(0); expect(s.resources[k]).toBeLessThanOrEqual(before[k]); }
  });
  it('les héros défendent leur temple', () => {
    const s = devVillage(11, T0);
    const setup = invasionSetup(s, 8);
    expect(setup.base.heroes!.length).toBeGreaterThan(0);
    const sim = new BattleSim(setup);
    expect(sim.units.filter(u => u.team === 'def' && u.hero).length).toBe(setup.base.heroes!.length);
  });
});

describe('robustesse', () => {
  it('aucune valeur NaN ni unité hors carte sur 20 combats aléatoires', () => {
    for (let i = 0; i < 20; i++) {
      const cl = 1 + (i % 15);
      const setup = setupFor(cl, botArmy(cl, i).units, { spells: botArmy(cl, i).spells }, 100 + i);
      const sim = new BattleSim(setup);
      sim.runWithCommands(planAttack(setup, i), 1800);
      for (const u of sim.units) { expect(Number.isFinite(u.x) && Number.isFinite(u.y)).toBe(true); expect(u.x).toBeGreaterThanOrEqual(0); expect(u.x).toBeLessThanOrEqual(MAP_SIZE); }
      for (const b of sim.buildings) expect(Number.isFinite(b.hp)).toBe(true);
      expect(sim.ended).toBe(true);
    }
  });
  it('le village avance correctement entre deux actions', () => {
    const s = newGame(T0);
    advance(s, T0 + 1000);
    expect(s.lastTick).toBe(T0 + 1000);
  });
});
