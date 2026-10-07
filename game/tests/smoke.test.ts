import { describe, it, expect } from 'vitest';
import { generateBase, generateLoot } from '../src/campaign/basegen';
import { BattleSim, simulate } from '../src/combat/sim';
import { planAttack, botArmy } from '../src/combat/ai';
import { Rng } from '../src/core/rng';

describe('smoke', () => {
  it('bot attacks across citadel levels', () => {
    for (const cl of [1, 3, 5, 8, 11, 15]) {
      const base = generateBase({ citadel: cl, seed: 42 + cl });
      const army = botArmy(cl, 7);
      const unitLevels: Record<string, number> = {};
      for (const k of Object.keys(army.units)) unitLevels[k] = Math.max(1, Math.floor(cl / 2));
      const setup = { seed: 1, mode: 'raid' as const, base: { buildings: base.buildings }, attacker: { units: army.units, unitLevels, spells: army.spells, spellLevels: {}, heroes: [] }, loot: generateLoot(base.buildings, cl, new Rng(1)), timeLimit: 180 };
      const t0 = performance.now();
      const cmds = planAttack(setup, 3);
      const r = simulate(setup, cmds);
      const dt = performance.now() - t0;
      console.log(`CL${cl} b=${base.buildings.length} units=${Object.values(army.units).reduce((a,b)=>a+b,0)} -> ${r.stars}★ ${r.destruction}% loot=${r.loot.gold} reason=${r.reason} ticks=${r.ticks} ${dt.toFixed(0)}ms`);
      expect(r.ticks).toBeGreaterThan(0);
    }
  });
});
