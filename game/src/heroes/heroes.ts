// Gestion des héros : éveil, amélioration, équipement, apparence.
import type { GameState } from '../core/state';
import { fail, ok, type ActionResult } from '../core/types';
import { HEROES, EQUIPMENT, hdef, heroCap, heroUpgradeCost, heroStats } from './defs';
import { bestLevel, citadelLevel } from '../village/query';
import { spend, crystalsForTime } from '../resources/economy';

export function isHeroAvailable(s: GameState, id: string): boolean {
  const h = hdef(id);
  return bestLevel(s, 'temple') >= h.templeLevel && citadelLevel(s) >= h.citadel;
}

/** Éveille automatiquement les héros dès que le temple le permet. */
export function syncHeroes(s: GameState) {
  for (const h of HEROES) if (!s.heroes[h.id] && isHeroAvailable(s, h.id)) s.heroes[h.id] = { level: 1, equipment: [], skin: h.skins[0].id };
}

export function upgradeHero(s: GameState, id: string, now: number): ActionResult {
  const st = s.heroes[id];
  if (!st) return fail('Héros non éveillé');
  if (st.upgradeEndAt) return fail('Déjà en entraînement');
  if (st.level >= heroCap(citadelLevel(s))) return fail('Niveau max pour cette Citadelle');
  const c = heroUpgradeCost(id, st.level + 1);
  const r = spend(s, c.cost);
  if (!r.ok) return fail(r.error!);
  st.upgradeEndAt = now + c.time * 1000;
  return ok();
}
export function completeHeroUpgrade(s: GameState, id: string) {
  const st = s.heroes[id];
  if (!st?.upgradeEndAt) return;
  st.level++;
  delete st.upgradeEndAt;
}
export function finishHeroCost(s: GameState, id: string, now: number) {
  const st = s.heroes[id];
  return st?.upgradeEndAt ? crystalsForTime((st.upgradeEndAt - now) / 1000) : 0;
}
export function finishHeroNow(s: GameState, id: string, now: number): ActionResult {
  const c = finishHeroCost(s, id, now);
  if (!c) return fail('Rien à accélérer');
  if (s.resources.crystals < c) return fail('Cristaux insuffisants');
  s.resources.crystals -= c;
  completeHeroUpgrade(s, id);
  return ok();
}

export function forgeEquipment(s: GameState, eqId: string): ActionResult {
  const e = EQUIPMENT.find(x => x.id === eqId);
  if (!e) return fail('Équipement inconnu');
  if (bestLevel(s, 'forge') < e.forge) return fail(`Forge niveau ${e.forge} requise`);
  if (s.inventory.equipment.includes(eqId)) return fail('Déjà forgé');
  const r = spend(s, e.cost);
  if (!r.ok) return fail(r.error!);
  s.inventory.equipment.push(eqId);
  return ok();
}
export function equip(s: GameState, heroId: string, eqId: string): ActionResult {
  const st = s.heroes[heroId];
  const e = EQUIPMENT.find(x => x.id === eqId);
  if (!st || !e) return fail('Invalide');
  if (!s.inventory.equipment.includes(eqId)) return fail('Équipement non possédé');
  if (e.hero !== 'any' && e.hero !== heroId) return fail('Réservé à un autre héros');
  for (const other of Object.values(s.heroes)) other.equipment = other.equipment.filter(x => x !== eqId);
  if (st.equipment.length >= 2) st.equipment.shift();
  st.equipment.push(eqId);
  return ok();
}
export function unequip(s: GameState, heroId: string, eqId: string): ActionResult {
  const st = s.heroes[heroId];
  if (!st) return fail('Invalide');
  st.equipment = st.equipment.filter(x => x !== eqId);
  return ok();
}
export function setHeroSkin(s: GameState, heroId: string, skin: string): ActionResult {
  const st = s.heroes[heroId];
  const h = hdef(heroId);
  const sk = h.skins.find(x => x.id === skin);
  if (!st || !sk) return fail('Invalide');
  if (sk.crystals > 0 && !s.inventory.cosmetics.includes(skin)) return fail('Apparence non possédée');
  st.skin = skin;
  return ok();
}

export function heroCombatStats(s: GameState, id: string) {
  const st = s.heroes[id];
  const bonus = { hp: 0, dmg: 0 };
  for (const e of st?.equipment ?? []) { const d = EQUIPMENT.find(x => x.id === e); if (d) { bonus.hp += d.hp; bonus.dmg += d.dmg; } }
  return heroStats(id, st?.level ?? 1, bonus);
}
