// Sprites de bâtiments dessinés procéduralement (style 2,5D original de KINGDOMS),
// mis en cache dans des canvas hors-écran : un seul drawImage par bâtiment.
import { TW, TH } from './iso';
import { shade, rgba } from './color';
import { bdef } from '../buildings/defs';

export const HEADROOM = 210;

type Ctx = CanvasRenderingContext2D;

export class G {
  constructor(public c: Ctx) {}
  pt(cx: number, cy: number, u: number, v: number, h = 0) { return [cx + (u - v) * TW / 2, cy + (u + v) * TH / 2 - h] as const; }
  poly(pts: (readonly [number, number])[], fill: string, stroke?: string) {
    const c = this.c; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath(); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  /** Prisme iso : (cx,cy) centre au sol, w/d en cases, h en pixels, base surélevée de z. */
  prism(cx: number, cy: number, w: number, d: number, h: number, color: string, z = 0, outline = true) {
    const P = (u: number, v: number, hh: number) => this.pt(cx, cy, u, v, hh + z);
    const a = w / 2, b = d / 2;
    const ol = outline ? 'rgba(0,0,0,0.25)' : undefined;
    this.poly([P(-a, b, 0), P(a, b, 0), P(a, b, h), P(-a, b, h)], shade(color, -0.12), ol);
    this.poly([P(a, -b, 0), P(a, b, 0), P(a, b, h), P(a, -b, h)], shade(color, -0.32), ol);
    this.poly([P(-a, -b, h), P(a, -b, h), P(a, b, h), P(-a, b, h)], shade(color, 0.12), ol);
  }
  pyramid(cx: number, cy: number, w: number, d: number, h: number, rh: number, color: string) {
    const a = w / 2, b = d / 2;
    const apex = this.pt(cx, cy, 0, 0, h + rh);
    this.poly([this.pt(cx, cy, -a, b, h), this.pt(cx, cy, a, b, h), apex], shade(color, -0.05), 'rgba(0,0,0,0.25)');
    this.poly([this.pt(cx, cy, a, -b, h), this.pt(cx, cy, a, b, h), apex], shade(color, -0.3), 'rgba(0,0,0,0.25)');
  }
  /** Toit à deux pans orienté le long de l'axe u. */
  gable(cx: number, cy: number, w: number, d: number, h: number, rh: number, color: string) {
    const a = w / 2 + 0.08, b = d / 2 + 0.08;
    const r1 = this.pt(cx, cy, -a, 0, h + rh), r2 = this.pt(cx, cy, a, 0, h + rh);
    this.poly([this.pt(cx, cy, -a, b, h), this.pt(cx, cy, a, b, h), r2, r1], shade(color, -0.02), 'rgba(0,0,0,0.3)');
    this.poly([this.pt(cx, cy, a, -b, h), this.pt(cx, cy, a, b, h), r2], shade(color, -0.35), 'rgba(0,0,0,0.3)');
    // tuiles
    const c = this.c; c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      const p1 = this.pt(cx, cy, -a, b * (1 - t), h + rh * t), p2 = this.pt(cx, cy, a, b * (1 - t), h + rh * t);
      c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke();
    }
  }
  cylinder(cx: number, cy: number, r: number, h: number, color: string, z = 0) {
    const c = this.c;
    const rx = r * TW / 2 * 1.42, ry = r * TH / 2 * 1.42;
    const y0 = cy - z, y1 = cy - z - h;
    const g = c.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, shade(color, -0.05)); g.addColorStop(0.55, shade(color, -0.2)); g.addColorStop(1, shade(color, -0.45));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(cx, y0, rx, ry, 0, 0, Math.PI); c.lineTo(cx - rx, y1); c.ellipse(cx, y1, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.stroke();
    c.fillStyle = shade(color, 0.15);
    c.beginPath(); c.ellipse(cx, y1, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  cone(cx: number, cy: number, r: number, z: number, h: number, color: string) {
    const c = this.c;
    const rx = r * TW / 2 * 1.42, ry = r * TH / 2 * 1.42;
    const g = c.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, shade(color, 0.05)); g.addColorStop(1, shade(color, -0.4));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(cx, cy - z, rx, ry, 0, 0, Math.PI); c.lineTo(cx, cy - z - h); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.stroke();
  }
  dome(cx: number, cy: number, r: number, z: number, color: string, hScale = 1) {
    const c = this.c;
    const rx = r * TW / 2 * 1.42, ry = rx * hScale;
    const g = c.createRadialGradient(cx - rx * 0.3, cy - z - ry * 0.6, 2, cx, cy - z, rx * 1.2);
    g.addColorStop(0, shade(color, 0.45)); g.addColorStop(1, shade(color, -0.35));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(cx, cy - z, rx, ry, 0, Math.PI, 0); c.ellipse(cx, cy - z, rx, rx * 0.5 * TH / TW * 1.4, 0, 0, Math.PI); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.stroke();
  }
  circle(x: number, y: number, r: number, fill: string, stroke?: string) {
    const c = this.c; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  flag(x: number, y: number, h: number, color: string) {
    const c = this.c;
    c.strokeStyle = '#4e342e'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
    this.poly([[x, y - h], [x + 14, y - h + 4], [x, y - h + 9]], color, 'rgba(0,0,0,0.3)');
  }
}

/** Couleur d'ornement selon le niveau : bronze → argent → or → cristal. */
export function tierColor(level: number, max: number): string {
  const t = level / Math.max(1, max);
  if (t < 0.3) return '#b07a45';
  if (t < 0.55) return '#b8c4cc';
  if (t < 0.8) return '#f4c542';
  return '#c08bff';
}

const cache = new Map<string, HTMLCanvasElement>();
export function clearSpriteCache() { cache.clear(); }

export interface SpriteOpts { skin?: string; construction?: boolean; theme?: string }

export function buildingSprite(type: string, level: number, o: SpriteOpts = {}): HTMLCanvasElement {
  const key = `${type}|${level}|${o.skin ?? ''}|${o.construction ? 1 : 0}`;
  let cv = cache.get(key);
  if (cv) return cv;
  const d = bdef(type);
  const s = d.size;
  cv = document.createElement('canvas');
  cv.width = s * TW + 8;
  cv.height = s * TH + HEADROOM;
  const c = cv.getContext('2d')!;
  c.translate(4, 0);
  const g = new G(c);
  const cx = (s * TW) / 2, cy = HEADROOM + (s * TH) / 2; // centre au sol
  drawBuilding(g, type, level, s, cx, cy, o);
  if (o.construction) drawScaffold(g, s, cx, cy);
  cache.set(key, cv);
  return cv;
}

function base(g: G, s: number, cx: number, cy: number, color = '#9e9e9e', inset = 0.15, h = 5) {
  g.prism(cx, cy, s - inset * 2, s - inset * 2, h, color);
}

function drawScaffold(g: G, s: number, cx: number, cy: number) {
  const c = g.c;
  c.strokeStyle = '#8d6e63'; c.lineWidth = 2;
  for (const [u, v] of [[-1, 1], [1, 1], [1, -1]] as const) {
    const p0 = g.pt(cx, cy, u * (s / 2 - 0.25), v * (s / 2 - 0.25), 0), p1 = g.pt(cx, cy, u * (s / 2 - 0.25), v * (s / 2 - 0.25), 26 + s * 6);
    c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
  }
  for (let h = 10; h < 26 + s * 6; h += 12) {
    const a = g.pt(cx, cy, -(s / 2 - 0.25), s / 2 - 0.25, h), b = g.pt(cx, cy, s / 2 - 0.25, s / 2 - 0.25, h), e = g.pt(cx, cy, s / 2 - 0.25, -(s / 2 - 0.25), h);
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.stroke();
  }
  // panneau "en travaux"
  g.poly([g.pt(cx, cy, 0.2, s / 2, 8), g.pt(cx, cy, 0.9, s / 2, 8), g.pt(cx, cy, 0.9, s / 2, 20), g.pt(cx, cy, 0.2, s / 2, 20)], '#ffca28', 'rgba(0,0,0,0.4)');
}

export const CITADEL_SKIN_COLORS: Record<string, string> = { citadel_jade: '#26a69a', citadel_obsidian: '#37474f', citadel_sakura: '#f48fb1' };

function drawBuilding(g: G, type: string, level: number, s: number, cx: number, cy: number, o: SpriteOpts) {
  const d = bdef(type);
  const max = d.levels.length;
  const trim = tierColor(level, max);
  const L = Math.max(1, level);
  switch (type) {
    case 'citadel': {
      const roof = o.skin ? CITADEL_SKIN_COLORS[o.skin] ?? '#c62828' : L >= 13 ? '#7b1fa2' : L >= 10 ? '#1565c0' : L >= 6 ? '#c62828' : '#d84315';
      const stone = L >= 13 ? '#5e5a6e' : L >= 8 ? '#a0a4ac' : L >= 4 ? '#bdb3a0' : '#c8a27a';
      base(g, s, cx, cy, '#8d8d8d', 0.05, 6);
      const h = 34 + L * 2.6;
      g.prism(cx, cy, 2.4, 2.4, h, stone, 6);
      // créneaux
      for (let i = -1; i <= 1; i += 0.5) { g.prism(...g.pt(cx, cy, i, 1.2, 0) as [number, number], 0.25, 0.15, 7, stone, h + 6); g.prism(...g.pt(cx, cy, 1.2, i, 0) as [number, number], 0.15, 0.25, 7, stone, h + 6); }
      g.pyramid(cx, cy, 2.0, 2.0, h + 6, 40 + L * 2, roof);
      // tours d'angle (apparaissent avec le niveau)
      const towers = L >= 5 ? 4 : L >= 3 ? 2 : 0;
      const corners: [number, number][] = [[-1.45, 1.45], [1.45, 1.45], [1.45, -1.45], [-1.45, -1.45]];
      for (let i = 0; i < towers; i++) {
        const [u, v] = corners[[3, 1, 0, 2][i]];
        const [px, py] = g.pt(cx, cy, u, v);
        g.cylinder(px, py, 0.45, h * 0.8, stone, 6);
        g.cone(px, py, 0.55, h * 0.8 + 6, 22, roof);
      }
      // porte + ornement
      const door = [g.pt(cx, cy, -0.35, 1.2, 6), g.pt(cx, cy, 0.35, 1.2, 6), g.pt(cx, cy, 0.35, 1.2, 26), g.pt(cx, cy, -0.35, 1.2, 26)];
      g.poly(door, '#4e342e');
      g.poly([g.pt(cx, cy, -0.5, 1.21, h * 0.6), g.pt(cx, cy, 0.5, 1.21, h * 0.6), g.pt(cx, cy, 0.5, 1.21, h * 0.6 + 5), g.pt(cx, cy, -0.5, 1.21, h * 0.6 + 5)], trim);
      const top = g.pt(cx, cy, 0, 0, h + 46 + L * 2);
      g.flag(top[0], top[1], 18, L >= 10 ? '#ffd54f' : '#e53935');
      if (L >= 12) { g.circle(top[0], top[1] - 2, 5, '#e1bee7', '#7b1fa2'); }
      break;
    }
    case 'builder_hut':
      base(g, s, cx, cy, '#a1887f', 0.2, 3);
      g.prism(cx, cy, 1.2, 1.2, 16, '#d7b98e', 3);
      g.gable(cx, cy, 1.2, 1.2, 19, 14, '#c0632f');
      g.circle(...(g.pt(cx, cy, 0.7, 0.7, 6) as [number, number]), 3, '#795548');
      break;
    case 'guild_portal': {
      base(g, s, cx, cy, '#7e7e8c', 0.1, 5);
      g.prism(...(g.pt(cx, cy, -0.9, 0) as [number, number]), 0.5, 0.6, 46 + L * 2, '#9fa0b5', 5);
      g.prism(...(g.pt(cx, cy, 0.9, 0) as [number, number]), 0.5, 0.6, 46 + L * 2, '#9fa0b5', 5);
      g.prism(cx, cy, 2.3, 0.6, 9, '#8a8ba3', 50 + L * 2);
      const [px, py] = g.pt(cx, cy, 0, 0, 30 + L);
      const c = g.c; const gr = c.createRadialGradient(px, py, 2, px, py, 24);
      gr.addColorStop(0, '#f3e5ff'); gr.addColorStop(0.5, '#9c6bff'); gr.addColorStop(1, 'rgba(90,40,200,0.1)');
      c.fillStyle = gr; c.beginPath(); c.ellipse(px, py, 22, 22 + L, 0, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'temple': {
      base(g, s, cx, cy, '#cfc6b0', 0.05, 8);
      g.prism(cx, cy, 3, 3, 6, '#e8e0c8', 8);
      for (const u of [-1.2, -0.4, 0.4, 1.2]) { const [px, py] = g.pt(cx, cy, u, 1.2, 0); g.cylinder(px, py, 0.16, 34, '#f5f0e1', 14); }
      for (const v of [-0.4, 0.4]) { const [px, py] = g.pt(cx, cy, 1.2, v, 0); g.cylinder(px, py, 0.16, 34, '#f5f0e1', 14); }
      g.prism(cx, cy, 3, 3, 6, '#e8e0c8', 48);
      g.dome(cx, cy, 1.1, 54, L >= 3 ? '#ffd54f' : '#90caf9', 0.9);
      g.circle(...(g.pt(cx, cy, 0, 0, 82) as [number, number]), 4, trim);
      break;
    }
    case 'forge': {
      base(g, s, cx, cy, '#6d6d6d', 0.1, 4);
      g.prism(cx, cy, 2.4, 2.2, 22, '#5d4037', 4);
      g.gable(cx, cy, 2.4, 2.2, 26, 14, '#3e2723');
      const [px, py] = g.pt(cx, cy, 0.7, -0.6);
      g.prism(px, py, 0.5, 0.5, 52, '#616161', 0);
      const c = g.c; const [fx, fy] = g.pt(cx, cy, 0, 1.12, 14);
      const gr = c.createRadialGradient(fx, fy, 1, fx, fy, 12); gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.5, '#ff7b3a'); gr.addColorStop(1, 'rgba(255,80,0,0)');
      c.fillStyle = gr; c.fillRect(fx - 14, fy - 12, 28, 24);
      g.prism(...(g.pt(cx, cy, -0.6, 1.3) as [number, number]), 0.5, 0.3, 8, '#424242', 4); // enclume
      break;
    }
    case 'observatory': {
      base(g, s, cx, cy, '#90a4ae', 0.1, 5);
      g.cylinder(cx, cy, 1.0, 38 + L * 3, '#cfd8dc', 5);
      g.dome(cx, cy, 1.0, 43 + L * 3, '#5c6bc0', 0.85);
      const c = g.c; const [tx, ty] = g.pt(cx, cy, 0, 0, 58 + L * 3);
      c.strokeStyle = '#ffd54f'; c.lineWidth = 5; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + 20, ty - 14); c.stroke();
      break;
    }
    case 'gold_mine': case 'quarry': {
      const gold = type === 'gold_mine';
      base(g, s, cx, cy, '#8d7b68', 0.1, 4);
      // monticule rocheux
      g.prism(cx, cy, 2.4, 2.4, 10, '#8a7f73', 4);
      g.pyramid(cx, cy, 2.4, 2.4, 14, 16 + L, '#9e9286');
      // entrée de mine
      g.poly([g.pt(cx, cy, -0.4, 1.21, 4), g.pt(cx, cy, 0.4, 1.21, 4), g.pt(cx, cy, 0.4, 1.21, 20), g.pt(cx, cy, -0.4, 1.21, 20)], '#2b2118');
      g.poly([g.pt(cx, cy, -0.5, 1.22, 20), g.pt(cx, cy, 0.5, 1.22, 20), g.pt(cx, cy, 0.5, 1.22, 24), g.pt(cx, cy, -0.5, 1.22, 24)], '#8d6e63');
      // pépites / cristaux
      const n = 3 + Math.min(6, Math.floor(L / 2));
      for (let i = 0; i < n; i++) {
        const u = -1 + (i % 3) * 0.9, v = -1 + Math.floor(i / 3) * 0.6;
        const [px, py] = g.pt(cx, cy, u, v, 18 + (i % 2) * 6);
        if (gold) g.circle(px, py, 3 + (L > 8 ? 1 : 0), '#ffd54f', '#c49000');
        else g.poly([[px, py - 12], [px + 4, py], [px, py + 3], [px - 4, py]], '#b388ff', '#6a1b9a');
      }
      // wagonnet
      g.prism(...(g.pt(cx, cy, 0.9, 1.0) as [number, number]), 0.6, 0.45, 8, '#6d4c41', 4);
      g.circle(...(g.pt(cx, cy, 0.9, 1.0, 12) as [number, number]), 3, gold ? '#ffd54f' : '#ce93d8');
      break;
    }
    case 'sawmill': {
      base(g, s, cx, cy, '#a1887f', 0.1, 4);
      g.prism(cx, cy, 1.8, 2.2, 18 + L, '#a0703c', 4);
      g.gable(cx, cy, 1.8, 2.2, 22 + L, 12, '#6d4c41');
      // rondins
      for (let i = 0; i < 3 + Math.floor(L / 4); i++) { const [px, py] = g.pt(cx, cy, 1.0 + (i % 2) * 0.05, -0.9 + i * 0.35, 6 + (i % 2) * 5); g.circle(px, py, 4, '#c8a27a', '#6d4c41'); }
      // lame de scie
      const [sx, sy] = g.pt(cx, cy, -0.3, 1.15, 14);
      g.circle(sx, sy, 7, '#cfd8dc', '#607d8b'); g.circle(sx, sy, 2, '#455a64');
      break;
    }
    case 'farm': {
      base(g, s, cx, cy, '#8d6e63', 0.05, 2);
      for (let i = 0; i < 5; i++) {
        const v = -1.2 + i * 0.5;
        g.prism(...(g.pt(cx, cy, -0.3, v) as [number, number]), 1.9, 0.3, 4, i % 2 ? '#c0ca33' : '#7cb342', 2);
      }
      const [bx, by] = g.pt(cx, cy, 1.0, -0.9);
      g.prism(bx, by, 0.9, 0.9, 16, '#c62828', 2);
      g.gable(bx, by, 0.9, 0.9, 18, 10, '#5d4037');
      break;
    }
    case 'generator': {
      base(g, s, cx, cy, '#607d8b', 0.1, 5);
      g.prism(cx, cy, 2.2, 2.2, 14, '#455a64', 5);
      g.cylinder(cx, cy, 0.5, 30 + L * 2, '#78909c', 19);
      for (let i = 0; i < 4; i++) { const c = g.c; const y = cy - 26 - i * 7; c.strokeStyle = '#4dd0e1'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, y, 15, 6, 0, 0, Math.PI * 2); c.stroke(); }
      const c = g.c; const oy = cy - 52 - L * 2; const gr = c.createRadialGradient(cx, oy, 1, cx, oy, 14);
      gr.addColorStop(0, '#e0f7fa'); gr.addColorStop(0.6, '#26c6da'); gr.addColorStop(1, 'rgba(0,200,255,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(cx, oy, 14, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'gold_vault': case 'wood_depot': case 'energy_cell': {
      const col = type === 'gold_vault' ? '#f2c94c' : type === 'wood_depot' ? '#8b5a2b' : '#4dd0e1';
      base(g, s, cx, cy, '#9e9e9e', 0.1, 5);
      if (type === 'energy_cell') {
        g.cylinder(cx, cy, 1.0, 26 + L * 2, '#b0bec5', 5);
        g.cylinder(cx, cy, 0.75, 8, '#4dd0e1', 31 + L * 2);
        break;
      }
      g.prism(cx, cy, 2.3, 2.3, 18 + L * 1.5, type === 'gold_vault' ? '#a1887f' : '#8d6e63', 5);
      // contenu visible en haut
      g.prism(cx, cy, 1.9, 1.9, 4, col, 23 + L * 1.5);
      for (let i = 0; i < 5; i++) { const [px, py] = g.pt(cx, cy, -0.6 + (i % 3) * 0.6, -0.5 + Math.floor(i / 3) * 0.7, 30 + L * 1.5); g.circle(px, py, 4, shade(col, 0.2), shade(col, -0.4)); }
      g.prism(cx, cy, 2.4, 0.18, 4, trim, 12);
      break;
    }
    case 'crystal_vault':
      base(g, s, cx, cy, '#9e9e9e', 0.1, 4);
      g.prism(cx, cy, 1.4, 1.4, 16, '#7e57c2', 4);
      g.poly([g.pt(cx, cy, 0, 0, 52), g.pt(cx, cy, 0.3, 0.3, 30), g.pt(cx, cy, 0, 0, 20), g.pt(cx, cy, -0.3, 0.3, 30)], '#e1bee7', '#7b1fa2');
      break;
    case 'market': {
      base(g, s, cx, cy, '#bcaaa4', 0.05, 3);
      for (const [u, v, col] of [[-0.6, -0.6, '#ef5350'], [0.6, -0.6, '#42a5f5'], [-0.6, 0.6, '#ffca28'], [0.6, 0.6, '#66bb6a']] as const) {
        const [px, py] = g.pt(cx, cy, u, v);
        g.prism(px, py, 0.8, 0.8, 10, '#8d6e63', 3);
        g.pyramid(px, py, 1.0, 1.0, 16, 10, col);
      }
      break;
    }
    case 'barracks': {
      base(g, s, cx, cy, '#9e9e9e', 0.1, 5);
      g.prism(cx, cy, 2.3, 2.0, 20 + L, '#b0846a', 5);
      g.gable(cx, cy, 2.3, 2.0, 25 + L, 14, L >= 7 ? '#7b1fa2' : '#c62828');
      const [fx, fy] = g.pt(cx, cy, 1.1, 1.0, 26);
      g.flag(fx, fy, 22, '#e53935');
      // épées croisées
      const c = g.c; const [ex, ey] = g.pt(cx, cy, 0, 1.01, 14);
      c.strokeStyle = trim; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - 7, ey - 7); c.lineTo(ex + 7, ey + 7); c.moveTo(ex + 7, ey - 7); c.lineTo(ex - 7, ey + 7); c.stroke();
      break;
    }
    case 'army_camp': {
      // campement au sol : cercle de pierres, feu, tentes
      const c = g.c;
      c.fillStyle = 'rgba(121,85,72,0.35)'; c.beginPath(); c.ellipse(cx, cy, s * TW * 0.4, s * TH * 0.4, 0, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.circle(cx + Math.cos(a) * s * TW * 0.38, cy + Math.sin(a) * s * TH * 0.38, 3, '#9e9e9e', '#616161'); }
      const tents = Math.min(4, 1 + Math.floor(L / 2));
      const spots: [number, number][] = [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]];
      for (let i = 0; i < tents; i++) { const [px, py] = g.pt(cx, cy, spots[i][0], spots[i][1]); g.pyramid(px, py, 0.9, 0.9, 0, 18, i % 2 ? '#d7b98e' : '#c8a27a'); }
      g.circle(cx, cy - 4, 5, '#ff7043'); g.circle(cx, cy - 7, 3, '#ffd54f');
      break;
    }
    case 'laboratory': {
      base(g, s, cx, cy, '#90a4ae', 0.1, 5);
      g.prism(cx, cy, 2.2, 2.2, 22 + L, '#26a69a', 5);
      g.dome(cx, cy, 0.9, 27 + L, '#b2ebf2', 0.8);
      const [px, py] = g.pt(cx, cy, 0, 0, 50 + L);
      g.circle(px, py, 5, '#69f0ae', '#00796b');
      break;
    }
    case 'academy': {
      base(g, s, cx, cy, '#9575cd', 0.15, 5);
      g.cylinder(cx, cy, 0.9, 40 + L * 3, '#7e57c2', 5);
      g.cone(cx, cy, 1.05, 45 + L * 3, 34, '#4527a0');
      const [px, py] = g.pt(cx, cy, 0, 0, 82 + L * 3);
      g.poly([[px, py - 7], [px + 2, py - 2], [px + 7, py], [px + 2, py + 2], [px, py + 7], [px - 2, py + 2], [px - 7, py], [px - 2, py - 2]], '#fff59d');
      break;
    }
    case 'workshop': {
      base(g, s, cx, cy, '#8d8d8d', 0.05, 5);
      g.prism(cx, cy, 3.2, 2.8, 26 + L * 3, '#78909c', 5);
      g.gable(cx, cy, 3.2, 2.8, 31 + L * 3, 18, '#455a64');
      const [gx, gy] = g.pt(cx, cy, 0, 1.41, 20);
      g.circle(gx, gy, 9, '#bdbdbd', '#424242'); g.circle(gx, gy, 3, '#424242');
      break;
    }
    // ───── Défenses : socle statique (tourelle dessinée dynamiquement) ─────
    case 'cannon': case 'sky_launcher': case 'ballista': case 'mortar':
      base(g, s, cx, cy, '#8d8d8d', 0.15, 6);
      g.prism(cx, cy, 2.0, 2.0, 10 + Math.min(10, L), type === 'ballista' ? '#8d6e63' : '#a1a1a1', 6);
      g.prism(cx, cy, 2.05, 0.15, 3, trim, 12 + Math.min(10, L));
      break;
    case 'watchtower': {
      base(g, s, cx, cy, '#8d8d8d', 0.2, 4);
      const h = 50 + L * 2.2;
      const legs: [number, number][] = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
      for (const [u, v] of legs) { const [px, py] = g.pt(cx, cy, u, v); g.prism(px, py, 0.28, 0.28, h, L >= 8 ? '#9e9e9e' : '#8d6e63', 4); }
      g.prism(cx, cy, 1.9, 1.9, 8, L >= 8 ? '#bdbdbd' : '#a1887f', h);
      // cabine des archers (créneaux + meurtrières)
      const cab = L >= 8 ? '#cfd8dc' : '#bc8f62';
      g.prism(cx, cy, 1.5, 1.5, 22, cab, h + 8);
      g.poly([g.pt(cx, cy, -0.25, 0.76, h + 16), g.pt(cx, cy, 0.25, 0.76, h + 16), g.pt(cx, cy, 0.25, 0.76, h + 24), g.pt(cx, cy, -0.25, 0.76, h + 24)], '#3e2723');
      g.poly([g.pt(cx, cy, 0.76, -0.25, h + 16), g.pt(cx, cy, 0.76, 0.25, h + 16), g.pt(cx, cy, 0.76, 0.25, h + 24), g.pt(cx, cy, 0.76, -0.25, h + 24)], '#3e2723');
      g.pyramid(cx, cy, 1.8, 1.8, h + 30, 20, L >= 8 ? '#455a64' : '#8d3b2a');
      g.prism(cx, cy, 1.95, 0.1, 3, trim, h + 6);
      break;
    }
    case 'arcane_spire': {
      base(g, s, cx, cy, '#6a5a8a', 0.1, 5);
      g.prism(cx, cy, 0.9, 0.9, 38 + L * 2, '#5e35b1', 5);
      g.pyramid(cx, cy, 0.9, 0.9, 43 + L * 2, 12, '#311b92');
      break;
    }
    case 'brazier': {
      base(g, s, cx, cy, '#5d4037', 0.1, 5);
      g.cylinder(cx, cy, 0.45, 34 + L * 3, '#424242', 5);
      g.cylinder(cx, cy, 0.8, 8, '#212121', 39 + L * 3);
      break;
    }
    case 'storm_tower': {
      base(g, s, cx, cy, '#546e7a', 0.1, 5);
      g.prism(cx, cy, 1.6, 1.6, 20, '#455a64', 5);
      g.cylinder(cx, cy, 0.4, 50 + L * 4, '#90a4ae', 25);
      for (let i = 0; i < 3; i++) { const c = g.c; const y = cy - 40 - i * 14; c.strokeStyle = '#4fc3f7'; c.lineWidth = 3; c.beginPath(); c.ellipse(cx, y, 18 - i * 3, 7 - i, 0, 0, Math.PI * 2); c.stroke(); }
      break;
    }
    case 'wall': break; // dessiné dynamiquement (connexions)
    // ───── Pièges (visibles uniquement au village) ─────
    case 'bomb': g.circle(cx, cy - 4, 6, '#263238', '#000'); g.circle(cx + 4, cy - 10, 2, '#ff7043'); break;
    case 'spring_trap': g.prism(cx, cy, 0.7, 0.7, 3, '#795548'); g.circle(cx, cy - 6, 4, '#bdbdbd', '#616161'); break;
    case 'land_mine': g.circle(cx, cy - 4, 12, '#37474f', '#000'); g.circle(cx, cy - 6, 5, '#e53935'); break;
    case 'ice_trap': g.poly([[cx, cy - 16], [cx + 6, cy - 4], [cx, cy], [cx - 6, cy - 4]], '#b2ebf2', '#0097a7'); break;
    case 'rune_trap': { const c = g.c; c.strokeStyle = '#ce93d8'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, cy, 34, 17, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(cx, cy, 22, 11, 0, 0, Math.PI * 2); c.stroke(); break; }
    case 'air_trap': g.prism(cx, cy, 0.6, 0.6, 6, '#78909c'); g.poly([[cx, cy - 22], [cx + 3, cy - 8], [cx - 3, cy - 8]], '#cfd8dc'); break;
    // ───── Décorations ─────
    case 'deco_pine': tree(g, cx, cy, '#2e7d32', true); break;
    case 'deco_oak': tree(g, cx, cy, '#43a047', false, 1.6); break;
    case 'deco_flowers': for (let i = 0; i < 7; i++) g.circle(cx + Math.cos(i * 2.4) * 12, cy - 3 + Math.sin(i * 2.4) * 5, 3, ['#ec407a', '#ffee58', '#ab47bc', '#fff'][i % 4]); break;
    case 'deco_lantern': g.prism(cx, cy, 0.15, 0.15, 30, '#424242'); g.circle(cx, cy - 34, 5, '#ffe082', '#ff8f00'); break;
    case 'deco_banner': g.flag(cx, cy, 44, '#c62828'); break;
    case 'deco_fountain': g.cylinder(cx, cy, 1.0, 8, '#b0bec5'); g.cylinder(cx, cy, 0.85, 2, '#4fc3f7', 8); g.cylinder(cx, cy, 0.15, 22, '#cfd8dc', 8); g.circle(cx, cy - 34, 4, '#b3e5fc'); break;
    case 'deco_statue': g.prism(cx, cy, 1.2, 1.2, 10, '#9e9e9e'); g.cylinder(cx, cy, 0.3, 30, '#bdbdbd', 10); g.circle(cx, cy - 46, 7, '#bdbdbd', '#757575'); break;
    case 'deco_crystal_obelisk': g.poly([[cx, cy - 70], [cx + 12, cy - 8], [cx, cy], [cx - 12, cy - 8]], '#b388ff', '#6a1b9a'); g.poly([[cx, cy - 70], [cx + 12, cy - 8], [cx, cy]], '#7c4dff'); break;
    case 'deco_dragon_skull': g.circle(cx, cy - 12, 14, '#efebe9', '#8d6e63'); g.circle(cx - 5, cy - 14, 3, '#3e2723'); g.circle(cx + 5, cy - 14, 3, '#3e2723'); g.poly([[cx - 14, cy - 20], [cx - 24, cy - 36], [cx - 10, cy - 24]], '#d7ccc8'); g.poly([[cx + 14, cy - 20], [cx + 24, cy - 36], [cx + 10, cy - 24]], '#d7ccc8'); break;
    case 'deco_pumpkin': g.circle(cx, cy - 8, 9, '#ff9800', '#e65100'); g.poly([[cx - 3, cy - 10], [cx, cy - 6], [cx + 3, cy - 10]], '#ffe082'); break;
    case 'deco_snowman': g.circle(cx, cy - 8, 9, '#fff', '#b0bec5'); g.circle(cx, cy - 22, 6, '#fff', '#b0bec5'); g.poly([[cx, cy - 22], [cx + 7, cy - 21], [cx, cy - 20]], '#ff7043'); break;
    case 'deco_hero_statue': g.prism(cx, cy, 1.3, 1.3, 12, '#9e9e9e'); g.cylinder(cx, cy, 0.35, 36, '#cfd8dc', 12); g.circle(cx, cy - 54, 8, '#cfd8dc', '#78909c'); g.flag(cx + 10, cy - 40, 26, '#90a4ae'); break;
    case 'deco_monument': g.prism(cx, cy, 2.4, 2.4, 10, '#bdbdbd'); g.prism(cx, cy, 1.6, 1.6, 14, '#e0e0e0', 10); g.prism(cx, cy, 0.6, 0.6, 70, '#ffd54f', 24); g.pyramid(cx, cy, 0.6, 0.6, 94, 16, '#ffb300'); break;
    case 'deco_throne': g.prism(cx, cy, 1.0, 1.0, 10, '#ffd54f'); g.prism(...(g.pt(cx, cy, 0, -0.4) as [number, number]), 1.0, 0.2, 36, '#ffca28', 10); g.circle(cx, cy - 50, 5, '#e53935'); break;
    default:
      g.prism(cx, cy, s - 0.3, s - 0.3, 20, d.color);
  }
}

export function tree(g: G, cx: number, cy: number, color: string, pine: boolean, scale = 1) {
  const c = g.c;
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(cx, cy, 14 * scale, 7 * scale, 0, 0, Math.PI * 2); c.fill();
  g.prism(cx, cy, 0.12 * scale, 0.12 * scale, 12 * scale, '#6d4c41');
  if (pine) {
    for (let i = 0; i < 3; i++) g.cone(cx, cy, (0.55 - i * 0.12) * scale, (10 + i * 12) * scale, 20 * scale, shade(color, i * 0.08));
  } else {
    const gr = c.createRadialGradient(cx - 6 * scale, cy - 32 * scale, 2, cx, cy - 24 * scale, 22 * scale);
    gr.addColorStop(0, shade(color, 0.3)); gr.addColorStop(1, shade(color, -0.3));
    c.fillStyle = gr; c.beginPath(); c.arc(cx, cy - 26 * scale, 17 * scale, 0, Math.PI * 2); c.fill();
  }
}

export function shadowEllipse(c: Ctx, x: number, y: number, rx: number, ry: number, a = 0.22) {
  c.fillStyle = rgba('#000000', a); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}
