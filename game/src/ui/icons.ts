// Vignettes générées à partir des sprites (cartes de construction, armée, héros).
import { buildingSprite, HEADROOM } from '../render/sprites';
import { drawUnit } from '../render/units';
import { bdef } from '../buildings/defs';
import { TW, TH } from '../render/iso';
import { HEROES } from '../heroes/defs';
import type { Cost, ResKey, Resources } from '../core/types';
import { RES_ICON } from '../core/types';
import { fmt } from '../core/util';
import { h } from './dom';

const cache = new Map<string, string>();

function toImg(key: string, w: number, hgt: number, draw: (c: CanvasRenderingContext2D) => void): HTMLImageElement {
  let url = cache.get(key);
  if (!url) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
    draw(cv.getContext('2d')!);
    url = cv.toDataURL();
    cache.set(key, url);
  }
  const img = new Image(); img.src = url; img.style.maxHeight = '86px'; img.style.maxWidth = '100%'; img.draggable = false;
  return img;
}

export function buildingIcon(type: string, level = 1, skin?: string): HTMLImageElement {
  return toImg(`b:${type}:${level}:${skin ?? ''}`, 150, 120, c => {
    const spr = buildingSprite(type, level, { skin });
    const size = bdef(type).size;
    // recadre sur la partie utile du sprite
    const sw = spr.width, top = Math.max(0, HEADROOM - 40 - size * 18), sh = spr.height - top;
    const k = Math.min(150 / sw, 120 / sh) * (size === 1 ? 0.8 : 1);
    c.drawImage(spr, 0, top, sw, sh, (150 - sw * k) / 2, (120 - sh * k) / 2, sw * k, sh * k);
    void TW; void TH;
  });
}

export function unitIcon(type: string, hero?: string, skinColor?: string, skinAccent?: string): HTMLImageElement {
  return toImg(`u:${type}:${hero ?? ''}:${skinColor ?? ''}`, 80, 80, c => {
    c.translate(40, 66);
    c.scale(1.7, 1.7);
    drawUnit(c, type, 0, 0, 0.3, 0.2, 0, 'att', 1, { hero, skinColor, skinAccent, flying: false });
  });
}
export function heroIcon(id: string, skin?: string) {
  const h0 = HEROES.find(x => x.id === id)!;
  const sk = h0.skins.find(s => s.id === skin) ?? h0.skins[0];
  return unitIcon(id, id, sk.color, sk.accent);
}

export function costView(cost: Cost, have?: Resources): HTMLElement {
  const parts = (Object.keys(cost) as ResKey[]).filter(k => (cost[k] ?? 0) > 0).map(k =>
    h('span', { class: have && have[k] < (cost[k] ?? 0) ? 'no' : '' }, `${RES_ICON[k]} ${fmt(cost[k] ?? 0)}`));
  return h('div', { class: 'cost' }, parts.length ? parts : h('span', null, 'Gratuit'));
}

export const UNIT_EMOJI: Record<string, string> = { soldier: '🗡️', archer: '🏹', scout: '💨', brute: '🪓', engineer: '💣', airship: '🎈', mage: '🔮', priestess: '😇', wyvern: '🐉', assassin: '🥷', golem: '🗿', rider: '🐗', ram: '🐏', catapult: '🪨', phantom: '👻' };
export const BUILDING_EMOJI: Record<string, string> = { citadel: '🏰', builder_hut: '🔨', guild_portal: '🌀', temple: '🏛️', forge: '⚒️', observatory: '🔭', gold_mine: '⛏️', sawmill: '🪚', farm: '🌾', quarry: '💎', generator: '⚡', gold_vault: '🪙', wood_depot: '🪵', energy_cell: '🔋', crystal_vault: '💠', market: '🏪', barracks: '⚔️', army_camp: '⛺', laboratory: '⚗️', academy: '📜', workshop: '⚙️' };
