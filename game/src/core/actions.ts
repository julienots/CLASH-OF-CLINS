// Registre unique des actions de jeu. Le client (LocalAuthority) et le serveur
// exécutent exactement ce code : le serveur reste la source de vérité en ligne.
import type { GameState } from './state';
import { fail, ok, type ActionResult, type Cost } from './types';
import * as C from '../buildings/construction';
import * as E from '../resources/economy';
import * as A from '../army/army';
import * as R from '../research/research';
import * as H from '../heroes/heroes';
import * as P from '../battlepass/pass';
import * as M from '../progression/missions';
import * as S from '../shop/catalog';
import * as G from '../guilds/guild';
import * as W from '../wars/war';
import { claimSite, worldSites } from '../world/world';
import { simulate, type Command } from '../combat/sim';
import { findOpponent, campaignOpponent, villageOpponent, makeSetup, applyAttackResult, invasionSetup, applyInvasionResult, type Opponent } from '../combat/setup';
import { campaignUnlocked } from '../campaign/campaign';
import { advance } from './game';
import { RES_KEYS } from './types';

export type OpponentRef =
  | { kind: 'raid'; seed: number }
  | { kind: 'campaign'; index: number }
  | { kind: 'village'; site: string }
  | { kind: 'event'; site: string }
  | { kind: 'war'; target: number };

export function resolveOpponent(s: GameState, ref: OpponentRef, now: number): Opponent | null {
  switch (ref.kind) {
    case 'raid': return findOpponent(s, ref.seed, now);
    case 'campaign': return campaignUnlocked(s.campaign.stars, ref.index) && ref.index >= 1 && ref.index <= 30 ? campaignOpponent(ref.index) : null;
    case 'village':
    case 'event': {
      const site = worldSites(s, now).find(x => x.id === ref.site);
      if (!site?.seed || !site.citadel) return null;
      return villageOpponent(site.name, site.citadel, site.seed, ref.kind, s, now);
    }
    case 'war': return W.warOpponent(s, ref.target);
  }
}

type Handler = (s: GameState, a: any, now: number) => ActionResult<any>;

const withMission = (kind: M.MissionKind, n: number | ((a: any, r: ActionResult<any>) => number), h: Handler): Handler => (s, a, now) => {
  const r = h(s, a, now);
  if (r.ok) M.progressMission(s, kind, typeof n === 'number' ? n : n(a, r));
  return r;
};
const sumRes = (r: ActionResult<any>) => (r.data ? Object.values(r.data as Record<string, number>).reduce((x, y) => x + (y ?? 0), 0) : 0);

export const ACTIONS: Record<string, Handler> = {
  // ── Village ──
  place: withMission('upgrade', 1, (s, a, now) => C.placeBuilding(s, a.type, a.x, a.y, now)),
  walls: (s, a, now) => C.placeWalls(s, a.cells ?? [], now),
  upgrade: withMission('upgrade', 1, (s, a, now) => C.upgradeBuilding(s, a.uid, now)),
  upgradeMany: withMission('upgrade', (_a, r) => r.data ?? 0, (s, a, now) => C.upgradeMany(s, a.uids ?? [], now)),
  /** Complète les ressources manquantes en cristaux puis améliore. */
  upgradeWithCrystals: withMission('upgrade', 1, (s, a, now) => {
    const b = s.buildings.find(x => x.uid === a.uid);
    if (!b) return fail('Bâtiment introuvable');
    const cost: Cost = C.buildCost(s, b.type, b.level + 1, now);
    const r = E.buyMissing(s, cost);
    if (!r.ok) return r;
    return C.upgradeBuilding(s, a.uid, now);
  }),
  cancel: (s, a, now) => C.cancelBuild(s, a.uid, now),
  finish: (s, a, now) => C.finishNow(s, a.uid, now),
  move: (s, a) => C.moveBuildings(s, a.moves ?? []),
  rotate: (s, a) => C.rotateBuilding(s, a.uid),
  remove: (s, a) => C.removeBuilding(s, a.uid),
  collect: withMission('collect', (_a, r) => sumRes(r), (s, a) => E.collect(s, a.uid)),
  collectAll: (s) => { const g = E.collectAll(s); const n = Object.values(g).reduce((x, y) => x + (y ?? 0), 0); M.progressMission(s, 'collect', n); return n ? ok(g) : fail('Rien à récolter'); },
  trade: (s, a) => E.trade(s, a.from, a.amount),
  // ── Armée ──
  train: withMission('train', a => a.count ?? 1, (s, a, now) => A.trainUnit(s, a.unit, a.count ?? 1, now)),
  cancelTrain: (s, a) => A.cancelTraining(s, a.index),
  brew: (s, a) => A.brewSpell(s, a.spell),
  cancelBrew: (s, a) => A.cancelSpell(s, a.index),
  finishTraining: (s) => A.finishTrainingNow(s),
  // ── Recherche / héros ──
  research: (s, a, now) => R.startResearch(s, a.kind, a.id, now),
  finishResearch: (s, _a, now) => R.finishResearchNow(s, now),
  heroUpgrade: (s, a, now) => H.upgradeHero(s, a.id, now),
  heroFinish: (s, a, now) => H.finishHeroNow(s, a.id, now),
  forge: (s, a) => H.forgeEquipment(s, a.id),
  equip: (s, a) => H.equip(s, a.hero, a.item),
  unequip: (s, a) => H.unequip(s, a.hero, a.item),
  heroSkin: (s, a) => H.setHeroSkin(s, a.hero, a.skin),
  // ── Progression ──
  claimMission: (s, a) => M.claimMission(s, a.id),
  claimAchievement: (s, a) => M.claimAchievement(s, a.id),
  claimTier: (s, a) => P.claimTier(s, a.tier, a.track),
  buyPass: (s) => P.buyPassWithCrystals(s),
  // ── Boutique ──
  buyItem: (s, a, now) => S.buyCrystalItem(s, a.id, now),
  setTheme: (s, a) => S.setTheme(s, a.id),
  setCitadelSkin: (s, a) => S.setCitadelSkin(s, a.id),
  // ── Guilde / guerre ──
  guildCreate: (s, a, now) => G.createGuild(s, a.name ?? '', a.emblem ?? '', a.desc ?? '', now),
  guildJoin: (s, a, now) => G.joinGuildById(s, String(a.id ?? ''), now),
  guildLeave: (s) => G.leaveGuild(s),
  guildInvite: (s, a, now) => G.invite(s, a.name ?? '', now),
  guildChat: (s, a, now) => G.sendChat(s, String(a.text ?? ''), now),
  guildRequest: (s, _a, now) => G.requestTroops(s, now),
  guildDonate: (s, a, now) => G.donateUnit(s, a.unit, now),
  guildDonateRes: (s, a) => G.donateResources(s, a.res, a.amount),
  warStart: (s, _a, now) => W.startWar(s, now),
  warClaim: (s) => W.claimWarReward(s),
  // ── Monde ──
  claimSite: (s, a, now) => { const site = worldSites(s, now).find(x => x.id === a.site); return site ? claimSite(s, site, now) : fail('Site inconnu'); },
  // ── Combats (re-simulés pour validation) ──
  battle: (s, a, now) => {
    const ref = a.opponent as OpponentRef;
    const opp = resolveOpponent(s, ref, now);
    if (!opp) return fail('Adversaire invalide');
    if (ref.kind === 'war') {
      if (!s.war || s.war.phase !== 'battle' || s.war.attacksLeft <= 0) return fail('Attaque de guerre impossible');
    }
    const setup = makeSetup(s, opp, a.seed >>> 0);
    const result = simulate(setup, (a.commands ?? []) as Command[]);
    if (!result.commands.length && !a.allowEmpty) return fail('Aucune troupe déployée');
    const applied = applyAttackResult(s, opp, result, now);
    if (ref.kind === 'war') W.applyWarAttack(s, ref.target, result.stars, result.destruction);
    return ok({ result, applied });
  },
  invasion: (s, a, now) => {
    const setup = invasionSetup(s, a.seed >>> 0);
    const result = simulate(setup, (a.commands ?? []) as Command[]);
    const r = applyInvasionResult(s, result, now);
    return ok({ result, ...r });
  },
  // ── Joueur ──
  setName: (s, a) => {
    const n = String(a.name ?? '').replace(/[<>]/g, '').trim().slice(0, 16);
    if (n.length < 3) return fail('Nom trop court (3 caractères min.)');
    s.player.name = n;
    return ok();
  },
  settings: (s, a) => { Object.assign(s.settings, pick(a, ['music', 'sfx', 'quality', 'vibration', 'showFps', 'language'])); return ok(); },
  tutorial: (s, a) => { s.player.tutorialStep = Math.max(s.player.tutorialStep, a.step | 0); if (a.done) s.player.tutorialDone = true; return ok(); },
};

function pick(o: any, keys: string[]) { const r: any = {}; for (const k of keys) if (o?.[k] !== undefined) r[k] = o[k]; return r; }

/** Erreurs internes rencontrées (surveillées par les tests longs / la télémétrie serveur). */
export const internalErrors: string[] = [];

/** Point d'entrée unique : avance le temps puis exécute l'action. */
export function dispatch(s: GameState, name: string, args: any, now: number): ActionResult<any> {
  const h = ACTIONS[name];
  if (!h) return fail('Action inconnue : ' + name);
  advance(s, now);
  let r: ActionResult<any>;
  try {
    r = h(s, args && typeof args === 'object' ? args : {}, now);
  } catch (e) {
    internalErrors.push(`${name}: ${(e as Error).message}`);
    r = fail('Requête invalide');
  }
  for (const k of RES_KEYS) if (!(s.resources[k] >= 0)) s.resources[k] = 0; // garde-fou absolu
  return r;
}
