// Guildes. En ligne, ces opérations passent par le serveur (networking/api.ts) ;
// hors-ligne, la guilde est peuplée de compagnons simulés pour garder le jeu vivant.
import type { GameState, GuildMember, GuildState } from '../core/state';
import { fail, ok, type ActionResult, type Resources } from '../core/types';
import { Rng, hashString } from '../core/rng';
import { randomName } from '../campaign/basegen';
import { bestLevel, citadelLevel } from '../village/query';
import { blevel } from '../buildings/defs';
import { spend } from '../resources/economy';
import { UNITS, udef } from '../units/defs';
import { housingOf } from '../army/army';
import { progressMission } from '../progression/missions';
import { addXp } from '../progression/progression';

export const GUILD_CREATE_COST = 40000;
export const EMBLEMS = ['🦁', '🐉', '🦅', '🐺', '🌙', '⚜️', '🔥', '❄️', '🌿', '⚔️', '🛡️', '👑'];
export const MAX_MEMBERS = 30;

export interface GuildListing { id: string; name: string; emblem: string; desc: string; members: number; trophies: number; minTrophies: number; level: number; open: boolean }

export function guildPerks(level: number) {
  return { donationCap: 5 + level, troopLevelBonus: Math.floor(level / 3), productionBonus: Math.min(0.1, level * 0.01) };
}

export function suggestedGuilds(s: GameState, seed: number): GuildListing[] {
  const rng = new Rng(seed);
  const out: GuildListing[] = [];
  const names = ['Ordre du Phénix', 'Les Lames d\'Argent', 'Gardiens du Nord', 'Couronne d\'Ambre', 'Légion Céleste', 'Frères de Braise', 'Cercle des Sages', 'Loups du Crépuscule'];
  for (let i = 0; i < 6; i++) {
    const members = rng.int(8, 28);
    const t = Math.max(0, s.player.trophies + rng.int(-300, 400));
    out.push({ id: 'g' + (hashString(names[i] + seed) >>> 0).toString(36), name: names[(i + seed) % names.length], emblem: rng.pick(EMBLEMS), desc: rng.pick(['Actifs tous les jours, guerres 2x/semaine !', 'Entraide et bonne humeur.', 'Guilde compétitive, dons obligatoires.', 'Débutants bienvenus !']), members, trophies: t * members, minTrophies: Math.max(0, Math.floor((s.player.trophies + rng.int(-400, 100)) / 100) * 100), level: rng.int(1, 12), open: rng.chance(0.8) });
  }
  return out;
}

function botMember(rng: Rng, cl: number, trophies: number): GuildMember {
  return { id: 'b' + rng.int(1e5, 1e9).toString(36), name: randomName(rng), trophies: Math.max(0, trophies + rng.int(-250, 250)), role: 'membre', citadel: Math.max(1, Math.min(15, cl + rng.int(-2, 2))), donations: rng.int(0, 400), bot: true };
}

function self(s: GameState, role: GuildMember['role']): GuildMember {
  return { id: s.player.id, name: s.player.name, trophies: s.player.trophies, role, citadel: citadelLevel(s), donations: s.player.stats.donations, bot: false };
}

export function requirePortal(s: GameState): string | null {
  return bestLevel(s, 'guild_portal') ? null : 'Construisez le Portail de Guilde (Citadelle niv. 3)';
}

export function createGuild(s: GameState, name: string, emblem: string, desc: string, now: number): ActionResult<GuildState> {
  const req = requirePortal(s); if (req) return fail(req);
  if (s.guild) return fail('Quittez d\'abord votre guilde');
  name = name.trim().slice(0, 24);
  if (name.length < 3) return fail('Nom trop court');
  if (!EMBLEMS.includes(emblem)) emblem = EMBLEMS[0];
  const r = spend(s, { gold: GUILD_CREATE_COST });
  if (!r.ok) return fail(r.error!);
  s.guild = {
    id: 'g' + (hashString(name + now) >>> 0).toString(36), name, emblem, desc: desc.slice(0, 120), level: 1, xp: 0,
    members: [self(s, 'chef')], chat: [{ from: 'Système', text: `La guilde ${name} est fondée !`, at: now, system: true }], donatedToday: 0, lastDonationDay: 0, invites: [],
  };
  return ok(s.guild);
}

/** Le client n'envoie qu'un identifiant : la fiche de guilde est recalculée ici (jamais fournie par le client). */
export function joinGuildById(s: GameState, id: string, now: number): ActionResult<GuildState> {
  const hour = Math.floor(now / 3600000);
  const g = [...suggestedGuilds(s, hour), ...suggestedGuilds(s, hour - 1)].find(x => x.id === id);
  if (!g) return fail('Guilde introuvable');
  return joinGuild(s, g, now);
}

export function joinGuild(s: GameState, g: GuildListing, now: number): ActionResult<GuildState> {
  const req = requirePortal(s); if (req) return fail(req);
  if (s.guild) return fail('Vous êtes déjà dans une guilde');
  if (!g.open) return fail('Guilde sur invitation');
  if (s.player.trophies < g.minTrophies) return fail(`Il faut ${g.minTrophies} trophées`);
  const rng = new Rng(hashString(g.id));
  const members: GuildMember[] = [];
  const cl = citadelLevel(s);
  for (let i = 0; i < Math.min(MAX_MEMBERS - 1, g.members); i++) members.push(botMember(rng, cl, s.player.trophies));
  members[0].role = 'chef'; if (members[1]) members[1].role = 'adjoint'; if (members[2]) members[2].role = 'ancien';
  members.push(self(s, 'membre'));
  s.guild = { id: g.id, name: g.name, emblem: g.emblem, desc: g.desc, level: g.level, xp: 0, members, chat: [{ from: 'Système', text: `${s.player.name} a rejoint la guilde.`, at: now, system: true }, { from: members[0].name, text: 'Bienvenue parmi nous ! 🎉', at: now + 1500 }], donatedToday: 0, lastDonationDay: 0, invites: [] };
  return ok(s.guild);
}

export function leaveGuild(s: GameState): ActionResult {
  if (!s.guild) return fail('Aucune guilde');
  if (s.war && s.war.phase !== 'ended') return fail('Impossible pendant une guerre');
  s.guild = null;
  s.war = null;
  s.army.guildTroops = {};
  return ok();
}

export function invite(s: GameState, name: string, now: number): ActionResult {
  if (!s.guild) return fail('Aucune guilde');
  const me = s.guild.members.find(m => !m.bot);
  if (me && me.role === 'membre') return fail('Seuls les anciens peuvent inviter');
  name = name.trim().slice(0, 20);
  if (name.length < 3) return fail('Nom invalide');
  if (s.guild.members.length + s.guild.invites.length >= MAX_MEMBERS) return fail('Guilde complète');
  s.guild.invites.push(name);
  s.guild.chat.push({ from: 'Système', text: `Invitation envoyée à ${name}.`, at: now, system: true });
  return ok();
}

const REPLIES = [
  'Bien joué !', 'Je m\'occupe des dons 💪', 'Quelqu\'un pour la guerre ce soir ?', 'Merci pour les troupes !', 'Pensez à vos attaques de guerre 😉',
  'Ma Citadelle passe niveau supérieur demain !', 'Les mages sont trop forts avec la rage 🔥', 'Gg tout le monde', 'Je demande des brutes svp', 'On vise le top 100 cette saison !',
];

export function sendChat(s: GameState, text: string, now: number): ActionResult {
  if (!s.guild) return fail('Aucune guilde');
  text = text.replace(/[<>]/g, '').trim().slice(0, 200);
  if (!text) return fail('Message vide');
  s.guild.chat.push({ from: s.player.name, text, at: now });
  // réponse d'un compagnon après un court délai
  const bots = s.guild.members.filter(m => m.bot);
  if (bots.length) {
    const rng = new Rng(hashString(text) ^ now);
    const b = rng.pick(bots);
    s.guild.chat.push({ from: b.name, text: rng.pick(REPLIES), at: now + rng.int(2000, 6000) });
  }
  trimChat(s.guild);
  return ok();
}
function trimChat(g: GuildState) { if (g.chat.length > 120) g.chat = g.chat.slice(-120); }

export function requestTroops(s: GameState, now: number): ActionResult {
  if (!s.guild) return fail('Aucune guilde');
  if (s.guild.requestAt && now - s.guild.requestAt < 10 * 60000) return fail('Patientez avant une nouvelle demande');
  s.guild.requestAt = now;
  s.guild.chat.push({ from: 'Système', text: `${s.player.name} demande des renforts.`, at: now, system: true });
  return ok();
}

export function portalCapacity(s: GameState): number {
  const l = bestLevel(s, 'guild_portal');
  return l ? blevel('guild_portal', l).value ?? 10 : 0;
}

/** Donner une unité de son armée à un compagnon (gain de réputation/XP). */
export function donateUnit(s: GameState, unitId: string, now: number): ActionResult {
  if (!s.guild) return fail('Aucune guilde');
  const day = Math.floor(now / 86400000);
  if (s.guild.lastDonationDay !== day) { s.guild.lastDonationDay = day; s.guild.donatedToday = 0; }
  const cap = guildPerks(s.guild.level).donationCap * 10;
  if (s.guild.donatedToday >= cap) return fail('Limite de dons quotidienne atteinte');
  if (!((s.army.units[unitId] ?? 0) > 0)) return fail('Aucune unité de ce type');
  s.army.units[unitId]--;
  s.guild.donatedToday++;
  s.player.stats.donations++;
  addGuildXp(s, 5 * Math.max(1, udef(unitId).housing));
  addXp(s, Math.max(1, udef(unitId).housing));
  progressMission(s, 'donate', 1);
  const me = s.guild.members.find(m => !m.bot); if (me) me.donations++;
  return ok();
}

/** Donner des ressources au trésor de guilde (fait progresser le niveau de guilde). */
export function donateResources(s: GameState, res: 'gold' | 'wood', amount: number): ActionResult {
  if (!s.guild) return fail('Aucune guilde');
  amount = Math.floor(amount);
  if (!(amount >= 100)) return fail('Minimum 100');
  const r = spend(s, { [res]: amount } as Partial<Resources>);
  if (!r.ok) return fail(r.error!);
  addGuildXp(s, Math.floor(amount / 100));
  s.player.stats.donations++;
  progressMission(s, 'donate', 1);
  return ok();
}

export function guildXpForLevel(l: number) { return 500 * l * l; }
function addGuildXp(s: GameState, xp: number) {
  if (!s.guild) return;
  s.guild.xp += xp;
  while (s.guild.xp >= guildXpForLevel(s.guild.level) && s.guild.level < 20) {
    s.guild.xp -= guildXpForLevel(s.guild.level);
    s.guild.level++;
    s.guild.chat.push({ from: 'Système', text: `La guilde passe au niveau ${s.guild.level} !`, at: Date.now(), system: true });
  }
}

/** Simulation de la vie de la guilde (dons reçus, invités qui acceptent, nouveaux membres). */
export function tickGuild(s: GameState, now: number) {
  const g = s.guild;
  if (!g) return;
  const rng = new Rng(Math.floor(now / 5000) ^ hashString(g.id));
  // renforts reçus progressivement
  if (g.requestAt) {
    const cap = portalCapacity(s);
    const have = housingOf(s.army.guildTroops);
    const bots = g.members.filter(m => m.bot);
    if (have >= cap || !bots.length) g.requestAt = have >= cap ? undefined : g.requestAt;
    else if (now - g.requestAt > 4000 && rng.chance(0.5)) {
      const cl = citadelLevel(s);
      const pool = Object.values(UNITS).filter(u => u.building === 'barracks' && u.unlockLevel <= Math.min(12, cl + 1) && u.housing <= cap - have);
      if (pool.length) {
        const u = rng.pick(pool);
        s.army.guildTroops[u.id] = (s.army.guildTroops[u.id] ?? 0) + 1;
        const donor = rng.pick(bots);
        g.chat.push({ from: 'Système', text: `${donor.name} vous a donné : ${u.name}.`, at: now, system: true });
      }
    }
  }
  // invitations acceptées
  if (g.invites.length && rng.chance(0.08)) {
    const name = g.invites.shift()!;
    const m = botMember(rng, citadelLevel(s), s.player.trophies); m.name = name;
    if (g.members.length < MAX_MEMBERS) { g.members.push(m); g.chat.push({ from: 'Système', text: `${name} a rejoint la guilde.`, at: now, system: true }); }
  }
  // recrutement spontané dans une guilde créée par le joueur
  if (g.members.length < 12 && rng.chance(0.01)) {
    const m = botMember(rng, citadelLevel(s), s.player.trophies);
    g.members.push(m);
    g.chat.push({ from: 'Système', text: `${m.name} a rejoint la guilde.`, at: now, system: true });
  }
  const me = g.members.find(m => !m.bot);
  if (me) { me.trophies = s.player.trophies; me.citadel = citadelLevel(s); me.name = s.player.name; }
  trimChat(g);
}
