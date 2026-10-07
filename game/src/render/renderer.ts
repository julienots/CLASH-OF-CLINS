// Moteur de rendu 2,5D sur Canvas : sol mis en cache, tri en profondeur,
// tourelles animées, eau, végétation, météo, éclairage jour/nuit, niveaux de qualité.
import { Camera, TW, TH, toScreen } from './iso';
import { buildingSprite, HEADROOM, G, tree, shadowEllipse } from './sprites';
import { drawUnit, drawTurret, wallColor } from './units';
import { Particles, PK } from './particles';
import { shade, rgba } from './color';
import { MAP_SIZE } from '../core/state';
import { bdef } from '../buildings/defs';
import { Rng } from '../core/rng';
import type { Quality } from '../core/types';
import { THEMES } from '../shop/catalog';

export interface RBuilding {
  uid: number; type: string; level: number; x: number; y: number; size: number;
  hpFrac?: number; destroyed?: boolean; constructing?: boolean; progress?: number; skin?: string;
  aim?: number; recoil?: number; selected?: boolean; ghost?: 'ok' | 'bad'; frozen?: boolean; stunned?: boolean;
  bubble?: string; label?: string; hidden?: boolean; range?: number; minRange?: number; alpha?: number;
}
export interface RUnit { id: number; type: string; x: number; y: number; face: number; atk: number; team: 'att' | 'def'; hp: number; hero?: string; skinColor?: string; skinAccent?: string; frozen?: boolean; invisible?: boolean; flying?: boolean; shield?: boolean; raged?: boolean }
export interface RShot { fx: number; fy: number; tx: number; ty: number; kind: string; t: number; dur: number; arc: number }
export interface RZone { x: number; y: number; r: number; color: string }

export interface Scene {
  buildings: RBuilding[];
  units: RUnit[];
  shots: RShot[];
  zones: RZone[];
  showGrid: boolean;
  buildArea?: { min: number; max: number };
  forbidden?: Uint8Array | null;
  theme: string;
  weather: 'clear' | 'rain' | 'snow' | 'storm' | 'leaves';
  rubble?: { x: number; y: number; size: number }[];
  deployHint?: boolean;
}

const QUALITY: Record<Quality, { particles: number; shadows: boolean; groundScale: number; weather: number; water: boolean; dprCap: number }> = {
  low: { particles: 250, shadows: false, groundScale: 0.5, weather: 30, water: false, dprCap: 1 },
  medium: { particles: 800, shadows: true, groundScale: 0.75, weather: 90, water: true, dprCap: 1.5 },
  high: { particles: 1500, shadows: true, groundScale: 1, weather: 180, water: true, dprCap: 2.5 },
};

export class Renderer {
  ctx: CanvasRenderingContext2D;
  cam = new Camera();
  fx = new Particles(1500);
  quality: Quality = 'medium';
  private ground: HTMLCanvasElement | null = null;
  private groundKey = '';
  private weatherP: { x: number; y: number; s: number; v: number }[] = [];
  time = 0;
  shake = 0;
  fps = 60;
  drawCalls = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.cam.centerOn(MAP_SIZE / 2, MAP_SIZE / 2);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.fx.setCap(QUALITY[q].particles);
    this.groundKey = '';
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dprCap);
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.cam.vw = w; this.cam.vh = h; this.cam.dpr = dpr;
    const minZ = Math.max(0.3, Math.min(w / (MAP_SIZE * TW * 0.95), h / (MAP_SIZE * TH * 1.05)));
    this.cam.minZoom = minZ;
    if (this.cam.zoom < minZ) this.cam.zoom = minZ;
  }

  private buildGround(theme: string, area?: { min: number; max: number }) {
    const key = theme + (area ? area.min + ':' + area.max : '') + this.quality;
    if (key === this.groundKey && this.ground) return;
    this.groundKey = key;
    const q = QUALITY[this.quality].groundScale;
    const margin = 10;
    const W = (MAP_SIZE + margin * 2) * TW, H = (MAP_SIZE + margin * 2) * TH + 200;
    const cv = this.ground ?? document.createElement('canvas');
    cv.width = Math.round(W * q); cv.height = Math.round(H * q);
    const c = cv.getContext('2d')!;
    c.setTransform(q, 0, 0, q, 0, 0);
    const th = THEMES.find(t => t.id === theme) ?? THEMES[0];
    const ox = W / 2, oy = 100 + margin * TH; // origine (0,0) monde
    c.fillStyle = shade(th.ground, -0.35); c.fillRect(0, 0, W, H);
    const rng = new Rng(7);
    const P = (x: number, y: number) => { const s = toScreen(x, y); return [s.x + ox, s.y + oy] as const; };
    // tuiles
    for (let y = -margin; y < MAP_SIZE + margin; y++) for (let x = -margin; x < MAP_SIZE + margin; x++) {
      const inMap = x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
      const inArea = area && x >= area.min && y >= area.min && x < area.max && y < area.max;
      let col = (x + y) % 2 ? th.ground : th.ground2;
      if (!inMap) col = shade(col, -0.22); else if (area && !inArea) col = shade(col, -0.08);
      const [a0, a1] = P(x, y), [b0, b1] = P(x + 1, y), [c0, c1] = P(x + 1, y + 1), [d0, d1] = P(x, y + 1);
      c.fillStyle = col; c.beginPath(); c.moveTo(a0, a1); c.lineTo(b0, b1); c.lineTo(c0, c1); c.lineTo(d0, d1); c.closePath(); c.fill();
    }
    // brins d'herbe, fleurs, cailloux
    for (let i = 0; i < 2500 * q; i++) {
      const x = rng.range(-margin, MAP_SIZE + margin), y = rng.range(-margin, MAP_SIZE + margin);
      const [sx, sy] = P(x, y);
      const r = rng.next();
      if (r < 0.75) { c.strokeStyle = shade(th.ground, rng.range(-0.25, 0.2)); c.lineWidth = 1; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + rng.range(-2, 2), sy - rng.range(3, 6)); c.stroke(); }
      else if (r < 0.9) { c.fillStyle = rng.pick(['#fff59d', '#f8bbd0', '#ffffff', '#b39ddb']); c.beginPath(); c.arc(sx, sy, 1.5, 0, Math.PI * 2); c.fill(); }
      else { c.fillStyle = 'rgba(120,120,120,0.6)'; c.beginPath(); c.ellipse(sx, sy, 3, 1.6, 0, 0, Math.PI * 2); c.fill(); }
    }
    // bordure de la zone constructible
    if (area) {
      c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 2; c.setLineDash([8, 6]);
      const [a0, a1] = P(area.min, area.min), [b0, b1] = P(area.max, area.min), [c0, c1] = P(area.max, area.max), [d0, d1] = P(area.min, area.max);
      c.beginPath(); c.moveTo(a0, a1); c.lineTo(b0, b1); c.lineTo(c0, c1); c.lineTo(d0, d1); c.closePath(); c.stroke(); c.setLineDash([]);
    }
    // lac (nord) et rivière
    c.fillStyle = '#3d8fd1';
    c.beginPath();
    const lake: [number, number][] = [[-9, -9], [6, -9], [9, -6], [10, -2], [4, -1.5], [-1.5, -1], [-2, 4], [-6, 8], [-9, 6]];
    lake.forEach(([x, y], i) => { const [sx, sy] = P(x, y); if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); });
    c.closePath(); c.fill();
    c.strokeStyle = '#d7c49e'; c.lineWidth = 6; c.stroke();
    // forêt autour de la carte
    const g = new G(c);
    const trees: [number, number][] = [];
    for (let i = 0; i < 260; i++) {
      const side = rng.int(0, 3), along = rng.range(-margin, MAP_SIZE + margin), depth = rng.range(1, margin - 1);
      const [x, y] = side === 0 ? [along, -depth] : side === 1 ? [MAP_SIZE + depth, along] : side === 2 ? [along, MAP_SIZE + depth] : [-depth, along];
      if (x < 10 && y < 0 && x > -9) continue; // pas sur le lac
      if (y < 9 && x < 0 && y > -9) continue;
      trees.push([x, y]);
    }
    trees.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [x, y] of trees) {
      const [sx, sy] = P(x, y);
      const winter = theme === 'theme_winter';
      tree(g, sx, sy, winter ? '#5b8a72' : theme === 'theme_autumn' ? rng.pick(['#e65100', '#f9a825', '#bf360c']) : rng.pick(['#2e7d32', '#388e3c', '#1b5e20']), rng.chance(0.6), rng.range(0.9, 1.5));
    }
    this.ground = cv;
    (this.ground as any).__o = { ox, oy, q };
  }

  render(scene: Scene, dt: number) {
    this.time += dt;
    const c = this.ctx;
    const cam = this.cam;
    this.drawCalls = 0;
    this.buildGround(scene.theme, scene.buildArea);
    const dpr = cam.dpr;
    let shx = 0, shy = 0;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 20); shx = (Math.random() - 0.5) * this.shake; shy = (Math.random() - 0.5) * this.shake; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#1b3a1a'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const z = cam.zoom * dpr;
    c.setTransform(z, 0, 0, z, (cam.vw / 2 - cam.x * cam.zoom + shx) * dpr, (cam.vh / 2 - cam.y * cam.zoom + shy) * dpr);
    // sol
    const go = (this.ground as any).__o;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.ground!, -go.ox, -go.oy, this.ground!.width / go.q, this.ground!.height / go.q);
    this.drawCalls++;
    if (QUALITY[this.quality].water) this.drawWaterShimmer(c);
    // vue visible (en coordonnées iso)
    const vx0 = cam.x - cam.vw / 2 / cam.zoom - 150, vx1 = cam.x + cam.vw / 2 / cam.zoom + 150;
    const vy0 = cam.y - cam.vh / 2 / cam.zoom - 100, vy1 = cam.y + cam.vh / 2 / cam.zoom + 250;
    const visible = (sx: number, sy: number) => sx > vx0 && sx < vx1 && sy > vy0 && sy < vy1;

    if (scene.forbidden) this.drawForbidden(c, scene.forbidden, !!scene.deployHint);
    if (scene.showGrid) this.drawGrid(c, scene.buildArea);
    for (const r of scene.rubble ?? []) { const s = toScreen(r.x + r.size / 2, r.y + r.size / 2); this.drawRubble(c, s.x, s.y, r.size); }
    for (const z0 of scene.zones) {
      const s = toScreen(z0.x, z0.y);
      c.fillStyle = rgba(z0.color, 0.18 + Math.sin(this.time * 4) * 0.04); c.strokeStyle = rgba(z0.color, 0.7); c.lineWidth = 2;
      c.beginPath(); c.ellipse(s.x, s.y, z0.r * TW * 0.707, z0.r * TH * 0.707, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // éléments triés par profondeur
    type Item = { d: number; b?: RBuilding; u?: RUnit };
    const items: Item[] = [];
    const wallSet = new Set<number>();
    for (const b of scene.buildings) if (b.type === 'wall' && !b.destroyed && !b.ghost) wallSet.add(b.y * MAP_SIZE + b.x);
    for (const b of scene.buildings) {
      if (b.hidden) continue;
      const s = toScreen(b.x + b.size / 2, b.y + b.size / 2);
      if (!visible(s.x, s.y)) continue;
      items.push({ d: b.x + b.y + b.size * 2 - (bdef(b.type).category === 'trap' ? 3 : 0) + (b.ghost ? 100 : 0), b });
    }
    for (const u of scene.units) {
      const s = toScreen(u.x, u.y);
      if (!visible(s.x, s.y)) continue;
      items.push({ d: u.x + u.y + (u.flying ? 6 : 0.5), u });
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) {
      if (it.b) this.drawBuilding(c, it.b, wallSet);
      else if (it.u) {
        const u = it.u, s = toScreen(u.x, u.y);
        if (u.raged) { c.fillStyle = 'rgba(234,128,252,0.3)'; c.beginPath(); c.ellipse(s.x, s.y, 10, 5, 0, 0, Math.PI * 2); c.fill(); }
        drawUnit(c, u.type, s.x, s.y, u.face, this.time, u.atk, u.team, u.hp, { hero: u.hero, skinColor: u.skinColor, skinAccent: u.skinAccent, frozen: u.frozen, invisible: u.invisible, flying: u.flying });
        if (u.shield) { c.strokeStyle = 'rgba(255,229,127,0.8)'; c.lineWidth = 1.5; c.beginPath(); c.arc(s.x, s.y - (u.flying ? 44 : 12), 11, 0, Math.PI * 2); c.stroke(); }
        this.drawCalls++;
      }
    }
    for (const sh of scene.shots) this.drawShot(c, sh);
    this.fx.update(dt);
    this.fx.draw(c);
    // overlays écran
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawLighting(c);
    this.drawWeather(c, scene.weather, dt);
  }

  private drawWaterShimmer(c: CanvasRenderingContext2D) {
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const x = -6 + (i % 5) * 2.6 + Math.sin(this.time * 0.6 + i) * 0.6, y = -7 + Math.floor(i / 5) * 2.4 + (i % 2);
      const s = toScreen(x, y);
      const w = 10 + Math.sin(this.time * 2 + i) * 5;
      c.beginPath(); c.moveTo(s.x - w, s.y); c.quadraticCurveTo(s.x, s.y - 3, s.x + w, s.y); c.stroke();
    }
  }

  private drawGrid(c: CanvasRenderingContext2D, area?: { min: number; max: number }) {
    const a = area ?? { min: 0, max: MAP_SIZE };
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1;
    c.beginPath();
    for (let i = a.min; i <= a.max; i++) {
      let p = toScreen(i, a.min), q = toScreen(i, a.max); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y);
      p = toScreen(a.min, i); q = toScreen(a.max, i); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y);
    }
    c.stroke();
  }

  private drawForbidden(c: CanvasRenderingContext2D, mask: Uint8Array, strong: boolean) {
    c.fillStyle = strong ? 'rgba(255,40,40,0.22)' : 'rgba(255,255,255,0.05)';
    c.beginPath();
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
      if (!mask[y * MAP_SIZE + x]) continue;
      const a = toScreen(x, y), b = toScreen(x + 1, y), d = toScreen(x + 1, y + 1), e = toScreen(x, y + 1);
      c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath();
    }
    c.fill();
    if (strong) {
      // contour clair de la zone de déploiement
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.5; c.beginPath();
      for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
        if (!mask[y * MAP_SIZE + x]) continue;
        if (x === 0 || !mask[y * MAP_SIZE + x - 1]) { const a = toScreen(x, y), b = toScreen(x, y + 1); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
        if (x === MAP_SIZE - 1 || !mask[y * MAP_SIZE + x + 1]) { const a = toScreen(x + 1, y), b = toScreen(x + 1, y + 1); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
        if (y === 0 || !mask[(y - 1) * MAP_SIZE + x]) { const a = toScreen(x, y), b = toScreen(x + 1, y); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
        if (y === MAP_SIZE - 1 || !mask[(y + 1) * MAP_SIZE + x]) { const a = toScreen(x, y + 1), b = toScreen(x + 1, y + 1); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
      }
      c.stroke();
    }
  }

  private drawRubble(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
    const r = size * TW * 0.35;
    c.fillStyle = 'rgba(60,45,35,0.55)'; c.beginPath(); c.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); c.fill();
    const rng = new Rng(Math.floor(x * 31 + y));
    for (let i = 0; i < size * 4; i++) { c.fillStyle = rng.pick(['#757575', '#616161', '#8d6e63']); c.fillRect(x + rng.range(-r, r) * 0.8, y + rng.range(-r, r) * 0.35, 4, 3); }
  }

  private drawBuilding(c: CanvasRenderingContext2D, b: RBuilding, walls: Set<number>) {
    if (b.destroyed) return;
    const top = toScreen(b.x, b.y);
    const center = toScreen(b.x + b.size / 2, b.y + b.size / 2);
    if (b.alpha !== undefined) c.globalAlpha = b.alpha;
    if (b.ghost) {
      const col = b.ghost === 'ok' ? 'rgba(118,255,3,0.35)' : 'rgba(255,23,68,0.4)';
      const p = [toScreen(b.x, b.y), toScreen(b.x + b.size, b.y), toScreen(b.x + b.size, b.y + b.size), toScreen(b.x, b.y + b.size)];
      c.fillStyle = col; c.beginPath(); c.moveTo(p[0].x, p[0].y); for (const q of p.slice(1)) c.lineTo(q.x, q.y); c.closePath(); c.fill();
      c.globalAlpha = 0.75;
    }
    if (b.selected) {
      const p = [toScreen(b.x - 0.1, b.y - 0.1), toScreen(b.x + b.size + 0.1, b.y - 0.1), toScreen(b.x + b.size + 0.1, b.y + b.size + 0.1), toScreen(b.x - 0.1, b.y + b.size + 0.1)];
      c.strokeStyle = `rgba(255,255,255,${0.6 + Math.sin(this.time * 6) * 0.3})`; c.lineWidth = 3;
      c.beginPath(); c.moveTo(p[0].x, p[0].y); for (const q of p.slice(1)) c.lineTo(q.x, q.y); c.closePath(); c.stroke();
      if (b.range) {
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.setLineDash([6, 6]);
        c.beginPath(); c.ellipse(center.x, center.y, (b.range + b.size / 2) * TW * 0.707, (b.range + b.size / 2) * TH * 0.707, 0, 0, Math.PI * 2); c.stroke();
        if (b.minRange) { c.strokeStyle = 'rgba(255,80,80,0.5)'; c.beginPath(); c.ellipse(center.x, center.y, b.minRange * TW * 0.707, b.minRange * TH * 0.707, 0, 0, Math.PI * 2); c.stroke(); }
        c.setLineDash([]);
      }
    }
    if (b.type === 'wall') {
      this.drawWall(c, b, walls);
    } else {
      if (QUALITY[this.quality].shadows && b.size > 1) shadowEllipse(c, center.x + 8, center.y + 2, b.size * TW * 0.42, b.size * TH * 0.42, 0.18);
      const spr = buildingSprite(b.type, Math.max(1, b.level), { skin: b.skin, construction: b.constructing });
      c.drawImage(spr, top.x - b.size * TW / 2 - 4, top.y - HEADROOM);
      this.drawCalls++;
      if (b.aim !== undefined || ['watchtower', 'arcane_spire', 'brazier', 'storm_tower'].includes(b.type)) {
        if (bdef(b.type).category === 'defense') drawTurret(c, b.type, center.x, center.y, b.aim ?? 0.8, b.level, b.recoil ?? 0, this.time);
      }
      if (b.type === 'guild_portal') {
        const gl = c.createRadialGradient(center.x, center.y - 40, 2, center.x, center.y - 40, 30);
        gl.addColorStop(0, `rgba(200,160,255,${0.35 + Math.sin(this.time * 3) * 0.15})`); gl.addColorStop(1, 'rgba(120,60,255,0)');
        c.fillStyle = gl; c.beginPath(); c.arc(center.x, center.y - 40, 30, 0, Math.PI * 2); c.fill();
      }
      if (b.type === 'forge' || b.type === 'army_camp') {
        if (Math.random() < 0.08) this.fx.spawn(center.x + (b.type === 'forge' ? 14 : 0), center.y - (b.type === 'forge' ? 70 : 8), 0, (Math.random() - 0.5) * 6, 0, 18, 2.5, 4, 'rgba(120,120,120,0.6)', PK.smoke);
      }
    }
    if (b.frozen) { c.fillStyle = 'rgba(128,216,255,0.35)'; c.beginPath(); c.ellipse(center.x, center.y - 20, b.size * 22, b.size * 16, 0, 0, Math.PI * 2); c.fill(); }
    if (b.stunned) { for (let i = 0; i < 3; i++) { const a = this.time * 4 + i * 2.1; c.fillStyle = '#fff59d'; c.beginPath(); c.arc(center.x + Math.cos(a) * 14, center.y - 50 + Math.sin(a) * 5, 3, 0, Math.PI * 2); c.fill(); } }
    c.globalAlpha = 1;
    // barre de vie
    if (b.hpFrac !== undefined && b.hpFrac < 0.999 && b.hpFrac > 0 && b.type !== 'wall') {
      const w = 22 + b.size * 6, yy = center.y - 20 - b.size * 14;
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(center.x - w / 2 - 1, yy - 1, w + 2, 6);
      c.fillStyle = b.hpFrac > 0.5 ? '#76ff03' : b.hpFrac > 0.25 ? '#ffd600' : '#ff1744'; c.fillRect(center.x - w / 2, yy, w * b.hpFrac, 4);
    }
    // progression de chantier
    if (b.constructing && b.progress !== undefined) {
      const w = 50, yy = center.y - 40 - b.size * 10;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(center.x - w / 2 - 2, yy - 2, w + 4, 9);
      c.fillStyle = '#29b6f6'; c.fillRect(center.x - w / 2, yy, w * b.progress, 5);
      if (b.label) { c.font = 'bold 12px system-ui'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(b.label, center.x, yy - 5); c.fillStyle = '#fff'; c.fillText(b.label, center.x, yy - 5); }
    }
    // bulle de récolte
    if (b.bubble) {
      const by = center.y - 36 - b.size * 14 + Math.sin(this.time * 3 + b.uid) * 3;
      c.fillStyle = 'rgba(255,255,255,0.95)'; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2;
      c.beginPath(); c.arc(center.x, by, 14, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(center.x - 5, by + 12); c.lineTo(center.x, by + 20); c.lineTo(center.x + 5, by + 12); c.fill();
      c.font = '16px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText(b.bubble, center.x, by + 1); c.textBaseline = 'alphabetic';
    }
  }

  private drawWall(c: CanvasRenderingContext2D, b: RBuilding, walls: Set<number>) {
    const g = new G(c);
    const col = wallColor(b.level);
    const h = 14 + Math.min(10, b.level);
    const cx = toScreen(b.x + 0.5, b.y + 0.5);
    const rightN = walls.has(b.y * MAP_SIZE + b.x + 1), downN = walls.has((b.y + 1) * MAP_SIZE + b.x);
    const leftN = walls.has(b.y * MAP_SIZE + b.x - 1), upN = walls.has((b.y - 1) * MAP_SIZE + b.x);
    // connecteurs vers le haut/gauche dessinés avant le pilier (profondeur)
    if (leftN) { const p = toScreen(b.x, b.y + 0.5); g.prism((p.x + cx.x) / 2, (p.y + cx.y) / 2, 0.5, 0.42, h - 4, col); }
    if (upN) { const p = toScreen(b.x + 0.5, b.y); g.prism((p.x + cx.x) / 2, (p.y + cx.y) / 2, 0.42, 0.5, h - 4, col); }
    g.prism(cx.x, cx.y, 0.56, 0.56, h, shade(col, 0.05));
    if (rightN) { const p = toScreen(b.x + 1, b.y + 0.5); g.prism((p.x + cx.x) / 2, (p.y + cx.y) / 2, 0.5, 0.42, h - 4, col); }
    if (downN) { const p = toScreen(b.x + 0.5, b.y + 1); g.prism((p.x + cx.x) / 2, (p.y + cx.y) / 2, 0.42, 0.5, h - 4, col); }
    if (b.level >= 8) g.circle(cx.x, cx.y - h - 1, 2, b.level >= 10 ? '#e1bee7' : '#fff59d');
    if (b.hpFrac !== undefined && b.hpFrac < 0.999) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(cx.x - 8, cx.y - h - 10, 16, 3); c.fillStyle = '#ffd600'; c.fillRect(cx.x - 8, cx.y - h - 10, 16 * b.hpFrac, 3); }
  }

  private drawShot(c: CanvasRenderingContext2D, sh: RShot) {
    const k = Math.min(1, sh.t / Math.max(0.05, sh.dur));
    const a = toScreen(sh.fx, sh.fy), b = toScreen(sh.tx, sh.ty);
    const x = a.x + (b.x - a.x) * k;
    const lift = sh.kind.startsWith('src') ? 0 : 24;
    const y = a.y - lift + (b.y - a.y) * k + lift * k - Math.sin(k * Math.PI) * sh.arc;
    switch (sh.kind) {
      case 'beam': case 'lightning': case 'arcane': {
        c.strokeStyle = sh.kind === 'beam' ? `rgba(255,${120 + Math.random() * 80},0,0.9)` : sh.kind === 'arcane' ? 'rgba(224,64,251,0.9)' : 'rgba(129,212,250,0.95)';
        c.lineWidth = sh.kind === 'beam' ? 5 : 3;
        c.beginPath(); c.moveTo(a.x, a.y - (sh.kind === 'beam' ? 60 : 70));
        const steps = sh.kind === 'beam' ? 1 : 5;
        for (let i = 1; i <= steps; i++) { const t = i / steps; c.lineTo(a.x + (b.x - a.x) * t + (i < steps ? (Math.random() - 0.5) * 14 : 0), a.y - 70 + (b.y - 12 - a.y + 70) * t + (i < steps ? (Math.random() - 0.5) * 14 : 0)); }
        c.stroke();
        break;
      }
      case 'arrow': case 'archer': case 'lyra': {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        c.strokeStyle = sh.kind === 'lyra' ? '#b3e5fc' : '#5d4037'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x - Math.cos(ang) * 7, y - Math.sin(ang) * 7); c.lineTo(x + Math.cos(ang) * 4, y + Math.sin(ang) * 4); c.stroke();
        break;
      }
      case 'shell': case 'ball': case 'bolt': case 'rocket': case 'catapult': {
        c.fillStyle = sh.kind === 'rocket' ? '#e53935' : '#212121';
        c.beginPath(); c.arc(x, y, sh.kind === 'ball' ? 4 : sh.kind === 'catapult' ? 6 : 5, 0, Math.PI * 2); c.fill();
        if (sh.kind === 'rocket' && Math.random() < 0.5) this.fx.spawn(x, y, 0, 0, 0, 4, 0.5, 3, 'rgba(200,200,200,0.5)', PK.smoke);
        break;
      }
      default: {
        // projectiles d'unités (mage, wyverne...)
        const col = sh.kind === 'mage' || sh.kind === 'm_shaman' ? '#e040fb' : sh.kind === 'wyvern' ? '#ff7043' : sh.kind === 'airship' ? '#212121' : '#fff59d';
        const gl = c.createRadialGradient(x, y, 0, x, y, 8); gl.addColorStop(0, '#fff'); gl.addColorStop(0.4, col); gl.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gl; c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.fill();
      }
    }
  }

  private drawLighting(c: CanvasRenderingContext2D) {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    let col = '', a = 0;
    if (h >= 20 || h < 6) { col = '20,30,80'; a = 0.22; }
    else if (h >= 18) { col = '255,120,40'; a = 0.1 * ((h - 18) / 2); }
    else if (h < 7.5) { col = '255,170,90'; a = 0.08; }
    if (a > 0) { c.fillStyle = `rgba(${col},${a})`; c.fillRect(0, 0, this.cam.vw, this.cam.vh); }
    // vignette
    if (this.quality !== 'low') {
      const g = c.createRadialGradient(this.cam.vw / 2, this.cam.vh / 2, Math.min(this.cam.vw, this.cam.vh) * 0.45, this.cam.vw / 2, this.cam.vh / 2, Math.max(this.cam.vw, this.cam.vh) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
      c.fillStyle = g; c.fillRect(0, 0, this.cam.vw, this.cam.vh);
    }
  }

  private drawWeather(c: CanvasRenderingContext2D, w: Scene['weather'], dt: number) {
    if (w === 'clear') return;
    const n = QUALITY[this.quality].weather;
    while (this.weatherP.length < n) this.weatherP.push({ x: Math.random() * this.cam.vw, y: Math.random() * this.cam.vh, s: Math.random(), v: 0.5 + Math.random() });
    if (this.weatherP.length > n) this.weatherP.length = n;
    for (const p of this.weatherP) {
      if (w === 'rain' || w === 'storm') { p.y += 700 * p.v * dt; p.x -= 120 * dt; }
      else if (w === 'snow') { p.y += 50 * p.v * dt; p.x += Math.sin(this.time + p.s * 10) * 20 * dt; }
      else { p.y += 40 * p.v * dt; p.x += (60 + Math.sin(this.time * 2 + p.s * 10) * 40) * dt; }
      if (p.y > this.cam.vh) { p.y = -10; p.x = Math.random() * this.cam.vw; }
      if (p.x < -10) p.x = this.cam.vw; if (p.x > this.cam.vw + 10) p.x = 0;
    }
    if (w === 'rain' || w === 'storm') {
      c.strokeStyle = 'rgba(180,200,255,0.45)'; c.lineWidth = 1; c.beginPath();
      for (const p of this.weatherP) { c.moveTo(p.x, p.y); c.lineTo(p.x - 3, p.y + 12); }
      c.stroke();
      c.fillStyle = 'rgba(30,40,70,0.15)'; c.fillRect(0, 0, this.cam.vw, this.cam.vh);
      if (w === 'storm' && Math.random() < 0.004) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(0, 0, this.cam.vw, this.cam.vh); }
    } else if (w === 'snow') {
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of this.weatherP) { c.beginPath(); c.arc(p.x, p.y, 1 + p.s * 2, 0, Math.PI * 2); c.fill(); }
    } else {
      for (const p of this.weatherP) { c.fillStyle = p.s > 0.5 ? 'rgba(255,152,0,0.8)' : 'rgba(205,220,57,0.8)'; c.fillRect(p.x, p.y, 4, 2); }
    }
  }
}
