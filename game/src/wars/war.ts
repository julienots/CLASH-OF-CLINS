// Guerre de guildes : PRÉPARATION → ATTAQUES → DÉFENSES → SCORE → VICTOIRE → RÉCOMPENSES.
import type { GameState, WarBase, WarState } from '../core/state';
import { fail, ok, type ActionResult, type Resources } from '../core/types';
import { Rng, hashString } from '../core/rng';
import { randomName, randomLordName } from '../campaign/basegen';
import { EMBLEMS } from '../guilds/guild';
import { citadelLevel } from '../village/query';
import { gain } from '../resources/economy';
import { simulate, type BattleResult } from '../combat/sim';
import { planAttack, botArmy } from '../combat/ai';
import { playerBase, villageOpponent, type Opponent } from '../combat/setup';
import { addPassXp } from '../battlepass/pass';

export const PREP_MS = 10 * 60000;
export const BATTLE_MS = 60 * 60000;
export const ATTACKS_PER_MEMBER = 2;

export function canStartWar(s: GameState): string | null {
  if (!s.guild) return 'Rejoignez une guilde';
  if (s.guild.members.length < 5) return 'Il faut au moins 5 membres';
  if (s.war && s.war.phase !== 'ended') return 'Une guerre est déjà en cours';
  if (s.war && !s.war.rewardClaimed) return 'Récupérez d\'abord les récompenses de la guerre précédente';
  return null;
}

export function startWar(s: GameState, now: number): ActionResult<WarState> {
  const err = canStartWar(s); if (err) return fail(err);
  const g = s.guild!;
  const rng = new Rng(hashString(g.id) ^ Math.floor(now / 1000));
  const size = Math.min(10, g.members.length - (g.members.length % 5 === 0 ? 0 : g.members.length % 5)) || 5;
  const roster = [...g.members].sort((a, b) => b.citadel - a.citadel || b.trophies - a.trophies);
  const me = roster.find(m => !m.bot)!;
  const chosen = roster.filter(m => m.bot).slice(0, size - 1);
  chosen.push(me);
  chosen.sort((a, b) => b.citadel - a.citadel);
  const ours: WarBase[] = chosen.map(m => ({ memberId: m.id, name: m.name, citadel: m.citadel, seed: rng.int(1, 1e9), stars: 0, destruction: 0, attacked: false }));
  const theirs: WarBase[] = ours.map(o => ({ memberId: 'e' + rng.int(1, 1e9), name: randomName(rng), citadel: Math.max(1, Math.min(15, o.citadel + rng.pick([-1, 0, 0, 1]))), seed: rng.int(1, 1e9), stars: 0, destruction: 0, attacked: false }));
  const prepEndAt = now + PREP_MS, battleEndAt = prepEndAt + BATTLE_MS;
  const schedule: WarState['schedule'] = [];
  ours.forEach((o, i) => {
    if (o.memberId === me.id) return;
    for (let k = 0; k < ATTACKS_PER_MEMBER; k++) schedule.push({ at: prepEndAt + rng.range(0.05, 0.95) * BATTLE_MS, side: 'ours', attacker: i, target: Math.max(0, Math.min(theirs.length - 1, i + rng.int(-1, 1 + k))), done: false });
  });
  theirs.forEach((_, i) => {
    for (let k = 0; k < ATTACKS_PER_MEMBER; k++) schedule.push({ at: prepEndAt + rng.range(0.05, 0.95) * BATTLE_MS, side: 'theirs', attacker: i, target: Math.max(0, Math.min(ours.length - 1, i + rng.int(-1, 1 + k))), done: false });
  });
  schedule.sort((a, b) => a.at - b.at);
  s.war = {
    id: 'w' + rng.int(1, 1e9).toString(36), enemyName: randomLordName(rng).split(' ')[0] + ' ' + rng.pick(['Légion', 'Clan', 'Ordre', 'Confrérie']), enemyEmblem: rng.pick(EMBLEMS),
    phase: 'preparation', phaseEndAt: prepEndAt, prepEndAt, battleEndAt, ours, theirs, attacksLeft: ATTACKS_PER_MEMBER,
    ourStars: 0, theirStars: 0, ourDestruction: 0, theirDestruction: 0, log: [`Guerre déclarée contre ${'l\'ennemi'} !`], schedule,
  };
  s.war.log = [`Guerre déclarée ! Préparation : 10 minutes.`];
  g.chat.push({ from: 'Système', text: `⚔️ Guerre lancée contre ${s.war.enemyName} !`, at: now, system: true });
  return ok(s.war);
}

function recompute(w: WarState) {
  w.ourStars = w.theirs.reduce((a, b) => a + b.stars, 0);
  w.theirStars = w.ours.reduce((a, b) => a + b.stars, 0);
  w.ourDestruction = Math.round(w.theirs.reduce((a, b) => a + b.destruction, 0) / w.theirs.length);
  w.theirDestruction = Math.round(w.ours.reduce((a, b) => a + b.destruction, 0) / w.ours.length);
}

/** Estimation rapide d'une attaque bot contre bot. */
function estimate(rng: Rng, atkCl: number, defCl: number): { stars: number; destruction: number } {
  const p = 1 / (1 + Math.exp(-(atkCl - defCl) * 1.2 - 0.3));
  const destruction = Math.round(Math.min(100, Math.max(15, 40 + p * 60 + rng.range(-20, 15))));
  const stars = destruction >= 100 ? 3 : destruction >= 50 ? (rng.chance(p) ? 2 : 1) : (rng.chance(p * 0.3) ? 1 : 0);
  return { stars, destruction };
}

/** Fait avancer la guerre. `maxSims` limite les simulations lourdes par appel. */
export function tickWar(s: GameState, now: number, maxSims = 1): void {
  const w = s.war;
  if (!w || w.phase === 'ended') return;
  if (w.phase === 'preparation' && now >= w.prepEndAt) { w.phase = 'battle'; w.phaseEndAt = w.battleEndAt; w.log.unshift('Le jour de bataille commence !'); }
  if (w.phase !== 'battle' && w.phase !== 'preparation') return;
  let sims = 0;
  for (const ev of w.schedule) {
    if (ev.done || ev.at > now) continue;
    const rng = new Rng(Math.floor(ev.at));
    if (ev.side === 'ours') {
      const a = w.ours[ev.attacker], d = w.theirs[ev.target];
      const r = estimate(rng, a.citadel, d.citadel);
      if (r.stars > d.stars || (r.stars === d.stars && r.destruction > d.destruction)) { d.stars = Math.max(d.stars, r.stars); d.destruction = Math.max(d.destruction, r.destruction); }
      d.attacked = true;
      w.log.unshift(`⚔️ ${a.name} attaque ${d.name} : ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)} ${r.destruction}%`);
    } else {
      const a = w.theirs[ev.attacker], d = w.ours[ev.target];
      let r: { stars: number; destruction: number };
      if (d.memberId === s.player.id) {
        if (sims >= maxSims) continue;
        sims++;
        const res = defendPlayerBase(s, a.citadel, Math.floor(ev.at));
        r = { stars: res.stars, destruction: res.destruction };
        s.log.unshift({ at: now, attacker: `${a.name} (guerre)`, stars: r.stars, destruction: r.destruction, lost: {}, trophies: 0, kind: 'pvp' });
        s.log = s.log.slice(0, 30);
        if (r.stars === 0) s.player.stats.defensesWon++; else s.player.stats.defensesLost++;
      } else r = estimate(rng, a.citadel, d.citadel);
      if (r.stars > d.stars || (r.stars === d.stars && r.destruction > d.destruction)) { d.stars = Math.max(d.stars, r.stars); d.destruction = Math.max(d.destruction, r.destruction); }
      d.attacked = true;
      w.log.unshift(`🛡️ ${a.name} attaque ${d.name} : ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)} ${r.destruction}%`);
    }
    ev.done = true;
  }
  w.log = w.log.slice(0, 60);
  recompute(w);
  if (now >= w.battleEndAt) endWar(s, now);
}

/** Défense réelle de la base du joueur contre une armée IA (simulation complète). */
export function defendPlayerBase(s: GameState, attackerCl: number, seed: number): BattleResult {
  const army = botArmy(attackerCl, seed);
  const unitLevels: Record<string, number> = {};
  for (const k of Object.keys(army.units)) unitLevels[k] = Math.max(1, Math.ceil(attackerCl * 0.55));
  const setup = { seed, mode: 'war' as const, base: playerBase(s), attacker: { units: army.units, unitLevels, spells: army.spells, spellLevels: {}, heroes: [] }, loot: {}, timeLimit: 180 };
  return simulate(setup, planAttack(setup, seed));
}

function endWar(s: GameState, now: number) {
  const w = s.war!;
  // résout toutes les attaques restantes
  for (const ev of w.schedule) if (!ev.done) { ev.at = Math.min(ev.at, now); }
  tickWarRemaining(s, now);
  recompute(w);
  w.phase = 'ended';
  w.result = w.ourStars > w.theirStars ? 'victory' : w.ourStars < w.theirStars ? 'defeat' : w.ourDestruction > w.theirDestruction ? 'victory' : w.ourDestruction < w.theirDestruction ? 'defeat' : 'draw';
  w.log.unshift(w.result === 'victory' ? '🏆 VICTOIRE !' : w.result === 'defeat' ? 'Défaite…' : 'Égalité.');
  s.warHistory.unshift({ enemy: w.enemyName, result: w.result, at: now });
  s.warHistory = s.warHistory.slice(0, 20);
  s.guild?.chat.push({ from: 'Système', text: `Fin de la guerre : ${w.result === 'victory' ? 'VICTOIRE 🏆' : w.result === 'defeat' ? 'défaite' : 'égalité'} (${w.ourStars}★ contre ${w.theirStars}★)`, at: now, system: true });
}
function tickWarRemaining(s: GameState, now: number) {
  const w = s.war!;
  for (const ev of w.schedule) if (!ev.done) {
    const rng = new Rng(Math.floor(ev.at));
    const a = ev.side === 'ours' ? w.ours[ev.attacker] : w.theirs[ev.attacker];
    const d = ev.side === 'ours' ? w.theirs[ev.target] : w.ours[ev.target];
    const r = estimate(rng, a.citadel, d.citadel);
    if (r.stars > d.stars || (r.stars === d.stars && r.destruction > d.destruction)) { d.stars = Math.max(d.stars, r.stars); d.destruction = Math.max(d.destruction, r.destruction); }
    ev.done = true;
  }
  void now;
}

export function warReward(s: GameState): Partial<Resources> & { crystals?: number } {
  const w = s.war;
  if (!w) return {};
  const cl = citadelLevel(s);
  const mult = w.result === 'victory' ? 1 : w.result === 'draw' ? 0.5 : 0.25;
  const myAttacks = ATTACKS_PER_MEMBER - w.attacksLeft;
  const act = 0.4 + 0.3 * myAttacks;
  return { gold: Math.round(1500 * cl * cl * mult * act), wood: Math.round(1500 * cl * cl * mult * act), ...(cl >= 6 ? { energy: Math.round(60 * cl * cl * mult * act) } : {}), crystals: w.result === 'victory' ? 50 : 10 };
}

export function claimWarReward(s: GameState): ActionResult<Partial<Resources>> {
  const w = s.war;
  if (!w || w.phase !== 'ended') return fail('La guerre n\'est pas terminée');
  if (w.rewardClaimed) return fail('Déjà récupéré');
  const r = warReward(s);
  const { crystals, ...res } = r;
  const got = gain(s, res);
  s.resources.crystals += crystals ?? 0;
  w.rewardClaimed = true;
  addPassXp(s, w.result === 'victory' ? 300 : 100);
  return ok({ ...got, crystals });
}

export function warOpponent(s: GameState, targetIdx: number): Opponent | null {
  const w = s.war;
  if (!w) return null;
  const b = w.theirs[targetIdx];
  if (!b) return null;
  const o = villageOpponent(b.name, b.citadel, b.seed, 'war', s);
  o.loot = {};
  o.warMember = b.memberId;
  return o;
}

export function applyWarAttack(s: GameState, targetIdx: number, stars: number, destruction: number): ActionResult {
  const w = s.war;
  if (!w || w.phase !== 'battle') return fail('Pas de jour de bataille en cours');
  if (w.attacksLeft <= 0) return fail('Plus d\'attaques disponibles');
  const b = w.theirs[targetIdx];
  if (!b) return fail('Cible invalide');
  w.attacksLeft--;
  if (stars > b.stars || (stars === b.stars && destruction > b.destruction)) { b.stars = Math.max(stars, b.stars); b.destruction = Math.max(destruction, b.destruction); }
  b.attacked = true;
  w.log.unshift(`⭐ ${s.player.name} attaque ${b.name} : ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} ${destruction}%`);
  recompute(w);
  return ok();
}

/** Accélère la guerre (outil de debug / tests). */
export function fastForwardWar(s: GameState, now: number) {
  const w = s.war; if (!w) return;
  const shift = (w.phase === 'preparation' ? w.prepEndAt : w.battleEndAt) - now;
  if (shift <= 0) return;
  w.prepEndAt -= shift; w.battleEndAt -= shift; w.phaseEndAt -= shift;
  for (const e of w.schedule) e.at -= shift;
}
