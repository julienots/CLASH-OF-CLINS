// Préparation des combats (raid, campagne, guerre, invasion) et application des résultats.
import type { GameState } from '../core/state';
import type { Resources } from '../core/types';
import { RES_KEYS } from '../core/types';
import { Rng } from '../core/rng';
import { MAP_SIZE } from '../core/state';
import type { BattleSetup, BattleResult, HeroLoadout, Command, BaseBuilding } from './sim';
import { generateBase, generateLoot, randomLordName, type Formation } from '../campaign/basegen';
import { CAMPAIGN } from '../campaign/campaign';
import { citadelLevel, mods, bestLevel } from '../village/query';
import { heroCombatStats } from '../heroes/heroes';
import { heroStats } from '../heroes/defs';
import { researchLevel } from '../research/research';
import { gain } from '../resources/economy';
import { consumeArmy } from '../army/army';
import { addXp } from '../progression/progression';
import { progressMission } from '../progression/missions';
import { addPassXp } from '../battlepass/pass';
import { eventModifiers } from '../events/events';
import { blevel } from '../buildings/defs';
import { MONSTERS } from '../units/defs';

export const BATTLE_TIME = 180;

export interface Opponent {
  kind: 'raid' | 'campaign' | 'war' | 'invasion' | 'village' | 'event';
  name: string;
  trophies: number;
  citadel: number;
  seed: number;
  formation: Formation;
  buildings: BaseBuilding[];
  loot: Record<number, Partial<Resources>>;
  campaignIndex?: number;
  warMember?: string;
  heroes?: HeroLoadout[];
}

export function attackerLoadout(s: GameState): BattleSetup['attacker'] {
  const units: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.army.units)) if (v > 0) units[k] = v;
  for (const [k, v] of Object.entries(s.army.guildTroops)) if (v > 0) units[k] = (units[k] ?? 0) + v;
  const spells: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.army.spells)) if (v > 0) spells[k] = v;
  const unitLevels: Record<string, number> = {};
  for (const k of Object.keys(units)) unitLevels[k] = researchLevel(s, k);
  const spellLevels: Record<string, number> = {};
  for (const k of Object.keys(spells)) spellLevels[k] = researchLevel(s, k);
  const heroes: HeroLoadout[] = [];
  for (const [id, h] of Object.entries(s.heroes)) {
    if (h.upgradeEndAt) continue; // en entraînement : indisponible
    const st = heroCombatStats(s, id);
    heroes.push({ id, level: h.level, hp: st.hp, dps: st.dps });
  }
  return { units, unitLevels, spells, spellLevels, heroes, mods: mods(s) };
}

/** Cherche un adversaire de niveau comparable (déterministe pour un seed donné). */
export function findOpponent(s: GameState, seed: number, now: number): Opponent {
  const rng = new Rng(seed);
  const cl = citadelLevel(s);
  const ocl = Math.max(1, Math.min(15, cl + rng.pick([-1, 0, 0, 0, 1])));
  const gen = generateBase({ citadel: ocl, seed, levelPenalty: 2, fill: rng.range(0.75, 1) });
  const ev = eventModifiers(now);
  const loot = generateLoot(gen.buildings, ocl, rng, (1 + mods(s).loot) * (1 + ev.lootBonus));
  return {
    kind: 'raid', name: randomLordName(rng), trophies: Math.max(0, s.player.trophies + rng.int(-80, 80)), citadel: ocl, seed,
    formation: gen.formation, buildings: gen.buildings, loot,
    heroes: ocl >= 5 && rng.chance(0.6) ? defenderHeroes(ocl, rng) : undefined,
  };
}

function defenderHeroes(cl: number, rng: Rng): HeroLoadout[] {
  const out: HeroLoadout[] = [];
  const ids = ['arkon', 'lyra', 'bronn', 'nyx'].filter((_, i) => cl >= 5 + i * 2);
  for (const id of ids) {
    const lvl = Math.max(1, Math.round((cl - 4) * 3 * rng.range(0.6, 1)));
    const st = heroStats(id, lvl);
    out.push({ id, level: lvl, hp: st.hp, dps: st.dps * 0.6 });
  }
  return out;
}

export function campaignOpponent(index: number): Opponent {
  const lv = CAMPAIGN[index - 1];
  const gen = generateBase({ citadel: lv.citadel, seed: lv.seed, formation: lv.formation, only: lv.only, fill: lv.fill, levelPenalty: lv.penalty });
  const rng = new Rng(lv.seed);
  const heroes = lv.boss && lv.citadel >= 5 ? defenderHeroes(lv.citadel, rng).slice(0, 1) : undefined;
  return { kind: 'campaign', name: lv.boss ?? lv.name, trophies: 0, citadel: lv.citadel, seed: lv.seed, formation: gen.formation, buildings: gen.buildings, loot: {}, campaignIndex: index, heroes };
}

export function villageOpponent(name: string, citadel: number, seed: number, kind: Opponent['kind'] = 'village', s?: GameState, now = Date.now()): Opponent {
  const rng = new Rng(seed);
  const gen = generateBase({ citadel, seed, levelPenalty: kind === 'event' ? 0 : 1, fill: 0.95 });
  const mult = kind === 'event' ? 1.5 * (1 + eventModifiers(now).lootBonus) : 1;
  return { kind, name, trophies: 0, citadel, seed, formation: gen.formation, buildings: gen.buildings, loot: generateLoot(gen.buildings, citadel, rng, mult * (s ? 1 + mods(s).loot : 1)), heroes: kind === 'event' ? defenderHeroes(citadel, rng) : undefined };
}

export function makeSetup(s: GameState, opp: Opponent, seed: number): BattleSetup {
  return {
    seed, mode: opp.kind === 'campaign' ? 'campaign' : opp.kind === 'war' ? 'war' : 'raid',
    base: { buildings: opp.buildings, heroes: opp.heroes, defMods: {} },
    attacker: attackerLoadout(s),
    loot: opp.loot,
    timeLimit: BATTLE_TIME,
    revealTraps: (bestLevel(s, 'observatory') ? (blevel('observatory', bestLevel(s, 'observatory')).value ?? 0) : 0) + mods(s).scouting,
  };
}

// ─────────── Trophées ───────────
export function trophyDelta(myTrophies: number, oppTrophies: number, stars: number): number {
  const diff = Math.max(-400, Math.min(400, oppTrophies - myTrophies));
  if (stars > 0) return Math.round((20 + diff / 25) * (0.6 + stars * 0.2) + 4);
  return -Math.max(5, Math.round(16 - diff / 40));
}

export interface AppliedResult { trophies: number; loot: Partial<Resources>; xp: number; reward?: Partial<Resources>; crystals?: number; newStars?: number }

/** Applique le résultat d'un combat offensif à l'état du joueur. */
export function applyAttackResult(s: GameState, opp: Opponent, r: BattleResult, now: number): AppliedResult {
  consumeArmy(s, r.usedUnits, r.usedSpells);
  const out: AppliedResult = { trophies: 0, loot: {}, xp: 0 };
  const won = r.stars > 0;
  s.player.stats.spellsCast += Object.values(r.usedSpells).reduce((a, b) => a + b, 0);
  progressMission(s, 'spell', Object.values(r.usedSpells).reduce((a, b) => a + b, 0));
  progressMission(s, 'destroy', Math.round(r.destruction / 100 * opp.buildings.filter(b => b.type !== 'wall').length));
  if (opp.kind === 'campaign' && opp.campaignIndex) {
    const lv = CAMPAIGN[opp.campaignIndex - 1];
    const prev = s.campaign.stars[lv.index] ?? 0;
    progressMission(s, 'campaign', 1);
    if (r.stars > prev) {
      s.campaign.stars[lv.index] = r.stars;
      out.newStars = r.stars - prev;
      // récompense proportionnelle aux nouvelles étoiles
      const frac = (r.stars - prev) / 3;
      const rw: Partial<Resources> = {};
      for (const k of RES_KEYS) if (lv.reward[k]) rw[k] = Math.round((lv.reward[k] ?? 0) * frac);
      out.reward = gain(s, rw);
      if (prev === 0) { s.resources.crystals += lv.firstStarBonus; out.crystals = lv.firstStarBonus; }
      progressMission(s, 'stars', r.stars - prev);
    }
  } else {
    out.loot = gain(s, r.loot);
    s.player.stats.goldLooted += out.loot.gold ?? 0;
    s.player.stats.woodLooted += out.loot.wood ?? 0;
    if (opp.kind === 'raid') {
      out.trophies = trophyDelta(s.player.trophies, opp.trophies, r.stars);
      s.player.trophies = Math.max(0, s.player.trophies + out.trophies);
      s.player.bestTrophies = Math.max(s.player.bestTrophies, s.player.trophies);
      s.player.shieldUntil = 0; // attaquer retire le bouclier
    }
    progressMission(s, 'stars', r.stars);
  }
  if (won) { s.player.stats.attacksWon++; progressMission(s, 'win', 1); } else s.player.stats.attacksLost++;
  s.player.stats.starsTotal += r.stars;
  out.xp = 5 + r.stars * 5;
  addXp(s, out.xp);
  addPassXp(s, 20 + r.stars * 25);
  void now;
  return out;
}

// ─────────── Défense : base du joueur ───────────
export function playerBase(s: GameState): BattleSetup['base'] {
  const heroes: HeroLoadout[] = [];
  for (const [id, h] of Object.entries(s.heroes)) {
    if (h.upgradeEndAt) continue;
    const st = heroCombatStats(s, id);
    heroes.push({ id, level: h.level, hp: st.hp, dps: st.dps });
  }
  const m = mods(s);
  return {
    buildings: s.buildings.filter(b => b.level > 0).map(b => ({ uid: b.uid, type: b.type, level: b.level, x: b.x, y: b.y })),
    heroes,
    defMods: { defDmg: m.defDmg, defHp: m.defHp, wallHp: m.wallHp, trapDmg: m.trapDmg, defRange: m.defRange },
    guildTroops: Object.keys(s.army.guildTroops).length ? { ...s.army.guildTroops } : undefined,
  };
}

/** Vagues de monstres d'invasion adaptées au niveau du village. */
export function invasionWaves(cl: number, seed: number): Command[] {
  const rng = new Rng(seed);
  const cmds: Command[] = [];
  const budget = 25 + cl * cl * 6;
  const waves = 3 + Math.floor(cl / 4);
  for (let w = 0; w < waves; w++) {
    const side = rng.int(0, 3);
    let pts = budget / waves;
    const tick = w * 180 + 10;
    while (pts > 0) {
      const m = cl < 3 ? MONSTERS[0] : cl < 5 ? rng.pick(MONSTERS.slice(0, 2)) : rng.pick(MONSTERS);
      pts -= m.housing;
      const along = rng.range(4, MAP_SIZE - 4);
      const edge = rng.range(0.4, 1.4);
      const [x, y] = side === 0 ? [along, edge] : side === 1 ? [MAP_SIZE - edge, along] : side === 2 ? [along, MAP_SIZE - edge] : [edge, along];
      cmds.push({ tick: tick + rng.int(0, 25), t: 'deploy', unit: m.id, x, y });
    }
  }
  return cmds;
}

export function invasionSetup(s: GameState, seed: number): BattleSetup {
  const cl = citadelLevel(s);
  return {
    seed, mode: 'invasion', base: playerBase(s),
    attacker: { units: {}, unitLevels: {}, spells: {}, spellLevels: {}, heroes: [] },
    loot: {}, timeLimit: 150, waves: invasionWaves(cl, seed),
  };
}

export function invasionReward(s: GameState, destruction: number): Partial<Resources> {
  const cl = citadelLevel(s);
  const q = Math.max(0, 1 - destruction / 60);
  return { gold: Math.round(800 * cl * cl * q), wood: Math.round(800 * cl * cl * q), ...(cl >= 6 ? { energy: Math.round(40 * cl * cl * q) } : {}) };
}

/** Résultat d'une invasion : le joueur défend son propre village. */
export function applyInvasionResult(s: GameState, r: BattleResult, now: number) {
  const won = r.destruction < 50 && r.stars < 2;
  const reward = won ? gain(s, invasionReward(s, r.destruction)) : {};
  if (won) { s.player.stats.defensesWon++; s.player.stats.invasionsRepelled++; progressMission(s, 'invasion', 1); addPassXp(s, 120); }
  else s.player.stats.defensesLost++;
  s.events.lastInvasionAt = now;
  s.log.unshift({ at: now, attacker: 'Horde sauvage', stars: r.stars, destruction: r.destruction, lost: {}, trophies: 0, kind: 'invasion' });
  s.log = s.log.slice(0, 30);
  return { won, reward };
}
