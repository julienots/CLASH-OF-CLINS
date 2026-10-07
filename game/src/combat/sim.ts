// Simulation de combat déterministe (pas fixe de 0,1 s).
// Utilisée pour les raids, la campagne, les guerres, les invasions et la
// vérification serveur (rejouer la liste de commandes donne le même résultat).

import { Rng } from '../core/rng';
import { MAP_SIZE } from '../core/state';
import type { Resources, ResKey } from '../core/types';
import { RES_KEYS } from '../core/types';
import { bdef, blevel, type DefenseStats, type TrapStats } from '../buildings/defs';
import { UNITS, unitStats, type UnitDef } from '../units/defs';
import { HEROES, hdef } from '../heroes/defs';
import { sdef, spellPower } from '../spells/defs';
import type { Mods } from '../research/tech';
import { NavGrid } from './nav';

export const TICK = 0.1;
export const TICKS_PER_SEC = 10;

export interface BaseBuilding { uid: number; type: string; level: number; x: number; y: number }
export interface HeroLoadout { id: string; level: number; hp: number; dps: number }

export type BattleMode = 'raid' | 'campaign' | 'war' | 'invasion' | 'revenge';

export interface BattleSetup {
  seed: number;
  mode: BattleMode;
  base: {
    buildings: BaseBuilding[];
    defMods?: Partial<Mods>;
    heroes?: HeroLoadout[];
    guildTroops?: Record<string, number>;
  };
  attacker: {
    units: Record<string, number>;
    unitLevels: Record<string, number>;
    spells: Record<string, number>;
    spellLevels: Record<string, number>;
    heroes: HeroLoadout[];
    mods?: Partial<Mods>;
  };
  loot: Record<number, Partial<Resources>>;
  timeLimit: number;
  revealTraps?: number;
  /** Déploiements programmés (invasions de monstres) */
  waves?: Command[];
}

export type Command =
  | { tick: number; t: 'deploy'; unit: string; x: number; y: number }
  | { tick: number; t: 'hero'; hero: string; x: number; y: number }
  | { tick: number; t: 'spell'; spell: string; x: number; y: number }
  | { tick: number; t: 'ability'; hero: string }
  | { tick: number; t: 'ultimate'; hero: string; x: number; y: number }
  | { tick: number; t: 'royal'; x: number; y: number }
  | { tick: number; t: 'surrender' };

export type SimEvent =
  | { e: 'shot'; from: number; fx: number; fy: number; tx: number; ty: number; kind: string; dur: number }
  | { e: 'hit'; x: number; y: number; kind: string; r: number }
  | { e: 'destroy'; uid: number; x: number; y: number; size: number }
  | { e: 'death'; x: number; y: number; type: string; team: Team }
  | { e: 'trap'; x: number; y: number; type: string; r: number }
  | { e: 'spell'; spell: string; x: number; y: number; r: number }
  | { e: 'deploy'; x: number; y: number; type: string }
  | { e: 'ability'; hero: string; name: string; x: number; y: number }
  | { e: 'heal'; x: number; y: number }
  | { e: 'loot'; x: number; y: number; res: ResKey; amount: number }
  | { e: 'star'; stars: number }
  | { e: 'swing'; x: number; y: number; tx: number; ty: number; type: string };

export type Team = 'att' | 'def';

export interface SUnit {
  id: number; type: string; team: Team; def: UnitDef | null; hero?: string;
  x: number; y: number; px: number; py: number;
  hp: number; maxHp: number; dps: number; atkInt: number; cd: number; range: number; speed: number;
  flying: boolean; splash: number; heals: number; jumps: boolean; suicide: boolean; firstStrike: number; firstDone: boolean;
  pref: string; housing: number;
  target: { k: 'b'; i: number } | { k: 'u'; id: number } | null;
  wallTarget: number; // index bâtiment mur en cours de démolition (-1)
  retargetAt: number;
  rageUntil: number; frozenUntil: number; slowUntil: number; slowMult: number; invisUntil: number;
  shield: number; tauntUntil: number; dmgRedUntil: number; dmgRed: number;
  alive: boolean; facing: number; lastAttack: number; dmgDealt: number;
  homeX: number; homeY: number; ultCharge: number; abilityUsed: boolean;
}

export interface SBuilding {
  uid: number; type: string; level: number; x: number; y: number; size: number; cx: number; cy: number;
  hp: number; maxHp: number; alive: boolean; cat: string;
  isDef: boolean; isWall: boolean; isRes: boolean; isCitadel: boolean; counts: boolean;
  def?: DefenseStats; cd: number; target: number; rampT: number;
  frozenUntil: number; stunnedUntil: number;
  loot: Partial<Resources>; lootTaken: Partial<Resources>;
  lastShot: number; aimX: number; aimY: number;
}

interface STrap { uid: number; type: string; x: number; y: number; size: number; stats: TrapStats; triggered: boolean; revealed: boolean; zoneUntil: number }
interface Projectile { from: number; tx: number; ty: number; targetUnit: number; hitAt: number; dmg: number; splash: number; air: boolean; ground: boolean; kind: string; wallMult: number }
interface Zone { spell: string; x: number; y: number; r: number; until: number; power: number }

const RESOURCE_TYPES = new Set(['gold_mine', 'sawmill', 'farm', 'quarry', 'generator', 'gold_vault', 'wood_depot', 'energy_cell', 'crystal_vault', 'citadel']);

export class BattleSim {
  readonly setup: BattleSetup;
  rng: Rng;
  tick = 0;
  ended = false;
  endReason = '';
  units: SUnit[] = [];
  buildings: SBuilding[] = [];
  traps: STrap[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  events: SimEvent[] = [];
  log: Command[] = [];
  nav: NavGrid;
  remaining: Record<string, number>;
  spellsLeft: Record<string, number>;
  heroesLeft: Record<string, HeroLoadout>;
  spellReadyAt: Record<string, number> = {};
  royalReadyAt = 0;
  stars = 0;
  destruction = 0;
  lootGained: Resources = { gold: 0, wood: 0, energy: 0, crystals: 0 };
  usedUnits: Record<string, number> = {};
  usedSpells: Record<string, number> = {};
  deployed = false;
  private nextUnitId = 1;
  private countable = 0;
  private destroyedCount = 0;
  private citadelDown = false;
  private forbidden: Uint8Array;
  private attMods: Partial<Mods>;
  private defMods: Partial<Mods>;
  private unitMap = new Map<number, SUnit>();
  private guildReleased = false;

  constructor(setup: BattleSetup) {
    this.setup = setup;
    this.rng = new Rng(setup.seed);
    this.attMods = setup.attacker.mods ?? {};
    this.defMods = setup.base.defMods ?? {};
    this.remaining = { ...setup.attacker.units };
    this.spellsLeft = { ...setup.attacker.spells };
    this.heroesLeft = Object.fromEntries(setup.attacker.heroes.map(h => [h.id, h]));
    const reveal = (setup.revealTraps ?? 0) / 100;
    for (const b of setup.base.buildings) {
      const d = bdef(b.type);
      if (d.category === 'decoration' || b.level < 1) continue;
      const L = blevel(b.type, b.level);
      if (d.category === 'trap') {
        this.traps.push({ uid: b.uid, type: b.type, x: b.x + d.size / 2, y: b.y + d.size / 2, size: d.size, stats: { ...L.trap!, damage: L.trap!.damage * (1 + (this.defMods.trapDmg ?? 0)) }, triggered: false, revealed: this.rng.chance(reveal), zoneUntil: 0 });
        continue;
      }
      const isWall = d.category === 'wall';
      const isDef = d.category === 'defense';
      let hp = L.hp;
      if (isWall) hp *= 1 + (this.defMods.wallHp ?? 0);
      if (isDef) hp *= 1 + (this.defMods.defHp ?? 0);
      const sb: SBuilding = {
        uid: b.uid, type: b.type, level: b.level, x: b.x, y: b.y, size: d.size, cx: b.x + d.size / 2, cy: b.y + d.size / 2,
        hp, maxHp: hp, alive: true, cat: d.category, isDef, isWall, isRes: RESOURCE_TYPES.has(b.type), isCitadel: b.type === 'citadel',
        counts: !isWall, cd: 0, target: -1, rampT: 0, frozenUntil: 0, stunnedUntil: 0,
        loot: setup.loot[b.uid] ?? {}, lootTaken: {}, lastShot: -99, aimX: 0, aimY: 1,
      };
      if (L.defense) {
        sb.def = { ...L.defense, damage: L.defense.damage * (1 + (this.defMods.defDmg ?? 0)), range: L.defense.range + (this.defMods.defRange ?? 0) };
        sb.cd = this.rng.range(0, L.defense.interval);
      }
      this.buildings.push(sb);
      if (sb.counts) this.countable++;
    }
    this.nav = new NavGrid(this.buildings);
    this.forbidden = new Uint8Array(MAP_SIZE * MAP_SIZE);
    for (const b of this.buildings) this.markForbidden(b.x, b.y, b.size);
    for (const t of this.traps) this.markForbidden(Math.floor(t.x - t.size / 2), Math.floor(t.y - t.size / 2), t.size);
    // Héros défenseurs
    const temple = this.buildings.find(b => b.type === 'temple');
    for (const h of setup.base.heroes ?? []) {
      const u = this.spawnHero(h, 'def', (temple?.cx ?? MAP_SIZE / 2) + this.rng.range(-1.5, 1.5), (temple?.cy ?? MAP_SIZE / 2) + this.rng.range(-1.5, 1.5) + (temple ? temple.size / 2 + 0.6 : 0));
      u.homeX = u.x; u.homeY = u.y;
    }
  }

  private markForbidden(x: number, y: number, size: number) {
    for (let yy = y - 1; yy <= y + size; yy++) for (let xx = x - 1; xx <= x + size; xx++) {
      if (xx >= 0 && yy >= 0 && xx < MAP_SIZE && yy < MAP_SIZE) this.forbidden[yy * MAP_SIZE + xx] = 1;
    }
  }

  canDeployAt(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return false;
    return !this.forbidden[Math.floor(y) * MAP_SIZE + Math.floor(x)];
  }
  forbiddenMask(): Uint8Array { return this.forbidden; }

  get time(): number { return this.tick * TICK; }
  get timeLeft(): number { return Math.max(0, this.setup.timeLimit - this.time); }

  // ─────────────────────────── Commandes ───────────────────────────
  /** Applique une commande joueur. Retourne false si invalide (ignorée). */
  command(c: Command): boolean {
    if (this.ended) return false;
    const cmd = { ...c, tick: this.tick } as Command;
    const okk = this.apply(cmd);
    if (okk) this.log.push(cmd);
    return okk;
  }

  private apply(c: Command): boolean {
    switch (c.t) {
      case 'deploy': {
        if (!(this.remaining[c.unit] > 0) || !this.canDeployAt(c.x, c.y)) return false;
        this.remaining[c.unit]--;
        this.usedUnits[c.unit] = (this.usedUnits[c.unit] ?? 0) + 1;
        this.spawnUnit(c.unit, 'att', c.x, c.y, this.setup.attacker.unitLevels[c.unit] ?? 1);
        this.deployed = true;
        this.events.push({ e: 'deploy', x: c.x, y: c.y, type: c.unit });
        return true;
      }
      case 'hero': {
        const h = this.heroesLeft[c.hero];
        if (!h || !this.canDeployAt(c.x, c.y)) return false;
        delete this.heroesLeft[c.hero];
        this.spawnHero(h, 'att', c.x, c.y);
        this.deployed = true;
        this.events.push({ e: 'deploy', x: c.x, y: c.y, type: c.hero });
        return true;
      }
      case 'spell': {
        if (!(this.spellsLeft[c.spell] > 0)) return false;
        if ((this.spellReadyAt[c.spell] ?? 0) > this.tick) return false;
        if (c.x < 0 || c.y < 0 || c.x >= MAP_SIZE || c.y >= MAP_SIZE) return false;
        this.spellsLeft[c.spell]--;
        this.usedSpells[c.spell] = (this.usedSpells[c.spell] ?? 0) + 1;
        const sd = sdef(c.spell);
        this.spellReadyAt[c.spell] = this.tick + Math.round(sd.cooldown * (1 - (this.attMods.spellCooldown ?? 0)) * TICKS_PER_SEC);
        this.castSpell(c.spell, c.x, c.y, this.setup.attacker.spellLevels[c.spell] ?? 1);
        return true;
      }
      case 'ability': {
        const u = this.units.find(u => u.hero === c.hero && u.team === 'att' && u.alive);
        if (!u || u.abilityUsed) return false;
        u.abilityUsed = true;
        this.heroAbility(u);
        return true;
      }
      case 'ultimate': {
        const u = this.units.find(u => u.hero === c.hero && u.team === 'att' && u.alive);
        if (!u || u.ultCharge < 1) return false;
        this.heroUltimate(u, c.x, c.y);
        u.ultCharge = 0; // l'ultime ne se recharge pas sur ses propres dégâts
        return true;
      }
      case 'royal': {
        if (this.setup.mode !== 'invasion' || this.royalReadyAt > this.tick) return false;
        this.royalReadyAt = this.tick + 6 * TICKS_PER_SEC;
        this.events.push({ e: 'spell', spell: 'lightning', x: c.x, y: c.y, r: 2.5 });
        for (const u of this.units) if (u.alive && u.team === 'att' && (u.x - c.x) ** 2 + (u.y - c.y) ** 2 <= 2.5 * 2.5) this.damageUnit(u, 250, null);
        return true;
      }
      case 'surrender':
        this.finish('Abandon');
        return true;
    }
  }

  // ─────────────────────────── Création ───────────────────────────
  spawnUnit(type: string, team: Team, x: number, y: number, level: number): SUnit {
    const d = UNITS[type];
    const mods = team === 'att' ? this.attMods : {};
    const st = unitStats(type, level, { hp: mods.unitHp, dmg: mods.unitDmg, speed: mods.unitSpeed });
    const u: SUnit = {
      id: this.nextUnitId++, type, team, def: d, x, y, px: x, py: y,
      hp: st.hp, maxHp: st.hp, dps: st.dps, atkInt: d.attackInterval, cd: 0, range: d.range, speed: st.speed,
      flying: !!d.flying, splash: d.splash ?? 0, heals: st.heals, jumps: !!d.jumpsWalls, suicide: !!d.suicide,
      firstStrike: d.firstStrike ?? 1, firstDone: false, pref: d.target, housing: d.housing,
      target: null, wallTarget: -1, retargetAt: 0,
      rageUntil: 0, frozenUntil: 0, slowUntil: 0, slowMult: 1, invisUntil: 0, shield: 0, tauntUntil: 0, dmgRedUntil: 0, dmgRed: 0,
      alive: true, facing: 0, lastAttack: -99, dmgDealt: 0, homeX: x, homeY: y, ultCharge: 0, abilityUsed: false,
    };
    this.units.push(u);
    this.unitMap.set(u.id, u);
    return u;
  }

  private spawnHero(h: HeroLoadout, team: Team, x: number, y: number): SUnit {
    const d = hdef(h.id);
    const mods = team === 'att' ? this.attMods : {};
    const u: SUnit = {
      id: this.nextUnitId++, type: h.id, team, def: null, hero: h.id, x, y, px: x, py: y,
      hp: h.hp, maxHp: h.hp, dps: h.dps * (1 + (mods.heroDmg ?? 0)), atkInt: d.attackInterval, cd: 0, range: d.range, speed: d.speed,
      flying: false, splash: d.splash ?? 0, heals: 0, jumps: false, suicide: false, firstStrike: 1, firstDone: true,
      pref: d.target, housing: 0, target: null, wallTarget: -1, retargetAt: 0,
      rageUntil: 0, frozenUntil: 0, slowUntil: 0, slowMult: 1, invisUntil: 0, shield: 0, tauntUntil: 0, dmgRedUntil: 0, dmgRed: 0,
      alive: true, facing: 0, lastAttack: -99, dmgDealt: 0, homeX: x, homeY: y, ultCharge: 0, abilityUsed: false,
    };
    this.units.push(u);
    this.unitMap.set(u.id, u);
    return u;
  }

  // ─────────────────────────── Boucle ───────────────────────────
  step(): SimEvent[] {
    this.events = [];
    if (this.ended) return this.events;
    if (this.setup.waves) for (const w of this.setup.waves) if (w.tick === this.tick && w.t === 'deploy') {
      this.spawnUnit(w.unit, 'att', w.x, w.y, 1);
      this.usedUnits[w.unit] = (this.usedUnits[w.unit] ?? 0) + 1;
      this.deployed = true;
      this.events.push({ e: 'deploy', x: w.x, y: w.y, type: w.unit });
    }
    const t = this.tick;
    this.nav.now = t;
    for (const u of this.units) { u.px = u.x; u.py = u.y; }
    this.updateZones(t);
    this.updateTraps(t);
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.alive) this.updateUnit(u, t);
    }
    this.separate();
    for (const b of this.buildings) if (b.alive && b.def) this.updateDefense(b, t);
    this.updateProjectiles(t);
    this.releaseGuildTroops();
    // nettoyage périodique des unités mortes
    if (t % 50 === 0) {
      this.units = this.units.filter(u => u.alive || u.hero);
      for (const [id, u] of this.unitMap) if (!u.alive && !u.hero) this.unitMap.delete(id);
    }
    this.tick++;
    this.checkEnd();
    return this.events;
  }

  /** Simule jusqu'à la fin en appliquant une liste de commandes horodatées. */
  runWithCommands(cmds: Command[], maxTicks = 100000): void {
    const sorted = [...cmds].sort((a, b) => a.tick - b.tick);
    let i = 0;
    while (!this.ended && this.tick < maxTicks) {
      while (i < sorted.length && sorted[i].tick <= this.tick) {
        const c = sorted[i++];
        if (this.apply({ ...c, tick: this.tick } as Command)) this.log.push({ ...c, tick: this.tick } as Command);
      }
      this.step();
    }
  }

  private checkEnd() {
    if (this.ended) return;
    if (this.time >= this.setup.timeLimit) return this.finish('Temps écoulé');
    if (this.destroyedCount >= this.countable && this.countable > 0) return this.finish('Destruction totale');
    if (this.deployed) {
      const attAlive = this.units.some(u => u.alive && u.team === 'att');
      const reserve = Object.values(this.remaining).some(n => n > 0) || Object.keys(this.heroesLeft).length > 0;
      const wavesLeft = this.setup.waves?.some(w => w.tick >= this.tick) ?? false;
      if (!attAlive && !wavesLeft && (!reserve || this.setup.mode === 'invasion')) this.finish('Armée vaincue');
    }
  }

  finish(reason: string) {
    if (this.ended) return;
    this.ended = true;
    this.endReason = reason;
  }

  // ─────────────────────────── Unités ───────────────────────────
  private isActive(u: SUnit, t: number) { return u.alive && u.frozenUntil <= t; }

  private updateUnit(u: SUnit, t: number) {
    if (u.frozenUntil > t) return;
    const rage = u.rageUntil > t ? 1 + this.rageBonus() : 1;
    // Soigneuse
    if (u.heals > 0) return this.updateHealer(u, t, rage);
    u.cd -= TICK * (u.rageUntil > t ? 1.4 : 1);

    // 1) Combat contre unités ennemies proches (défenseurs, héros, monstres)
    const enemy = this.findEnemyUnit(u, t);
    if (enemy) {
      u.target = { k: 'u', id: enemy.id };
      const d = Math.hypot(enemy.x - u.x, enemy.y - u.y);
      if (d <= u.range + 0.35) this.attackUnit(u, enemy, t, rage);
      else this.moveToward(u, enemy.x, enemy.y, t, rage);
      return;
    }
    if (u.target?.k === 'u') u.target = null;
    // Défenseur sans ennemi : revenir au poste
    if (u.team === 'def') {
      if (Math.hypot(u.homeX - u.x, u.homeY - u.y) > 0.5) this.moveToward(u, u.homeX, u.homeY, t, 1);
      return;
    }

    // 2) Mur en cours de démolition
    if (u.wallTarget >= 0) {
      const w = this.buildings[u.wallTarget];
      if (w.alive && this.inRangeOfBuilding(u, w)) { this.attackBuilding(u, w, t, rage); return; }
      u.wallTarget = -1;
    }
    // 3) Cible bâtiment
    let tb = u.target?.k === 'b' ? this.buildings[u.target.i] : null;
    if (!tb || !tb.alive || t >= u.retargetAt) {
      const ni = this.chooseBuildingTarget(u);
      if (ni < 0) { u.target = null; return; }
      if (!tb || !tb.alive || ni !== u.target?.i) u.target = { k: 'b', i: ni };
      tb = this.buildings[ni];
      u.retargetAt = t + (tb.isWall ? 20 : 1e9);
    }
    if (this.inRangeOfBuilding(u, tb)) { this.attackBuilding(u, tb, t, rage); return; }
    // 4) Déplacement
    if (u.flying) { this.moveToward(u, tb.cx, tb.cy, t, rage); return; }
    const step = this.nav.nextStep(u.x, u.y, this.buildings.indexOf(tb), tb, u.jumps);
    if (step.wall >= 0 && !u.jumps) {
      const w = this.buildings[step.wall];
      if (this.inRangeOfBuilding(u, w)) { u.wallTarget = step.wall; this.attackBuilding(u, w, t, rage); return; }
    }
    this.moveToward(u, step.x, step.y, t, rage);
  }

  private rageBonus() { return 0.4; }

  private updateHealer(u: SUnit, t: number, rage: number) {
    // suit l'allié terrestre le plus blessé, sinon le plus proche
    let best: SUnit | null = null, bestScore = Infinity;
    for (const o of this.units) {
      if (!o.alive || o.team !== u.team || o.flying || o === u) continue;
      const d = Math.hypot(o.x - u.x, o.y - u.y);
      const score = d - (1 - o.hp / o.maxHp) * 20;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    if (!best) return;
    const d = Math.hypot(best.x - u.x, best.y - u.y);
    if (d > u.range * 0.6) this.moveToward(u, best.x, best.y, t, rage);
    u.cd -= TICK;
    if (u.cd <= 0) {
      u.cd = u.atkInt;
      let healed = false;
      for (const o of this.units) {
        if (!o.alive || o.team !== u.team || o.flying || o.hp >= o.maxHp) continue;
        if ((o.x - best.x) ** 2 + (o.y - best.y) ** 2 <= 2.2 * 2.2) { o.hp = Math.min(o.maxHp, o.hp + u.heals * u.atkInt); healed = true; }
      }
      if (healed) { u.lastAttack = t; this.events.push({ e: 'heal', x: best.x, y: best.y }); }
    }
  }

  private findEnemyUnit(u: SUnit, t: number): SUnit | null {
    // les unités ciblant exclusivement les défenses / murs / citadelle ignorent les unités (sauf défenseurs)
    const aggro = u.team === 'def' ? 7 : (u.pref === 'any' || u.hero ? 4 : 0);
    if (aggro <= 0) return null;
    let best: SUnit | null = null, bd = aggro * aggro;
    const ox = u.team === 'def' ? u.homeX : u.x, oy = u.team === 'def' ? u.homeY : u.y;
    for (const o of this.units) {
      if (!o.alive || o.team === u.team || o.invisUntil > t) continue;
      if (o.flying && u.range < 2 && !u.hero) continue; // le corps-à-corps ne touche pas les volants
      const d = (o.x - ox) ** 2 + (o.y - oy) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  private chooseBuildingTarget(u: SUnit): number {
    const pref = u.pref;
    const pick = (filter: (b: SBuilding) => boolean): number => {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i];
        if (!b.alive || !filter(b)) continue;
        const d = rectDist(u.x, u.y, b);
        if (d < bd) { bd = d; bi = i; }
      }
      return bi;
    };
    const nonWall = (b: SBuilding) => !b.isWall;
    if (pref === 'defense') { const i = pick(b => b.isDef); if (i >= 0) return i; }
    if (pref === 'resource') { const i = pick(b => b.isRes); if (i >= 0) return i; }
    if (pref === 'citadel') { const i = pick(b => b.isCitadel); if (i >= 0) return i; }
    if (pref === 'wall') {
      const main = pick(nonWall);
      if (main >= 0) {
        const w = this.nav.firstWallOnPath(u.x, u.y, main, this.buildings[main]);
        if (w >= 0) return w;
      }
      const nearWall = pick(b => b.isWall && rectDist(u.x, u.y, b) < 5);
      if (nearWall >= 0) return nearWall;
      return main;
    }
    return pick(nonWall);
  }

  private inRangeOfBuilding(u: SUnit, b: SBuilding): boolean {
    return rectDist(u.x, u.y, b) <= u.range + 0.15;
  }

  private moveToward(u: SUnit, tx: number, ty: number, t: number, rage: number) {
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    let sp = u.speed * TICK * rage;
    if (u.slowUntil > t) sp *= u.slowMult;
    const k = Math.min(1, sp / d);
    u.x += dx * k; u.y += dy * k;
    u.facing = Math.atan2(dy, dx);
    // jamais hors carte
    u.x = Math.max(0.1, Math.min(MAP_SIZE - 0.1, u.x));
    u.y = Math.max(0.1, Math.min(MAP_SIZE - 0.1, u.y));
  }

  private attackBuilding(u: SUnit, b: SBuilding, t: number, rage: number) {
    u.facing = Math.atan2(b.cy - u.y, b.cx - u.x);
    if (u.cd > 0) return;
    u.cd = u.atkInt;
    u.lastAttack = t;
    let dmg = u.dps * u.atkInt * (rage > 1 ? 1 + this.ragePower() : 1);
    if (!u.firstDone) { dmg *= u.firstStrike; u.firstDone = true; }
    const bonus = u.def?.bonusVs;
    if (bonus) {
      if (bonus.kind === 'wall' && b.isWall) dmg *= bonus.mult;
      if (bonus.kind === 'resource' && b.isRes) dmg *= bonus.mult;
      if (bonus.kind === 'defense' && b.isDef) dmg *= bonus.mult;
    }
    if (u.range >= 2 || u.flying) {
      const speed = u.flying ? 6 : 10;
      const travel = Math.hypot(b.cx - u.x, b.cy - u.y) / speed;
      this.projectiles.push({ from: -u.id, tx: b.cx, ty: b.cy, targetUnit: -1 - this.buildings.indexOf(b), hitAt: t + Math.max(1, Math.round(travel * TICKS_PER_SEC)), dmg, splash: u.splash, air: false, ground: false, kind: 'u:' + u.type, wallMult: 1 });
      this.events.push({ e: 'shot', from: -u.id, fx: u.x, fy: u.y, tx: b.cx, ty: b.cy, kind: u.type, dur: travel });
    } else {
      this.events.push({ e: 'swing', x: u.x, y: u.y, tx: b.cx, ty: b.cy, type: u.type });
      if (u.splash > 0 && u.suicide) {
        // charge explosive : dégâts de zone sur les bâtiments
        this.events.push({ e: 'hit', x: u.x, y: u.y, kind: 'explosion', r: u.splash });
        for (const o of this.buildings) if (o.alive && rectDist(u.x, u.y, o) <= u.splash) this.damageBuilding(o, o.isWall ? dmg : dmg / (bonus?.mult ?? 1), u);
      } else this.damageBuilding(b, dmg, u);
    }
    if (u.suicide) this.killUnit(u);
  }

  private ragePower() { return 0.8; }

  private attackUnit(u: SUnit, o: SUnit, t: number, rage: number) {
    u.facing = Math.atan2(o.y - u.y, o.x - u.x);
    if (u.cd > 0) return;
    u.cd = u.atkInt;
    u.lastAttack = t;
    const dmg = u.dps * u.atkInt * (rage > 1 ? 1 + this.ragePower() : 1);
    if (u.range >= 2) this.events.push({ e: 'shot', from: -u.id, fx: u.x, fy: u.y, tx: o.x, ty: o.y, kind: u.type, dur: 0.15 });
    else this.events.push({ e: 'swing', x: u.x, y: u.y, tx: o.x, ty: o.y, type: u.type });
    if (u.splash > 0) {
      for (const p of this.units) if (p.alive && p.team !== u.team && (p.x - o.x) ** 2 + (p.y - o.y) ** 2 <= u.splash * u.splash) this.damageUnit(p, dmg, u);
    } else this.damageUnit(o, dmg, u);
    if (u.suicide) this.killUnit(u);
  }

  damageUnit(o: SUnit, dmg: number, src: SUnit | null) {
    if (!o.alive) return;
    if (o.dmgRedUntil > this.tick) dmg *= 1 - o.dmgRed;
    if (o.shield > 0) { const a = Math.min(o.shield, dmg); o.shield -= a; dmg -= a; }
    o.hp -= dmg;
    if (src) this.chargeUlt(src, dmg);
    if (o.hp <= 0) this.killUnit(o);
  }

  private chargeUlt(src: SUnit, dmg: number) {
    src.dmgDealt += dmg;
    if (src.hero && src.ultCharge < 1) src.ultCharge = Math.min(1, src.ultCharge + dmg / (src.dps * 30));
  }

  killUnit(u: SUnit) {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    this.events.push({ e: 'death', x: u.x, y: u.y, type: u.type, team: u.team });
    const ds = u.def?.deathSpawn;
    if (ds) for (let i = 0; i < ds.count; i++) {
      const s = this.spawnUnit(ds.unit, u.team, u.x + this.rng.range(-0.6, 0.6), u.y + this.rng.range(-0.6, 0.6), 1);
      s.maxHp = s.hp = s.hp * (u.maxHp / (UNITS[u.type]?.hp ?? u.maxHp)) / 7;
    }
  }

  damageBuilding(b: SBuilding, dmg: number, src: SUnit | null) {
    if (!b.alive || dmg <= 0) return;
    const before = b.hp;
    b.hp = Math.max(0, b.hp - dmg);
    if (src) this.chargeUlt(src, Math.min(before, dmg));
    // butin libéré proportionnellement aux dégâts
    if (b.loot) {
      const frac = (before - b.hp) / b.maxHp;
      for (const k of RES_KEYS) {
        const total = b.loot[k] ?? 0;
        if (!total) continue;
        const already = b.lootTaken[k] ?? 0;
        const target = b.hp <= 0 ? total : Math.min(total, already + total * frac);
        const gainNow = Math.floor(target) - Math.floor(already);
        b.lootTaken[k] = target;
        if (gainNow > 0) {
          this.lootGained[k] += gainNow;
          if (this.tick % 3 === 0 || b.hp <= 0) this.events.push({ e: 'loot', x: b.cx, y: b.cy, res: k, amount: gainNow });
        }
      }
    }
    if (b.hp <= 0) this.destroyBuilding(b);
  }

  private destroyBuilding(b: SBuilding) {
    b.alive = false;
    this.events.push({ e: 'destroy', uid: b.uid, x: b.cx, y: b.cy, size: b.size });
    this.nav.onDestroyed(b);
    if (b.counts) {
      this.destroyedCount++;
      this.destruction = Math.floor((this.destroyedCount / this.countable) * 100);
    }
    if (b.isCitadel) this.citadelDown = true;
    const stars = (this.destruction >= 50 ? 1 : 0) + (this.citadelDown ? 1 : 0) + (this.destruction >= 100 ? 1 : 0);
    if (stars > this.stars) { this.stars = stars; this.events.push({ e: 'star', stars }); }
  }

  /** Séparation légère entre unités terrestres pour éviter l'empilement. */
  private separate() {
    const cell = new Map<number, SUnit[]>();
    for (const u of this.units) {
      if (!u.alive || u.flying) continue;
      const k = Math.floor(u.x) * 64 + Math.floor(u.y);
      let a = cell.get(k); if (!a) cell.set(k, (a = [])); a.push(u);
    }
    for (const u of this.units) {
      if (!u.alive || u.flying) continue;
      const cx = Math.floor(u.x), cy = Math.floor(u.y);
      let px = 0, py = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const a = cell.get((cx + dx) * 64 + cy + dy); if (!a) continue;
        for (const o of a) {
          if (o === u) continue;
          const ddx = u.x - o.x, ddy = u.y - o.y;
          const d2 = ddx * ddx + ddy * ddy;
          const minD = 0.32;
          if (d2 < minD * minD && d2 > 1e-6) { const d = Math.sqrt(d2); px += (ddx / d) * (minD - d) * 0.5; py += (ddy / d) * (minD - d) * 0.5; }
          else if (d2 <= 1e-6) { px += ((u.id % 7) - 3) * 0.01; py += ((u.id % 5) - 2) * 0.01; }
        }
      }
      if (px || py) {
        const nx = u.x + px, ny = u.y + py;
        if (this.nav.walkable(nx, ny) || !this.nav.walkable(u.x, u.y)) { u.x = nx; u.y = ny; }
      }
    }
  }

  // ─────────────────────────── Défenses ───────────────────────────
  private updateDefense(b: SBuilding, t: number) {
    const d = b.def!;
    if (b.frozenUntil > t || b.stunnedUntil > t) return;
    b.cd -= TICK;
    // validation / sélection de cible
    let tgt = b.target >= 0 ? this.unitMap.get(b.target) : undefined;
    if (!tgt || !this.validDefTarget(b, tgt, t)) {
      tgt = this.pickDefTarget(b, t);
      b.target = tgt ? tgt.id : -1;
      b.rampT = 0;
    }
    if (!tgt) return;
    b.aimX = tgt.x - b.cx; b.aimY = tgt.y - b.cy;
    if (d.ramp) b.rampT += TICK;
    if (b.cd > 0) return;
    b.cd = d.interval;
    b.lastShot = t;
    let dmg = d.damage;
    if (d.ramp) dmg *= 1 + Math.min(d.ramp - 1, (b.rampT / 4) * (d.ramp - 1));
    const targets: SUnit[] = [tgt];
    if (d.multi && d.multi > 1) {
      for (const o of this.units) {
        if (targets.length >= d.multi) break;
        if (o !== tgt && this.validDefTarget(b, o, t)) targets.push(o);
      }
    }
    for (const tg of targets) {
      if (d.projSpeed <= 0) {
        this.events.push({ e: 'shot', from: b.uid, fx: b.cx, fy: b.cy - 0.8, tx: tg.x, ty: tg.y, kind: d.projectile, dur: d.ramp ? TICK * 1.5 : 0.2 });
        this.damageUnit(tg, dmg, null);
        if (d.chain) this.chain(b, tg, dmg, d.chain, t);
      } else {
        const dist = Math.hypot(tg.x - b.cx, tg.y - b.cy);
        const travel = dist / d.projSpeed;
        this.projectiles.push({ from: b.uid, tx: tg.x, ty: tg.y, targetUnit: d.splash ? 0 : tg.id, hitAt: t + Math.max(1, Math.round(travel * TICKS_PER_SEC)), dmg, splash: d.splash ?? 0, air: d.targets !== 'ground', ground: d.targets !== 'air', kind: d.projectile, wallMult: 1 });
        this.events.push({ e: 'shot', from: b.uid, fx: b.cx, fy: b.cy - 0.8, tx: tg.x, ty: tg.y, kind: d.projectile, dur: travel });
      }
    }
  }

  private chain(b: SBuilding, first: SUnit, dmg: number, n: number, t: number) {
    const hit = new Set([first.id]);
    let cur = first;
    for (let i = 0; i < n; i++) {
      dmg *= 0.7;
      let nb: SUnit | null = null, bd = 3 * 3;
      for (const o of this.units) {
        if (!o.alive || hit.has(o.id) || o.team === 'def' || o.invisUntil > t) continue;
        const dd = (o.x - cur.x) ** 2 + (o.y - cur.y) ** 2;
        if (dd < bd) { bd = dd; nb = o; }
      }
      if (!nb) break;
      this.events.push({ e: 'shot', from: b.uid, fx: cur.x, fy: cur.y, tx: nb.x, ty: nb.y, kind: 'arcane', dur: 0.2 });
      this.damageUnit(nb, dmg, null);
      hit.add(nb.id);
      cur = nb;
    }
  }

  private validDefTarget(b: SBuilding, u: SUnit, t: number): boolean {
    if (!u.alive || u.team !== 'att' || u.invisUntil > t) return false;
    const d = b.def!;
    if (d.targets === 'ground' && u.flying) return false;
    if (d.targets === 'air' && !u.flying) return false;
    const dist = Math.hypot(u.x - b.cx, u.y - b.cy) - 0.2;
    if (dist > d.range + b.size / 2) return false;
    if (d.minRange && dist < d.minRange) return false;
    return true;
  }

  private pickDefTarget(b: SBuilding, t: number): SUnit | undefined {
    const d = b.def!;
    let best: SUnit | undefined, bs = Infinity;
    for (const u of this.units) {
      if (!this.validDefTarget(b, u, t)) continue;
      // provocation (Bronn)
      if (u.tauntUntil > t) return u;
      const dist = Math.hypot(u.x - b.cx, u.y - b.cy);
      let score = dist;
      if (d.priority === 'heroes' && u.hero) score -= 100;
      if (d.priority === 'strongest') score = -u.hp;
      if (d.priority === 'lowestHp') score = u.hp;
      if (score < bs) { bs = score; best = u; }
    }
    return best;
  }

  private updateProjectiles(t: number) {
    if (!this.projectiles.length) return;
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      if (p.hitAt > t) { keep.push(p); continue; }
      if (p.from < 0) {
        // projectile d'unité attaquante -> bâtiment (ou zone)
        const bi = -1 - p.targetUnit;
        const b = this.buildings[bi];
        const src = this.unitMap.get(-p.from) ?? null;
        if (p.splash > 0) {
          this.events.push({ e: 'hit', x: p.tx, y: p.ty, kind: p.kind, r: p.splash });
          for (const o of this.buildings) if (o.alive && rectDist(p.tx, p.ty, o) <= p.splash) this.damageBuilding(o, o === b ? p.dmg : p.dmg * 0.6, src);
        } else if (b?.alive) this.damageBuilding(b, p.dmg, src);
        continue;
      }
      if (p.targetUnit > 0) {
        const u = this.unitMap.get(p.targetUnit);
        if (u?.alive) this.damageUnit(u, p.dmg, null);
        this.events.push({ e: 'hit', x: u?.x ?? p.tx, y: u?.y ?? p.ty, kind: p.kind, r: 0.3 });
      } else {
        this.events.push({ e: 'hit', x: p.tx, y: p.ty, kind: p.kind, r: p.splash });
        for (const u of this.units) {
          if (!u.alive || u.team !== 'att') continue;
          if (u.flying ? !p.air : !p.ground) continue;
          if ((u.x - p.tx) ** 2 + (u.y - p.ty) ** 2 <= p.splash * p.splash) this.damageUnit(u, p.dmg, null);
        }
      }
    }
    this.projectiles = keep;
  }

  // ─────────────────────────── Pièges ───────────────────────────
  private updateTraps(t: number) {
    for (const tr of this.traps) {
      if (tr.triggered) {
        if (tr.zoneUntil > t && tr.stats.effect === 'slow') {
          for (const u of this.units) if (u.alive && u.team === 'att' && !u.flying && (u.x - tr.x) ** 2 + (u.y - tr.y) ** 2 <= tr.stats.radius ** 2) {
            u.slowUntil = t + 3; u.slowMult = 0.5;
            if (t % 10 === 0) this.damageUnit(u, tr.stats.damage, null);
          }
        }
        continue;
      }
      let trig = false;
      for (const u of this.units) {
        if (!u.alive || u.team !== 'att') continue;
        if (tr.stats.targets === 'ground' && u.flying) continue;
        if (tr.stats.targets === 'air' && !u.flying) continue;
        if ((u.x - tr.x) ** 2 + (u.y - tr.y) ** 2 <= tr.stats.trigger ** 2) { trig = true; break; }
      }
      if (!trig) continue;
      tr.triggered = true;
      this.events.push({ e: 'trap', x: tr.x, y: tr.y, type: tr.type, r: tr.stats.radius });
      const inR = this.units.filter(u => u.alive && u.team === 'att' && (tr.stats.targets === 'both' || (tr.stats.targets === 'air') === u.flying) && (u.x - tr.x) ** 2 + (u.y - tr.y) ** 2 <= tr.stats.radius ** 2);
      switch (tr.stats.effect) {
        case 'launch': {
          let cap = tr.stats.effectValue ?? 10;
          for (const u of inR) { if (u.hero || u.housing > cap) continue; cap -= u.housing; this.killUnit(u); }
          break;
        }
        case 'freeze':
          for (const u of inR) { u.frozenUntil = t + Math.round((tr.stats.effectValue ?? 3) * TICKS_PER_SEC); this.damageUnit(u, tr.stats.damage, null); }
          break;
        case 'slow':
          tr.zoneUntil = t + 6 * TICKS_PER_SEC;
          break;
        default:
          if (tr.stats.targets === 'air') { const u = inR[0] ?? this.units.find(u => u.alive && u.flying && u.team === 'att' && (u.x - tr.x) ** 2 + (u.y - tr.y) ** 2 <= tr.stats.trigger ** 2); if (u) this.damageUnit(u, tr.stats.damage, null); }
          else for (const u of inR) this.damageUnit(u, tr.stats.damage, null);
      }
    }
  }

  // ─────────────────────────── Sorts ───────────────────────────
  private castSpell(id: string, x: number, y: number, level: number) {
    const sd = sdef(id);
    const pw = spellPower(id, level) * (id === 'teleport' || id === 'freeze' || id === 'rage' ? 1 : 1 + (this.attMods.spellPower ?? 0));
    const t = this.tick;
    this.events.push({ e: 'spell', spell: id, x, y, r: sd.radius });
    switch (id) {
      case 'lightning':
        for (let i = 0; i < 3; i++) {
          const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(0, sd.radius * 0.6);
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          this.events.push({ e: 'hit', x: px, y: py, kind: 'lightning', r: 1 });
          for (const b of this.buildings) if (b.alive && rectDist(px, py, b) <= 1) this.damageBuilding(b, b.isWall ? pw * 0.3 : pw, null);
          for (const u of this.units) if (u.alive && u.team === 'def' && (u.x - px) ** 2 + (u.y - py) ** 2 <= 1.2) this.damageUnit(u, pw, null);
        }
        break;
      case 'meteor':
        for (const b of this.buildings) if (b.alive && rectDist(x, y, b) <= sd.radius) this.damageBuilding(b, b.isWall ? pw * 3 : pw, null);
        for (const u of this.units) if (u.alive && u.team === 'def' && (u.x - x) ** 2 + (u.y - y) ** 2 <= sd.radius ** 2) this.damageUnit(u, pw, null);
        break;
      case 'freeze': {
        const until = t + Math.round(pw * TICKS_PER_SEC);
        for (const b of this.buildings) if (b.alive && b.def && rectDist(x, y, b) <= sd.radius) b.frozenUntil = until;
        for (const u of this.units) if (u.alive && u.team === 'def' && (u.x - x) ** 2 + (u.y - y) ** 2 <= sd.radius ** 2) u.frozenUntil = until;
        break;
      }
      case 'shield':
        for (const u of this.units) if (u.alive && u.team === 'att' && (u.x - x) ** 2 + (u.y - y) ** 2 <= sd.radius ** 2) u.shield += pw;
        break;
      case 'teleport': {
        const own = this.units.filter(u => u.alive && u.team === 'att' && !u.hero)
          .sort((a, b) => ((b.x - x) ** 2 + (b.y - y) ** 2) - ((a.x - x) ** 2 + (a.y - y) ** 2) || a.id - b.id)
          .slice(0, Math.round(pw));
        for (const u of own) {
          u.x = u.px = x + this.rng.range(-sd.radius / 2, sd.radius / 2);
          u.y = u.py = y + this.rng.range(-sd.radius / 2, sd.radius / 2);
          u.target = null; u.wallTarget = -1;
        }
        break;
      }
      case 'heal':
      case 'rage':
        this.zones.push({ spell: id, x, y, r: sd.radius, until: t + Math.round(sd.duration * TICKS_PER_SEC), power: pw });
        break;
    }
  }

  private updateZones(t: number) {
    if (!this.zones.length) return;
    this.zones = this.zones.filter(z => z.until > t);
    for (const z of this.zones) {
      for (const u of this.units) {
        if (!u.alive || u.team !== 'att') continue;
        if ((u.x - z.x) ** 2 + (u.y - z.y) ** 2 > z.r * z.r) continue;
        if (z.spell === 'heal' && !u.flying) u.hp = Math.min(u.maxHp, u.hp + z.power * TICK * (u.hero ? 0.5 : 1));
        if (z.spell === 'rage') u.rageUntil = t + 10;
      }
    }
  }

  // ─────────────────────────── Héros ───────────────────────────
  private heroAbility(u: SUnit) {
    const m = 1 + (this.attMods.heroAbility ?? 0);
    const t = this.tick;
    const name = HEROES.find(h => h.id === u.hero)!.ability.name;
    this.events.push({ e: 'ability', hero: u.hero!, name, x: u.x, y: u.y });
    switch (u.hero) {
      case 'arkon':
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.35 * m);
        for (const o of this.units) if (o.alive && o.team === u.team && (o.x - u.x) ** 2 + (o.y - u.y) ** 2 <= 16) o.rageUntil = t + Math.round(8 * m * TICKS_PER_SEC);
        break;
      case 'lyra':
        u.invisUntil = t + Math.round(4 * m * TICKS_PER_SEC);
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.25 * m);
        break;
      case 'bronn':
        for (const o of this.units) if (o.alive && o.team === u.team && (o.x - u.x) ** 2 + (o.y - u.y) ** 2 <= 16) o.shield += u.maxHp * 0.3 * m;
        break;
      case 'nyx': {
        let best: SBuilding | null = null, bs = -1;
        for (const b of this.buildings) if (b.alive && b.def) { const s = b.def.damage / b.def.interval * b.hp; if (s > bs) { bs = s; best = b; } }
        if (best) {
          u.x = u.px = best.cx + best.size / 2 + 0.4; u.y = u.py = best.cy;
          this.damageBuilding(best, u.dps * 5 * m, u);
          this.events.push({ e: 'hit', x: best.cx, y: best.cy, kind: 'shadow', r: 1 });
          u.target = null;
        }
        break;
      }
    }
  }

  private heroUltimate(u: SUnit, x: number, y: number) {
    const m = 1 + (this.attMods.heroAbility ?? 0);
    const t = this.tick;
    const name = HEROES.find(h => h.id === u.hero)!.ultimate.name;
    this.events.push({ e: 'ability', hero: u.hero!, name, x: u.x, y: u.y });
    switch (u.hero) {
      case 'arkon':
        this.events.push({ e: 'hit', x: u.x, y: u.y, kind: 'quake', r: 3 });
        for (const b of this.buildings) if (b.alive && rectDist(u.x, u.y, b) <= 3) this.damageBuilding(b, u.dps * 8 * m, u);
        for (const b of this.buildings) if (b.alive && b.def && rectDist(u.x, u.y, b) <= 5) b.stunnedUntil = t + 30;
        for (const o of this.units) if (o.alive && o.team !== u.team && (o.x - u.x) ** 2 + (o.y - u.y) ** 2 <= 9) this.damageUnit(o, u.dps * 8 * m, u);
        break;
      case 'lyra': {
        const cx = Number.isFinite(x) ? x : u.x, cy = Number.isFinite(y) ? y : u.y;
        for (let i = 0; i < 12; i++) {
          const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(0, 2.5);
          const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          this.events.push({ e: 'hit', x: px, y: py, kind: 'star', r: 0.8 });
          for (const b of this.buildings) if (b.alive && rectDist(px, py, b) <= 0.8) this.damageBuilding(b, u.dps * 1.5 * m, u);
          for (const o of this.units) if (o.alive && o.team !== u.team && (o.x - px) ** 2 + (o.y - py) ** 2 <= 0.64) this.damageUnit(o, u.dps * 1.5 * m, u);
        }
        break;
      }
      case 'bronn':
        u.tauntUntil = t + Math.round(6 * m * TICKS_PER_SEC);
        u.dmgRedUntil = u.tauntUntil; u.dmgRed = 0.7;
        for (const b of this.buildings) if (b.alive && b.def && Math.hypot(b.cx - u.x, b.cy - u.y) <= 10) b.target = u.id;
        break;
      case 'nyx':
        for (const b of this.buildings) if (b.alive && b.def && Math.hypot(b.cx - u.x, b.cy - u.y) <= 8) b.stunnedUntil = t + Math.round(4 * m * TICKS_PER_SEC);
        this.events.push({ e: 'hit', x: u.x, y: u.y, kind: 'eclipse', r: 8 });
        break;
    }
  }

  // ─────────────────────────── Troupes de guilde en défense ───────────────────────────
  private releaseGuildTroops() {
    if (this.guildReleased || !this.setup.base.guildTroops) return;
    const portal = this.buildings.find(b => b.type === 'guild_portal');
    if (!portal) return;
    const near = this.units.some(u => u.alive && u.team === 'att' && Math.hypot(u.x - portal.cx, u.y - portal.cy) < 7);
    if (!near) return;
    this.guildReleased = true;
    for (const [id, n] of Object.entries(this.setup.base.guildTroops)) for (let i = 0; i < n; i++) {
      const u = this.spawnUnit(id, 'def', portal.cx + this.rng.range(-1, 1), portal.cy + portal.size / 2 + 0.5, 3);
      u.homeX = portal.cx; u.homeY = portal.cy + portal.size / 2 + 0.5;
    }
  }

  // ─────────────────────────── Résultat ───────────────────────────
  result(): BattleResult {
    return {
      stars: this.stars, destruction: this.destruction, loot: { ...this.lootGained }, usedUnits: { ...this.usedUnits },
      usedSpells: { ...this.usedSpells }, ticks: this.tick, reason: this.endReason, commands: this.log.slice(),
      heroesDeployed: this.setup.attacker.heroes.filter(h => !this.heroesLeft[h.id]).map(h => h.id),
      survivors: this.units.filter(u => u.alive && u.team === 'att').length,
    };
  }

  isActiveUnit(u: SUnit) { return this.isActive(u, this.tick); }
}

export interface BattleResult {
  stars: number; destruction: number; loot: Resources; usedUnits: Record<string, number>; usedSpells: Record<string, number>;
  ticks: number; reason: string; commands: Command[]; heroesDeployed: string[]; survivors: number;
}

export function rectDist(px: number, py: number, b: { x: number; y: number; size: number }): number {
  const inset = b.size > 1 ? 0.15 : 0;
  const x0 = b.x + inset, y0 = b.y + inset, x1 = b.x + b.size - inset, y1 = b.y + b.size - inset;
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Simulation complète en mode "headless" (serveur, tests, guerres de bots). */
export function simulate(setup: BattleSetup, cmds: Command[]): BattleResult {
  const sim = new BattleSim(setup);
  sim.runWithCommands(cmds, Math.ceil(setup.timeLimit * TICKS_PER_SEC) + 5);
  if (!sim.ended) sim.finish('Temps écoulé');
  return sim.result();
}
