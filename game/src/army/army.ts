// Entraînement des troupes, préparation des sorts et composition d'armée.
import type { GameState } from '../core/state';
import { fail, ok, type ActionResult, type Cost } from '../core/types';
import { UNITS, udef } from '../units/defs';
import { SPELLS, sdef } from '../spells/defs';
import { armyCapacity, bestLevel, spellCapacity, mods } from '../village/query';
import { spend, refund } from '../resources/economy';
import { crystalsForTime } from '../resources/economy';
import { currentSeason } from '../events/events';

export function housingOf(units: Record<string, number>): number {
  let h = 0;
  for (const [id, n] of Object.entries(units)) if (n > 0 && UNITS[id]) h += UNITS[id].housing * n;
  return h;
}
export function spellHousingOf(spells: Record<string, number>): number {
  let h = 0;
  for (const [id, n] of Object.entries(spells)) if (n > 0) h += sdef(id).housing * n;
  return h;
}
export function queuedHousing(s: GameState): number {
  return s.army.queue.reduce((a, q) => a + udef(q.id).housing, 0);
}
export function queuedSpellHousing(s: GameState): number {
  return s.army.spellQueue.reduce((a, q) => a + sdef(q.id).housing, 0);
}

export function isUnitUnlocked(s: GameState, id: string, now: number): boolean {
  const u = udef(id);
  if (u.temporary) return currentSeason(now).unit === id;
  if (u.building === 'event') return false;
  return bestLevel(s, u.building) >= u.unlockLevel;
}

export function unitTrainTime(s: GameState, id: string): number {
  return udef(id).trainTime * (1 - mods(s).trainSpeed);
}

export function trainUnit(s: GameState, id: string, count: number, now: number): ActionResult {
  const u = UNITS[id];
  if (!u) return fail('Unité inconnue');
  if (!isUnitUnlocked(s, id, now)) return fail('Unité verrouillée');
  count = Math.floor(count);
  if (count < 1 || count > 200) return fail('Quantité invalide');
  const cap = armyCapacity(s);
  const used = housingOf(s.army.units) + queuedHousing(s);
  if (used + u.housing * count > cap) return fail('Camps pleins');
  const total: Cost = {};
  for (const k of Object.keys(u.cost) as (keyof Cost)[]) total[k] = (u.cost[k] ?? 0) * count;
  const r = spend(s, total);
  if (!r.ok) return fail(r.error!);
  for (let i = 0; i < count; i++) s.army.queue.push({ id, kind: 'unit', progress: 0 });
  return ok();
}

export function cancelTraining(s: GameState, index: number): ActionResult {
  const q = s.army.queue[index];
  if (!q) return fail('Introuvable');
  s.army.queue.splice(index, 1);
  refund(s, udef(q.id).cost, 1);
  return ok();
}

export function brewSpell(s: GameState, id: string): ActionResult {
  const sp = SPELLS.find(x => x.id === id);
  if (!sp) return fail('Sort inconnu');
  if (bestLevel(s, 'academy') < sp.academy) return fail('Sort verrouillé');
  if (spellHousingOf(s.army.spells) + queuedSpellHousing(s) + sp.housing > spellCapacity(s)) return fail('Capacité de sorts pleine');
  const r = spend(s, sp.cost);
  if (!r.ok) return fail(r.error!);
  s.army.spellQueue.push({ id, kind: 'spell', progress: 0 });
  return ok();
}
export function cancelSpell(s: GameState, index: number): ActionResult {
  const q = s.army.spellQueue[index];
  if (!q) return fail('Introuvable');
  s.army.spellQueue.splice(index, 1);
  refund(s, sdef(q.id).cost, 1);
  return ok();
}

/** Fait avancer les files d'entraînement de `sec` secondes. Retourne le nb d'unités terminées. */
export function advanceTraining(s: GameState, sec: number): number {
  let done = 0;
  // Les casernes travaillent en parallèle : chaque caserne supplémentaire accélère la file.
  const parallel = Math.max(1, s.buildings.filter(b => b.type === 'barracks' && b.level > 0).length);
  let budget = sec * parallel;
  while (budget > 0 && s.army.queue.length) {
    const q = s.army.queue[0];
    const need = unitTrainTime(s, q.id) - q.progress;
    if (budget >= need) {
      budget -= need;
      s.army.queue.shift();
      s.army.units[q.id] = (s.army.units[q.id] ?? 0) + 1;
      s.player.stats.unitsTrained++;
      done++;
    } else { q.progress += budget; budget = 0; }
  }
  let sb = sec;
  while (sb > 0 && s.army.spellQueue.length) {
    const q = s.army.spellQueue[0];
    const need = sdef(q.id).brewTime - q.progress;
    if (sb >= need) { sb -= need; s.army.spellQueue.shift(); s.army.spells[q.id] = (s.army.spells[q.id] ?? 0) + 1; }
    else { q.progress += sb; sb = 0; }
  }
  return done;
}

export function trainingRemaining(s: GameState): number {
  const parallel = Math.max(1, s.buildings.filter(b => b.type === 'barracks' && b.level > 0).length);
  let t = 0;
  for (const q of s.army.queue) t += unitTrainTime(s, q.id) - q.progress;
  return t / parallel;
}
export function spellRemaining(s: GameState): number {
  return s.army.spellQueue.reduce((t, q) => t + sdef(q.id).brewTime - q.progress, 0);
}
export function finishTrainingCost(s: GameState): number { return crystalsForTime(Math.max(trainingRemaining(s), spellRemaining(s))); }
export function finishTrainingNow(s: GameState): ActionResult {
  const c = finishTrainingCost(s);
  if (c <= 0) return fail('Rien à accélérer');
  if (s.resources.crystals < c) return fail('Cristaux insuffisants');
  s.resources.crystals -= c;
  advanceTraining(s, 1e9);
  return ok();
}

/** Retire les unités utilisées en combat. */
export function consumeArmy(s: GameState, used: Record<string, number>, usedSpells: Record<string, number>) {
  for (const [id, n] of Object.entries(used)) {
    if (s.army.guildTroops[id]) {
      const g = Math.min(n, s.army.guildTroops[id]);
      s.army.guildTroops[id] -= g;
      const rest = n - g;
      s.army.units[id] = Math.max(0, (s.army.units[id] ?? 0) - rest);
    } else s.army.units[id] = Math.max(0, (s.army.units[id] ?? 0) - n);
  }
  for (const [id, n] of Object.entries(usedSpells)) s.army.spells[id] = Math.max(0, (s.army.spells[id] ?? 0) - n);
}
