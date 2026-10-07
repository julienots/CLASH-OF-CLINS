// IA d'attaque (bots) : planifie un déploiement crédible pour les défenses
// hors-ligne, les guerres de guilde et les tests de longue durée.
import { Rng } from '../core/rng';
import { MAP_SIZE } from '../core/state';
import { BattleSim, type BattleSetup, type Command } from './sim';
import { UNITS, TRAINABLE } from '../units/defs';
import { SPELLS } from '../spells/defs';

/** Choisit un flanc puis déploie tanks, puis soutien, puis sorts sur les défenses. */
export function planAttack(setup: BattleSetup, seed: number): Command[] {
  const rng = new Rng(seed);
  const probe = new BattleSim(setup);
  const cmds: Command[] = [];
  const C = MAP_SIZE / 2;
  // côté avec le plus de bâtiments de ressources ou de défenses
  const sides = [0, 1, 2, 3].map(side => {
    let score = 0;
    for (const b of probe.buildings) {
      if (b.isWall) continue;
      const v = side === 0 ? -b.cy : side === 1 ? b.cx : side === 2 ? b.cy : -b.cx;
      score += v * (b.isRes ? 1.2 : 1);
    }
    return { side, score: score + rng.range(0, 30) };
  }).sort((a, b) => b.score - a.score);
  const side = sides[0].side;
  const edgePoint = (t: number): [number, number] => {
    // parcourt le bord du côté choisi jusqu'à trouver une case de déploiement valide
    for (let inset = 0.6; inset < 12; inset += 0.5) {
      const along = C + (t - 0.5) * (MAP_SIZE - 8);
      const [x, y] = side === 0 ? [along, inset] : side === 1 ? [MAP_SIZE - inset, along] : side === 2 ? [along, MAP_SIZE - inset] : [inset, along];
      if (probe.canDeployAt(x, y)) {
        // avance au plus près de la base tant que c'est autorisé
        let bx = x, by = y;
        for (let k = 0; k < 20; k++) {
          const nx = bx + (C - bx) * 0.04, ny = by + (C - by) * 0.04;
          if (!probe.canDeployAt(nx, ny)) break;
          bx = nx; by = ny;
        }
        return [bx, by];
      }
    }
    return side === 0 ? [C, 0.5] : side === 1 ? [MAP_SIZE - 0.5, C] : side === 2 ? [C, MAP_SIZE - 0.5] : [0.5, C];
  };
  const units = Object.entries(setup.attacker.units).filter(([, n]) => n > 0);
  const tanks = units.filter(([id]) => (UNITS[id]?.hp ?? 0) >= 300 && UNITS[id]?.target === 'defense');
  const breakers = units.filter(([id]) => UNITS[id]?.target === 'wall');
  const rest = units.filter(([id]) => !tanks.some(t => t[0] === id) && !breakers.some(t => t[0] === id));
  let tick = 5;
  const spread = (id: string, n: number, gap: number) => {
    for (let i = 0; i < n; i++) {
      const [x, y] = edgePoint(0.3 + rng.range(0, 0.4));
      cmds.push({ tick, t: 'deploy', unit: id, x, y });
      if (i % 3 === 2) tick += gap;
    }
  };
  for (const [id, n] of tanks) spread(id, n, 1);
  tick += 25;
  for (const [id, n] of breakers) spread(id, n, 2);
  for (const h of setup.attacker.heroes) { const [x, y] = edgePoint(0.5); cmds.push({ tick, t: 'hero', hero: h.id, x, y }); }
  tick += 10;
  for (const [id, n] of rest) spread(id, n, 1);
  // sorts : visent le groupe de défenses le plus dense vers ~15 s puis ~40 s
  const defs = probe.buildings.filter(b => b.def);
  let st = 150;
  for (const sp of SPELLS) {
    const n = setup.attacker.spells[sp.id] ?? 0;
    for (let i = 0; i < n; i++) {
      const target = defs.length ? defs[rng.int(0, defs.length - 1)] : null;
      if (!target) break;
      cmds.push({ tick: st, t: 'spell', spell: sp.id, x: target.cx, y: target.cy });
      st += 60;
    }
  }
  for (const h of setup.attacker.heroes) {
    cmds.push({ tick: tick + 200, t: 'ability', hero: h.id });
    cmds.push({ tick: tick + 600, t: 'ultimate', hero: h.id, x: C, y: C });
  }
  return cmds;
}

/** Armée de bot cohérente avec un niveau de Citadelle. */
export function botArmy(cl: number, seed: number): { units: Record<string, number>; spells: Record<string, number> } {
  const rng = new Rng(seed);
  const cap = Math.min(600, [50, 75, 100, 150, 175, 225, 250, 275, 325, 375, 425, 475, 525, 575, 600][cl - 1]);
  const barracks = Math.min(12, cl);
  const pool = TRAINABLE.filter(u => u.building === 'barracks' && u.unlockLevel <= barracks && !u.temporary);
  const units: Record<string, number> = {};
  let left = cap;
  const tank = pool.filter(u => u.target === 'defense' && u.hp >= 300).pop();
  if (tank) { const n = Math.floor((cap * 0.3) / tank.housing); units[tank.id] = n; left -= n * tank.housing; }
  const eng = pool.find(u => u.id === 'engineer');
  if (eng) { units[eng.id] = 4; left -= 8; }
  while (left > 0) {
    const u = rng.pick(pool.filter(p => p.housing <= left && p.id !== 'engineer'));
    if (!u) break;
    units[u.id] = (units[u.id] ?? 0) + 1;
    left -= u.housing;
  }
  const spells: Record<string, number> = {};
  const academy = cl >= 5 ? Math.min(7, Math.ceil((cl - 4) / 1.5)) : 0;
  const sp = SPELLS.filter(s => s.academy <= academy);
  for (let i = 0; i < Math.min(academy + 2, 6) && sp.length; i++) { const s = rng.pick(sp); spells[s.id] = (spells[s.id] ?? 0) + 1; }
  return { units, spells };
}
