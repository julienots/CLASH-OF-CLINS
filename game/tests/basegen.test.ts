import { describe, it, expect } from 'vitest';
import { generateBase } from '../src/campaign/basegen';
import { maxCount, BUILDING_LIST, bdef } from '../src/buildings/defs';
import { MAP_SIZE } from '../src/core/state';

describe('générateur de bases', () => {
  it('place toutes les défenses autorisées, sans chevauchement, à chaque niveau et formation', () => {
    for (let cl = 1; cl <= 15; cl++) for (const f of ['ring', 'core', 'spread', 'compartments', 'island', 'maze', 'fortress'] as const) {
      const base = generateBase({ citadel: cl, seed: cl * 7, formation: f });
      expect(base.buildings.find(b => b.type === 'citadel')!.level).toBe(cl);
      for (const d of BUILDING_LIST) if (d.category === 'defense') expect(base.buildings.filter(b => b.type === d.id).length, `CL${cl} ${f} ${d.id}`).toBe(maxCount(d.id, cl));
      const occ = new Uint8Array(MAP_SIZE * MAP_SIZE);
      for (const b of base.buildings) {
        const sz = bdef(b.type).size;
        for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
          const i = (b.y + dy) * MAP_SIZE + b.x + dx;
          expect(occ[i], `chevauchement CL${cl} ${f} ${b.type}`).toBe(0);
          occ[i] = 1;
        }
      }
    }
  });
});
