// Laboratoire : recherche d'unités, de sorts et de l'arbre technologique.
import type { GameState } from '../core/state';
import { fail, ok, type ActionResult, type Cost } from '../core/types';
import { UNITS, unitResearchCost } from '../units/defs';
import { SPELLS, spellResearchCost } from '../spells/defs';
import { TECH_BY_ID } from './tech';
import { bestLevel, mods } from '../village/query';
import { spend, crystalsForTime } from '../resources/economy';
import { addXp, xpForSeconds } from '../progression/progression';

export function researchLevel(s: GameState, id: string): number { return s.research.levels[id] ?? 1; }

export interface ResearchOption { id: string; kind: 'unit' | 'spell' | 'tech'; toLevel: number; cost: Cost; time: number; labLevel: number; available: boolean; reason?: string }

export function researchOption(s: GameState, kind: 'unit' | 'spell' | 'tech', id: string): ResearchOption {
  const lab = bestLevel(s, 'laboratory');
  const speed = 1 - mods(s).researchSpeed;
  if (kind === 'tech') {
    const n = TECH_BY_ID[id];
    if (!n) return { id, kind, toLevel: 1, cost: {}, time: 0, labLevel: 99, available: false, reason: 'Inconnu' };
    const owned = !!s.research.tech[id];
    const missingReq = n.requires.filter(r => !s.research.tech[r]);
    const reason = owned ? 'Déjà acquis' : missingReq.length ? 'Prérequis manquants' : lab < n.lab ? `Laboratoire niv. ${n.lab}` : undefined;
    return { id, kind, toLevel: 1, cost: n.cost, time: Math.round(n.time * speed), labLevel: n.lab, available: !reason, reason };
  }
  const cur = researchLevel(s, id);
  const invalid = { id, kind, toLevel: 1, cost: {}, time: 0, labLevel: 99, available: false, reason: 'Inconnu' } as ResearchOption;
  if (kind !== 'unit' && kind !== 'spell') return invalid;
  if (kind === 'unit' && (!UNITS[id] || UNITS[id].building === 'event')) return invalid;
  if (kind === 'spell' && !SPELLS.some(x => x.id === id)) return invalid;
  if (kind === 'unit') {
    const u = UNITS[id];
    if (cur >= u.maxLevel) return { id, kind, toLevel: cur, cost: {}, time: 0, labLevel: 0, available: false, reason: 'Niveau max' };
    const r = unitResearchCost(id, cur + 1);
    const unlocked = bestLevel(s, u.building) >= u.unlockLevel;
    const reason = !unlocked ? 'Unité non débloquée' : lab < r.labLevel ? `Laboratoire niv. ${r.labLevel}` : undefined;
    return { id, kind, toLevel: cur + 1, cost: r.cost, time: Math.round(r.time * speed), labLevel: r.labLevel, available: !reason, reason };
  }
  const sp = SPELLS.find(x => x.id === id)!;
  if (cur >= sp.maxLevel) return { id, kind, toLevel: cur, cost: {}, time: 0, labLevel: 0, available: false, reason: 'Niveau max' };
  const r = spellResearchCost(id, cur + 1);
  const unlocked = bestLevel(s, 'academy') >= sp.academy;
  const reason = !unlocked ? 'Sort non débloqué' : lab < r.labLevel ? `Laboratoire niv. ${r.labLevel}` : undefined;
  return { id, kind, toLevel: cur + 1, cost: r.cost, time: Math.round(r.time * speed), labLevel: r.labLevel, available: !reason, reason };
}

export function startResearch(s: GameState, kind: 'unit' | 'spell' | 'tech', id: string, now: number): ActionResult {
  if (!bestLevel(s, 'laboratory')) return fail('Construisez un laboratoire');
  const lab = s.buildings.find(b => b.type === 'laboratory' && b.level > 0);
  if (lab?.build) return fail('Le laboratoire est en amélioration');
  if (s.research.active) return fail('Une recherche est déjà en cours');
  const o = researchOption(s, kind, id);
  if (!o.available) return fail(o.reason ?? 'Indisponible');
  const r = spend(s, o.cost);
  if (!r.ok) return fail(r.error!);
  s.research.active = { id, kind, toLevel: o.toLevel, endAt: now + o.time * 1000 };
  return ok();
}

export function completeResearch(s: GameState) {
  const a = s.research.active;
  if (!a) return;
  if (a.kind === 'tech') s.research.tech[a.id] = true;
  else s.research.levels[a.id] = a.toLevel;
  addXp(s, xpForSeconds(3600) + 10 * a.toLevel);
  delete s.research.active;
}

export function finishResearchCost(s: GameState, now: number): number {
  return s.research.active ? crystalsForTime((s.research.active.endAt - now) / 1000) : 0;
}
export function finishResearchNow(s: GameState, now: number): ActionResult {
  if (!s.research.active) return fail('Aucune recherche');
  const c = finishResearchCost(s, now);
  if (s.resources.crystals < c) return fail('Cristaux insuffisants');
  s.resources.crystals -= c;
  completeResearch(s);
  return ok();
}
