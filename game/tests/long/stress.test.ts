// Tests longs : crash, freeze, fuite mémoire, ressources négatives, sauvegardes corrompues, IA bloquée.
import { describe, it, expect } from 'vitest';
import { BattleSim, type BattleSetup } from '../../src/combat/sim';
import { generateBase, generateLoot, type Formation } from '../../src/campaign/basegen';
import { planAttack, botArmy } from '../../src/combat/ai';
import { Rng } from '../../src/core/rng';
import { newGame, advance } from '../../src/core/game';
import { dispatch, ACTIONS, internalErrors } from '../../src/core/actions';
import { SaveManager, memoryStorage, serialize, deserialize, SAVE_KEY } from '../../src/save/save';
import { BUILDING_LIST, bdef } from '../../src/buildings/defs';
import { TRAINABLE } from '../../src/units/defs';
import { SPELLS } from '../../src/spells/defs';
import { findFreeSpot } from '../../src/village/grid';
import { citadelLevel } from '../../src/village/query';
import { RES_KEYS } from '../../src/core/types';
import { MAP_SIZE } from '../../src/core/state';
import { tickGuild } from '../../src/guilds/guild';
import { tickWar } from '../../src/wars/war';
import { processOfflineDefenses } from '../../src/defense/offlineDefense';

const FORMS: Formation[] = ['ring', 'core', 'spread', 'compartments', 'island', 'maze', 'fortress'];

describe('simulations de combat massives', () => {
  it('600 combats : aucun crash, freeze, NaN ni IA bloquée', () => {
    const t0 = performance.now();
    let stuckTotal = 0, unitsTotal = 0, maxMs = 0;
    for (let i = 0; i < 600; i++) {
      const rng = new Rng(i * 7919);
      const cl = 1 + (i % 15);
      const base = generateBase({ citadel: cl, seed: i, formation: FORMS[i % FORMS.length] });
      const army = botArmy(Math.min(15, cl + rng.int(-1, 2)), i);
      const lv: Record<string, number> = {};
      for (const k of Object.keys(army.units)) lv[k] = rng.int(1, Math.max(1, Math.ceil(cl / 2)));
      const setup: BattleSetup = { seed: i, mode: 'raid', base: { buildings: base.buildings }, attacker: { units: army.units, unitLevels: lv, spells: army.spells, spellLevels: {}, heroes: [] }, loot: generateLoot(base.buildings, cl, rng), timeLimit: 180 };
      const s0 = performance.now();
      const sim = new BattleSim(setup);
      const cmds = planAttack(setup, i).sort((a, b) => a.tick - b.tick);
      let ci = 0;
      const last = new Map<number, { x: number; y: number; t: number }>();
      while (!sim.ended && sim.tick < 1900) {
        while (ci < cmds.length && cmds[ci].tick <= sim.tick) sim.command(cmds[ci++]);
        sim.step();
        if (sim.tick % 50 === 0) for (const u of sim.units) {
          if (!u.alive || u.team !== 'att') continue;
          const p = last.get(u.id);
          const moved = !p || Math.hypot(u.x - p.x, u.y - p.y) > 0.2 || sim.tick - u.lastAttack < 50 || u.frozenUntil > sim.tick;
          if (moved) last.set(u.id, { x: u.x, y: u.y, t: sim.tick });
          else if (sim.tick - p!.t >= 150 && u.target) { stuckTotal++; last.set(u.id, { x: u.x, y: u.y, t: sim.tick }); }
        }
      }
      maxMs = Math.max(maxMs, performance.now() - s0);
      unitsTotal += Object.values(sim.usedUnits).reduce((a, b) => a + b, 0);
      expect(sim.ended || sim.tick >= 1800).toBe(true);
      for (const u of sim.units) { expect(Number.isFinite(u.x + u.y + u.hp)).toBe(true); expect(u.x >= 0 && u.x <= MAP_SIZE && u.y >= 0 && u.y <= MAP_SIZE).toBe(true); }
      for (const k of RES_KEYS) expect(sim.lootGained[k]).toBeGreaterThanOrEqual(0);
    }
    const ratio = stuckTotal / Math.max(1, unitsTotal);
    console.log(`600 combats en ${((performance.now() - t0) / 1000).toFixed(1)} s · combat max ${maxMs.toFixed(0)} ms · unités immobiles >15 s : ${stuckTotal}/${unitsTotal} (${(ratio * 100).toFixed(2)} %)`);
    expect(ratio).toBeLessThan(0.02);
    expect(maxMs).toBeLessThan(3000);
  });

  it('pas de fuite mémoire sur 300 combats', () => {
    const run = () => {
      for (let i = 0; i < 100; i++) {
        const base = generateBase({ citadel: 8, seed: i });
        const army = botArmy(8, i);
        const setup: BattleSetup = { seed: i, mode: 'raid', base: { buildings: base.buildings }, attacker: { units: army.units, unitLevels: {}, spells: army.spells, spellLevels: {}, heroes: [] }, loot: {}, timeLimit: 180 };
        const sim = new BattleSim(setup);
        sim.runWithCommands(planAttack(setup, i), 1810);
      }
    };
    run();
    (globalThis as any).gc?.();
    const m1 = process.memoryUsage().heapUsed;
    run(); run();
    (globalThis as any).gc?.();
    const m2 = process.memoryUsage().heapUsed;
    console.log(`Tas : ${(m1 / 1e6).toFixed(1)} Mo → ${(m2 / 1e6).toFixed(1)} Mo`);
    expect(m2 - m1).toBeLessThan(60e6);
  });
});

describe('fuzzing de l\'économie', () => {
  it('60 jours de jeu aléatoire : jamais de ressources négatives, de chevauchements ou de sauvegarde invalide', () => {
    for (let run = 0; run < 6; run++) {
      const rng = new Rng(run + 1);
      let now = Date.UTC(2026, 0, 10);
      const s = newGame(now, 'Fuzz' + run, run);
      const store = memoryStorage();
      const saver = new SaveManager(store);
      const names = Object.keys(ACTIONS).filter(n => !['battle', 'invasion', 'settings', 'setName', 'tutorial'].includes(n));
      for (let step = 0; step < 3000; step++) {
        now += rng.int(1, 3600) * 1000;
        const r = rng.next();
        if (r < 0.25) {
          const d = rng.pick(BUILDING_LIST.filter(b => b.category !== 'decoration'));
          const spot = findFreeSpot(s, d.id, undefined, citadelLevel(s));
          if (spot) dispatch(s, 'place', { type: d.id, ...spot }, now);
        } else if (r < 0.5) {
          const b = rng.pick(s.buildings);
          dispatch(s, rng.chance(0.8) ? 'upgrade' : 'finish', { uid: b.uid }, now);
        } else if (r < 0.6) dispatch(s, 'collectAll', {}, now);
        else if (r < 0.7) dispatch(s, 'train', { unit: rng.pick(TRAINABLE).id, count: rng.int(1, 20) }, now);
        else if (r < 0.74) dispatch(s, 'brew', { spell: rng.pick(SPELLS).id }, now);
        else if (r < 0.78) {
          const b = rng.pick(s.buildings), sz = bdef(b.type).size;
          dispatch(s, 'move', { moves: [{ uid: b.uid, x: rng.int(0, MAP_SIZE - sz), y: rng.int(0, MAP_SIZE - sz) }] }, now);
        } else if (r < 0.8 && step % 50 === 0) {
          dispatch(s, 'battle', { opponent: { kind: 'raid', seed: step }, seed: step, commands: Object.keys(s.army.units).filter(k => s.army.units[k] > 0).flatMap((u, i) => Array.from({ length: Math.min(30, s.army.units[u]) }, (_, j) => ({ tick: i * 10 + j, t: 'deploy', unit: u, x: 0.5 + j, y: 0.6 }))), allowEmpty: true }, now);
        } else {
          // action arbitraire avec arguments aléatoires/invalides
          const name = rng.pick(names);
          dispatch(s, name, rng.chance(0.5) ? {} : { uid: rng.int(-5, 500), id: 'x' + rng.int(0, 9), amount: rng.range(-1e6, 1e6), count: rng.int(-10, 1000), x: rng.range(-5, 50), y: rng.range(-5, 50), tier: rng.int(-2, 40), track: rng.pick(['free', 'premium', 'zzz']) }, now);
        }
        if (step % 25 === 0) { tickGuild(s, now); tickWar(s, now, 1); }
        if (step % 200 === 0) processOfflineDefenses(s, now - 9 * 3600000, now, 1);
        // invariants
        for (const k of RES_KEYS) { expect(Number.isFinite(s.resources[k]), k).toBe(true); expect(s.resources[k], k).toBeGreaterThanOrEqual(0); }
        if (step % 100 === 0) {
          const occ = new Uint16Array(MAP_SIZE * MAP_SIZE);
          for (const b of s.buildings) { const sz = bdef(b.type).size; for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) { const i = (b.y + dy) * MAP_SIZE + b.x + dx; expect(occ[i], 'chevauchement').toBe(0); occ[i] = 1; } }
          saver.save(s);
          const back = saver.load(now);
          expect(back.status).toBe('ok');
          expect(back.state.buildings.length).toBe(s.buildings.length);
        }
      }
      expect(internalErrors, internalErrors.slice(0, 5).join(' | ')).toEqual([]);
      advance(s, now + 5 * 86400000);
      expect(citadelLevel(s)).toBeGreaterThanOrEqual(1);
      void store;
    }
  });

  it('sauvegardes corrompues aléatoirement : jamais de crash au chargement', () => {
    const s = newGame(Date.UTC(2026, 0, 1));
    const raw = serialize(s);
    const rng = new Rng(9);
    for (let i = 0; i < 2000; i++) {
      const arr = raw.split('');
      const n = rng.int(1, 6);
      for (let k = 0; k < n; k++) arr[rng.int(0, arr.length - 1)] = String.fromCharCode(rng.int(32, 126));
      const corrupted = rng.chance(0.2) ? arr.join('').slice(0, rng.int(0, raw.length)) : arr.join('');
      const st = memoryStorage(); st.set(SAVE_KEY, corrupted);
      const r = new SaveManager(st).load(Date.UTC(2026, 0, 2));
      expect(['ok', 'new', 'migrated', 'recovered']).toContain(r.status);
      expect(r.state.buildings.some(b => b.type === 'citadel')).toBe(true);
      void deserialize;
    }
  });
});
