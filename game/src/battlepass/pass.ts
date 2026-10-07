// ROYAL PASS : 30 paliers, piste gratuite + piste premium.
import type { GameState } from '../core/state';
import { fail, ok, type ActionResult, type Resources } from '../core/types';
import { currentSeason } from '../events/events';
import { gain } from '../resources/economy';
import { citadelLevel } from '../village/query';

export const PASS_TIERS = 30;
export const XP_PER_TIER = 400;
export const PASS_CRYSTAL_PRICE = 800;

export type Reward =
  | { kind: 'crystals'; amount: number }
  | { kind: 'resource'; res: keyof Resources; amount: number } // amount = multiplicateur × CL²
  | { kind: 'cosmetic'; id: string; name: string; type: 'skin' | 'decoration' | 'emote' | 'effect' | 'theme' };

export interface PassTier { tier: number; free: Reward; premium: Reward }

const COSMETICS: Record<string, { name: string; type: 'skin' | 'decoration' | 'emote' | 'effect' | 'theme' }> = {
  emote_cheer: { name: 'Emote « Hourra ! »', type: 'emote' },
  emote_laugh: { name: 'Emote « Ha ha ! »', type: 'emote' },
  emote_crown: { name: 'Emote « Couronne »', type: 'emote' },
  fx_sparkle: { name: 'Effet de déploiement : Étincelles', type: 'effect' },
  fx_embers: { name: 'Effet de déploiement : Braises', type: 'effect' },
  fx_frost: { name: 'Effet de déploiement : Givre', type: 'effect' },
  deco_throne: { name: 'Trône de saison', type: 'decoration' },
  deco_pumpkin: { name: 'Lanterne-citrouille', type: 'decoration' },
  deco_snowman: { name: 'Bonhomme de neige', type: 'decoration' },
  citadel_obsidian: { name: 'Citadelle d\'obsidienne', type: 'skin' },
  citadel_jade: { name: 'Citadelle de jade', type: 'skin' },
  arkon_frost: { name: 'Arkon – Jarl du Givre', type: 'skin' },
  lyra_sun: { name: 'Lyra – Héraut solaire', type: 'skin' },
  theme_winter: { name: 'Thème : Hiver éternel', type: 'theme' },
  theme_autumn: { name: 'Thème : Automne doré', type: 'theme' },
};
export function cosmeticName(id: string) { return COSMETICS[id]?.name ?? id; }
const cos = (id: string): Reward => ({ kind: 'cosmetic', id, ...COSMETICS[id] });

export function passTiers(): PassTier[] {
  const out: PassTier[] = [];
  const premiumSpecial: Record<number, string> = { 1: 'fx_sparkle', 5: 'emote_crown', 10: 'citadel_jade', 15: 'theme_autumn', 20: 'fx_embers', 25: 'arkon_frost', 30: 'citadel_obsidian' };
  const freeSpecial: Record<number, string> = { 8: 'emote_cheer', 16: 'deco_pumpkin', 24: 'deco_snowman', 30: 'deco_throne' };
  for (let t = 1; t <= PASS_TIERS; t++) {
    const free: Reward = freeSpecial[t] ? cos(freeSpecial[t]) : t % 3 === 0 ? { kind: 'crystals', amount: 10 } : { kind: 'resource', res: t % 2 ? 'gold' : 'wood', amount: 120 };
    const premium: Reward = premiumSpecial[t] ? cos(premiumSpecial[t]) : t % 4 === 0 ? { kind: 'crystals', amount: 40 } : t % 4 === 2 ? { kind: 'resource', res: 'energy', amount: 15 } : { kind: 'resource', res: t % 2 ? 'gold' : 'wood', amount: 300 };
    out.push({ tier: t, free, premium });
  }
  // palier 12 et 22 premium : apparences/emotes supplémentaires
  out[11].premium = cos('emote_laugh');
  out[21].premium = cos('fx_frost');
  out[17].premium = cos('lyra_sun');
  out[27].premium = cos('theme_winter');
  return out;
}

export function passTier(s: GameState): number { return Math.min(PASS_TIERS, Math.floor(s.pass.xp / XP_PER_TIER)); }

/** Réinitialise le pass au changement de saison. */
export function syncSeason(s: GameState, now: number) {
  const idx = currentSeason(now).index;
  if (s.pass.season !== idx) s.pass = { season: idx, xp: 0, premium: false, claimedFree: [], claimedPremium: [] };
}

export function addPassXp(s: GameState, xp: number) { s.pass.xp += Math.max(0, Math.floor(xp)); }

export function grantReward(s: GameState, r: Reward): string {
  switch (r.kind) {
    case 'crystals': s.resources.crystals += r.amount; return `💎 +${r.amount}`;
    case 'resource': {
      const cl = citadelLevel(s);
      const g = gain(s, { [r.res]: r.amount * cl * cl });
      return `+${Math.floor(g[r.res] ?? 0)} ${r.res}`;
    }
    case 'cosmetic':
      if (!s.inventory.cosmetics.includes(r.id)) s.inventory.cosmetics.push(r.id);
      if (r.type === 'emote' && !s.inventory.emotes.includes(r.id)) s.inventory.emotes.push(r.id);
      if (r.type === 'effect' && !s.inventory.effects.includes(r.id)) s.inventory.effects.push(r.id);
      return r.name;
  }
}

export function claimTier(s: GameState, tier: number, track: 'free' | 'premium'): ActionResult<string> {
  if (!Number.isInteger(tier) || tier < 1 || tier > PASS_TIERS) return fail('Palier invalide');
  if (track !== 'free' && track !== 'premium') return fail('Piste invalide');
  if (passTier(s) < tier) return fail('Palier non atteint');
  const list = track === 'free' ? s.pass.claimedFree : s.pass.claimedPremium;
  if (list.includes(tier)) return fail('Déjà récupéré');
  if (track === 'premium' && !s.pass.premium) return fail('Royal Pass premium requis');
  list.push(tier);
  const def = passTiers()[tier - 1];
  return ok(grantReward(s, track === 'free' ? def.free : def.premium));
}

export function buyPassWithCrystals(s: GameState): ActionResult {
  if (s.pass.premium) return fail('Déjà actif');
  if (s.resources.crystals < PASS_CRYSTAL_PRICE) return fail('Cristaux insuffisants');
  s.resources.crystals -= PASS_CRYSTAL_PRICE;
  s.pass.premium = true;
  return ok();
}
