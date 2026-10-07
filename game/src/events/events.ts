// Calendrier des événements et des saisons (piloté par la date, surchargé par le serveur si en ligne).
import type { ResKey } from '../core/types';

export type EventId = 'festival' | 'storm' | 'invasion' | 'ancient_war';
export interface GameEvent {
  id: EventId; name: string; icon: string; desc: string; color: string;
  production: Partial<Record<ResKey, number>>; buildCost: number; lootBonus: number;
}

export const EVENTS: Record<EventId, GameEvent> = {
  festival: { id: 'festival', name: 'Festival des Moissons', icon: '🎉', color: '#ffb300', desc: 'Bonus économiques : production +50 %, constructions -15 %.', production: { gold: 1.5, wood: 1.5, energy: 1.25 }, buildCost: 0.85, lootBonus: 0 },
  storm: { id: 'storm', name: 'Tempête des Ombres', icon: '⛈️', color: '#5c6bc0', desc: 'Les bâtiments produisent différemment : or -30 %, énergie ×2, bois +20 %.', production: { gold: 0.7, wood: 1.2, energy: 2 }, buildCost: 1, lootBonus: 0 },
  invasion: { id: 'invasion', name: 'Invasion Sauvage', icon: '👹', color: '#c62828', desc: 'Des hordes de monstres attaquent les villages ! Repoussez-les pour des récompenses.', production: {}, buildCost: 1, lootBonus: 0.1 },
  ancient_war: { id: 'ancient_war', name: 'Guerre Ancienne', icon: '🗿', color: '#8d6e63', desc: 'La carte des Ruines Anciennes s\'ouvre : bases légendaires et butin +25 %.', production: {}, buildCost: 1, lootBonus: 0.25 },
};

const DAY = 86400000;
const ROTATION: EventId[] = ['festival', 'festival', 'storm', 'storm', 'invasion', 'invasion', 'ancient_war', 'ancient_war'];
export const SEASON_EPOCH = Date.UTC(2026, 0, 5);
export const SEASON_DAYS = 28;

export function dayIndex(now: number): number { return Math.floor(now / DAY); }

let serverOverride: { id: EventId; endAt: number } | null = null;
export function setServerEvent(e: { id: EventId; endAt: number } | null) { serverOverride = e; }

export function currentEvent(now: number): { event: GameEvent; endsAt: number } {
  if (serverOverride && serverOverride.endAt > now) return { event: EVENTS[serverOverride.id], endsAt: serverOverride.endAt };
  const d = dayIndex(now);
  const id = ROTATION[((d % ROTATION.length) + ROTATION.length) % ROTATION.length];
  let end = d + 1;
  while (ROTATION[end % ROTATION.length] === id) end++;
  return { event: EVENTS[id], endsAt: end * DAY };
}
export function upcomingEvents(now: number, n = 4): { event: GameEvent; startsAt: number }[] {
  const out: { event: GameEvent; startsAt: number }[] = [];
  let t = currentEvent(now).endsAt;
  while (out.length < n) { const e = currentEvent(t); out.push({ event: e.event, startsAt: t }); t = e.endsAt; }
  return out;
}

export function eventModifiers(now: number) {
  const e = currentEvent(now).event;
  return { production: e.production, buildCost: e.buildCost, lootBonus: e.lootBonus, id: e.id };
}

// ───── Saisons ─────
export interface Season { index: number; name: string; theme: string; startsAt: number; endsAt: number; unit: string; color: string }
const SEASON_THEMES = [
  { name: 'Saison des Brumes', theme: 'mist', unit: 'phantom', color: '#80cbc4' },
  { name: 'Saison des Braises', theme: 'ember', unit: 'phantom', color: '#ff7043' },
  { name: 'Saison du Givre', theme: 'frost', unit: 'phantom', color: '#81d4fa' },
  { name: 'Saison des Floraisons', theme: 'bloom', unit: 'phantom', color: '#f48fb1' },
];
export function currentSeason(now: number): Season {
  const idx = Math.max(0, Math.floor((now - SEASON_EPOCH) / (SEASON_DAYS * DAY)));
  const t = SEASON_THEMES[idx % SEASON_THEMES.length];
  const startsAt = SEASON_EPOCH + idx * SEASON_DAYS * DAY;
  return { index: idx + 1, ...t, startsAt, endsAt: startsAt + SEASON_DAYS * DAY };
}
