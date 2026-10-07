// Carte du monde : régions à découvrir, villages, gisements, événements.
import type { GameState } from '../core/state';
import { fail, ok, type ActionResult, type Resources } from '../core/types';
import { Rng } from '../core/rng';
import { CAMPAIGN, REGIONS } from '../campaign/campaign';
import { randomLordName } from '../campaign/basegen';
import { citadelLevel, bestLevel } from '../village/query';
import { gain } from '../resources/economy';
import { currentEvent } from '../events/events';

export interface RegionDef { id: string; name: string; x: number; y: number; color: string; biome: string; campaign: number[] }
export const WORLD_REGIONS: RegionDef[] = [
  { id: 'vale', name: REGIONS[0], x: 0.2, y: 0.72, color: '#7cb342', biome: 'prairie', campaign: [1, 2, 3, 4, 5] },
  { id: 'marsh', name: REGIONS[1], x: 0.42, y: 0.8, color: '#558b2f', biome: 'marais', campaign: [6, 7, 8, 9, 10] },
  { id: 'frost', name: REGIONS[2], x: 0.25, y: 0.3, color: '#90caf9', biome: 'neige', campaign: [11, 12, 13, 14, 15] },
  { id: 'amber', name: REGIONS[3], x: 0.62, y: 0.58, color: '#ffb74d', biome: 'désert', campaign: [16, 17, 18, 19, 20] },
  { id: 'ember', name: REGIONS[4], x: 0.8, y: 0.3, color: '#e64a19', biome: 'volcan', campaign: [21, 22, 23, 24, 25] },
  { id: 'crown', name: REGIONS[5], x: 0.55, y: 0.14, color: '#ce93d8', biome: 'céleste', campaign: [26, 27, 28, 29, 30] },
  { id: 'ruins', name: 'Ruines Anciennes', x: 0.82, y: 0.78, color: '#a1887f', biome: 'ruines', campaign: [] },
];

export interface WorldSite { id: string; region: string; kind: 'resource' | 'village' | 'campaign' | 'event'; name: string; x: number; y: number; campaign?: number; res?: keyof Resources; seed?: number; citadel?: number }

export function regionDiscovered(s: GameState, id: string, now: number): boolean {
  if (id === 'vale') return true;
  if (id === 'ruins') return currentEvent(now).event.id === 'ancient_war' || bestLevel(s, 'observatory') >= 3;
  const r = WORLD_REGIONS.find(r => r.id === id)!;
  const prevLast = r.campaign[0] - 1;
  return (s.campaign.stars[prevLast] ?? 0) > 0 || bestLevel(s, 'observatory') >= WORLD_REGIONS.indexOf(r);
}

export function worldSites(s: GameState, now: number): WorldSite[] {
  const out: WorldSite[] = [];
  const cl = citadelLevel(s);
  for (const r of WORLD_REGIONS) {
    const rng = new Rng(r.id.length * 7777 + r.x * 1000);
    r.campaign.forEach((c, i) => out.push({ id: 'c' + c, region: r.id, kind: 'campaign', name: CAMPAIGN[c - 1].name, campaign: c, x: r.x + Math.cos(i * 1.3) * 0.07, y: r.y + Math.sin(i * 1.3) * 0.06 }));
    for (let i = 0; i < 2; i++) {
      const res: keyof Resources = (['gold', 'wood', 'energy'] as const)[(i + r.id.length) % 3];
      out.push({ id: `${r.id}_res${i}`, region: r.id, kind: 'resource', res, name: res === 'gold' ? 'Filon d\'or' : res === 'wood' ? 'Forêt ancienne' : 'Source tellurique', x: r.x + rng.range(-0.1, 0.1), y: r.y + rng.range(-0.1, 0.1) });
    }
    for (let i = 0; i < 2; i++) {
      const seed = (r.id.length * 31 + i * 977 + Math.floor(now / 86400000)) >>> 0;
      out.push({ id: `${r.id}_vil${i}`, region: r.id, kind: 'village', name: 'Village de ' + randomLordName(new Rng(seed)), seed, citadel: Math.max(1, Math.min(15, cl + i - (r.id === 'vale' ? 1 : 0))), x: r.x + rng.range(-0.11, 0.11), y: r.y + rng.range(-0.1, 0.1) });
    }
  }
  if (currentEvent(now).event.id === 'ancient_war') {
    const r = WORLD_REGIONS.find(x => x.id === 'ruins')!;
    for (let i = 0; i < 3; i++) out.push({ id: `ruins_${i}`, region: 'ruins', kind: 'event', name: ['Colosse oublié', 'Sanctuaire englouti', 'Nécropole des rois'][i], seed: 5000 + i + Math.floor(now / 86400000), citadel: Math.min(15, cl + 1 + i), x: r.x + (i - 1) * 0.06, y: r.y + (i % 2) * 0.05 });
  }
  return out;
}

export const SITE_COOLDOWN = 8 * 3600000;
export function siteReady(s: GameState, siteId: string, now: number): number {
  const last = s.world.claimedSites[siteId] ?? 0;
  return Math.max(0, last + SITE_COOLDOWN - now);
}
export function claimSite(s: GameState, site: WorldSite, now: number): ActionResult<Partial<Resources>> {
  if (site.kind !== 'resource' || !site.res) return fail('Rien à récolter');
  if (!regionDiscovered(s, site.region, now)) return fail('Région inexplorée');
  if (siteReady(s, site.id, now) > 0) return fail('Le gisement se régénère');
  const cl = citadelLevel(s);
  const amount = site.res === 'energy' ? (cl >= 6 ? 150 * cl * cl : 0) : 600 * cl * cl;
  if (!amount) return fail('Requiert la Citadelle niveau 6');
  s.world.claimedSites[site.id] = now;
  const g = gain(s, { [site.res]: amount });
  if (!s.world.discovered.includes(site.region)) s.world.discovered.push(site.region);
  return ok(g);
}
