// Dessin des unités, héros, tourelles animées et murailles connectées.
import { shade } from './color';
import { shadowEllipse } from './sprites';
import { UNITS } from '../units/defs';
import { HEROES } from '../heroes/defs';

type Ctx = CanvasRenderingContext2D;

/**
 * Dessine une unité à la position écran (x,y) = point au sol.
 * `face` : angle monde ; `t` : temps (s) ; `atk` : animation d'attaque 0..1.
 */
export function drawUnit(c: Ctx, type: string, x: number, y: number, face: number, t: number, atk: number, team: 'att' | 'def', hpFrac: number, opts: { hero?: string; skinColor?: string; skinAccent?: string; frozen?: boolean; invisible?: boolean; flying?: boolean; scale?: number } = {}) {
  const u = UNITS[type];
  const hero = opts.hero ? HEROES.find(h => h.id === opts.hero) : undefined;
  const s = (opts.scale ?? 1.25) * (hero ? 1.35 : 1) * (u ? Math.max(0.8, u.size / 0.3) : 1);
  const flying = opts.flying ?? !!u?.flying;
  // direction écran (iso) pour l'orientation gauche/droite
  const sx = Math.cos(face) - Math.sin(face);
  const dir = sx >= 0 ? 1 : -1;
  const bob = Math.sin(t * 9 + x * 0.1) * 1.2;
  const lift = flying ? 34 + Math.sin(t * 3 + x) * 3 : 0;
  c.save();
  if (opts.invisible) c.globalAlpha = 0.35;
  shadowEllipse(c, x, y, 7 * s, 3.5 * s, flying ? 0.15 : 0.25);
  const by = y - lift;
  const col = hero ? (opts.skinColor ?? hero.color) : u?.color ?? '#999';
  const acc = hero ? (opts.skinAccent ?? hero.accent) : team === 'def' ? '#1e88e5' : '#ffffff';
  const lunge = atk * 3 * dir;
  switch (type) {
    case 'airship': {
      c.fillStyle = shade(col, 0.1); c.beginPath(); c.ellipse(x, by - 22 * s, 13 * s, 10 * s, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = shade(col, -0.4); c.lineWidth = 1; c.stroke();
      c.strokeStyle = '#5d4037'; c.beginPath(); c.moveTo(x - 6 * s, by - 14 * s); c.lineTo(x - 4 * s, by - 6 * s); c.moveTo(x + 6 * s, by - 14 * s); c.lineTo(x + 4 * s, by - 6 * s); c.stroke();
      c.fillStyle = '#795548'; c.fillRect(x - 6 * s, by - 7 * s, 12 * s, 6 * s);
      break;
    }
    case 'wyvern': case 'm_bat': {
      const flap = Math.sin(t * 10) * 0.8;
      const wing = type === 'wyvern' ? 16 : 9;
      c.fillStyle = shade(col, -0.15);
      for (const sgn of [-1, 1]) { c.beginPath(); c.moveTo(x, by - 10 * s); c.lineTo(x + sgn * wing * s, by - (14 + flap * 8) * s); c.lineTo(x + sgn * wing * 0.6 * s, by - 6 * s); c.closePath(); c.fill(); }
      c.fillStyle = col; c.beginPath(); c.ellipse(x, by - 9 * s, 8 * s, 5 * s, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + dir * 8 * s, by - 12 * s, 4 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffeb3b'; c.fillRect(x + dir * 9 * s, by - 13 * s, 1.5, 1.5);
      break;
    }
    case 'priestess': case 'phantom': {
      c.fillStyle = type === 'phantom' ? 'rgba(178,235,242,0.75)' : 'rgba(255,255,255,0.8)';
      const flap = Math.sin(t * 8) * 4;
      if (type === 'priestess') for (const sgn of [-1, 1]) { c.beginPath(); c.ellipse(x + sgn * 8 * s, by - 16 * s - flap, 7 * s, 3 * s, sgn * 0.6, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = col; c.beginPath(); c.moveTo(x - 6 * s, by - 2 * s); c.lineTo(x + 6 * s, by - 2 * s); c.lineTo(x, by - 20 * s); c.closePath(); c.fill();
      c.fillStyle = '#ffe0b2'; c.beginPath(); c.arc(x, by - 21 * s, 4 * s, 0, Math.PI * 2); c.fill();
      if (type === 'priestess') { c.strokeStyle = '#fff59d'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, by - 27 * s, 4 * s, 1.5 * s, 0, 0, Math.PI * 2); c.stroke(); }
      break;
    }
    case 'golem': case 'golemite': case 'm_troll': {
      c.fillStyle = shade(col, -0.1);
      c.beginPath(); c.ellipse(x, by - 12 * s + bob * 0.5, 9 * s, 10 * s, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(x + dir * 2 * s, by - 24 * s, 5 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = shade(col, -0.3);
      c.beginPath(); c.arc(x + dir * (9 + lunge) * s, by - 12 * s, 4 * s, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x - dir * 8 * s, by - 12 * s, 4 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = type === 'm_troll' ? '#ff5252' : '#80deea'; c.fillRect(x + dir * 3 * s, by - 25 * s, 2, 2);
      break;
    }
    case 'ram': case 'catapult': {
      c.fillStyle = '#6d4c41'; c.fillRect(x - 12 * s, by - 10 * s, 24 * s, 7 * s);
      c.fillStyle = '#3e2723'; for (const w of [-8, 8]) { c.beginPath(); c.arc(x + w * s, by - 3 * s, 4 * s, 0, Math.PI * 2); c.fill(); }
      if (type === 'ram') { c.fillStyle = '#90a4ae'; c.fillRect(x + (dir > 0 ? 4 : -18) * s + lunge, by - 16 * s, 14 * s, 5 * s); c.fillStyle = '#5d4037'; c.beginPath(); c.moveTo(x - 10 * s, by - 10 * s); c.lineTo(x, by - 22 * s); c.lineTo(x + 10 * s, by - 10 * s); c.fill(); }
      else { c.strokeStyle = '#5d4037'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, by - 10 * s); c.lineTo(x - dir * (10 - atk * 14) * s, by - 28 * s); c.stroke(); }
      break;
    }
    case 'rider': {
      c.fillStyle = '#8d6e63'; c.beginPath(); c.ellipse(x, by - 7 * s + bob, 10 * s, 5 * s, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + dir * 10 * s, by - 10 * s + bob, 3.5 * s, 0, Math.PI * 2); c.fill();
      figure(c, x - dir * 1 * s, by - 9 * s + bob, s * 0.8, col, acc, dir, lunge, 'spear');
      break;
    }
    default: {
      const weapon = type === 'archer' ? 'bow' : type === 'mage' || type === 'm_shaman' ? 'staff' : type === 'engineer' ? 'bomb' : type === 'assassin' ? 'daggers' : type === 'brute' || type === 'm_goblin' ? 'club' : hero?.id === 'lyra' ? 'bow' : hero?.id === 'bronn' ? 'hammer' : hero?.id === 'nyx' ? 'daggers' : 'sword';
      figure(c, x, by + bob * 0.5, s * (type === 'brute' ? 1.25 : 1), col, acc, dir, lunge, weapon, !!hero);
    }
  }
  if (opts.frozen) { c.fillStyle = 'rgba(128,216,255,0.45)'; c.beginPath(); c.ellipse(x, by - 10 * s, 10 * s, 14 * s, 0, 0, Math.PI * 2); c.fill(); }
  c.restore();
  // barre de vie
  if (hpFrac < 0.999 && hpFrac > 0) {
    const w = hero ? 26 : 14;
    const yy = by - 34 * s;
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - w / 2 - 1, yy - 1, w + 2, 4);
    c.fillStyle = team === 'att' ? (hpFrac > 0.5 ? '#76ff03' : hpFrac > 0.25 ? '#ffd600' : '#ff1744') : '#ff5252';
    c.fillRect(x - w / 2, yy, w * hpFrac, 2);
  }
}

function figure(c: Ctx, x: number, y: number, s: number, col: string, acc: string, dir: number, lunge: number, weapon: string, hero = false) {
  // jambes
  c.fillStyle = '#4e342e'; c.fillRect(x - 3 * s, y - 6 * s, 2 * s, 6 * s); c.fillRect(x + 1 * s, y - 6 * s, 2 * s, 6 * s);
  // corps
  c.fillStyle = col; c.beginPath(); c.ellipse(x, y - 11 * s, 5 * s, 6.5 * s, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = shade(col, -0.45); c.lineWidth = 1; c.stroke();
  // ceinture / cape
  c.fillStyle = acc; c.fillRect(x - 5 * s, y - 10 * s, 10 * s, 1.6 * s);
  if (hero) { c.fillStyle = shade(col, -0.25); c.beginPath(); c.moveTo(x - dir * 2 * s, y - 16 * s); c.lineTo(x - dir * 9 * s, y - 3 * s); c.lineTo(x - dir * 1 * s, y - 6 * s); c.fill(); }
  // tête
  c.fillStyle = '#ffcc99'; c.beginPath(); c.arc(x, y - 20 * s, 3.8 * s, 0, Math.PI * 2); c.fill();
  c.fillStyle = shade(col, -0.2); c.beginPath(); c.arc(x, y - 21.5 * s, 3.9 * s, Math.PI, 0); c.fill();
  if (hero) { c.fillStyle = acc; c.beginPath(); c.moveTo(x - 4 * s, y - 24 * s); c.lineTo(x - 2 * s, y - 28 * s); c.lineTo(x, y - 25 * s); c.lineTo(x + 2 * s, y - 28 * s); c.lineTo(x + 4 * s, y - 24 * s); c.fill(); }
  // arme
  const hx = x + dir * (6 * s + lunge), hy = y - 12 * s;
  c.lineWidth = 2 * Math.max(0.8, s);
  switch (weapon) {
    case 'sword': case 'spear': c.strokeStyle = '#e0e0e0'; c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + dir * (weapon === 'spear' ? 12 : 8) * s, hy - 6 * s); c.stroke(); c.fillStyle = acc === '#ffffff' ? '#8d6e63' : acc; c.beginPath(); c.arc(x - dir * 5 * s, y - 12 * s, 3.5 * s, 0, Math.PI * 2); c.fill(); break;
    case 'bow': c.strokeStyle = '#6d4c41'; c.beginPath(); c.arc(hx, hy, 6 * s, dir > 0 ? -1.2 : Math.PI - 1.2 + 0, dir > 0 ? 1.2 : Math.PI + 1.2); c.stroke(); break;
    case 'staff': c.strokeStyle = '#6d4c41'; c.beginPath(); c.moveTo(hx, hy + 6 * s); c.lineTo(hx, hy - 12 * s); c.stroke(); c.fillStyle = '#e040fb'; c.beginPath(); c.arc(hx, hy - 13 * s, 2.6 * s, 0, Math.PI * 2); c.fill(); break;
    case 'bomb': c.fillStyle = '#212121'; c.beginPath(); c.arc(hx, hy, 3.5 * s, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ff7043'; c.fillRect(hx, hy - 6 * s, 1.5, 2); break;
    case 'daggers': c.strokeStyle = '#cfd8dc'; c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + dir * 5 * s, hy - 4 * s); c.moveTo(x - dir * 5 * s, hy); c.lineTo(x - dir * 9 * s, hy - 4 * s); c.stroke(); break;
    case 'club': case 'hammer': c.strokeStyle = '#5d4037'; c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + dir * 4 * s, hy - 9 * s); c.stroke(); c.fillStyle = weapon === 'hammer' ? '#90a4ae' : '#795548'; c.fillRect(hx + dir * 2 * s - 3 * s, hy - 13 * s, 6 * s, 5 * s); break;
  }
}

/** Tourelle orientée vers sa cible (canon, baliste, lanceur, mortier). */
export function drawTurret(c: Ctx, type: string, x: number, y: number, aim: number, level: number, recoil: number, t: number) {
  const ax = Math.cos(aim) - Math.sin(aim), ay = (Math.cos(aim) + Math.sin(aim)) * 0.5;
  const n = Math.hypot(ax, ay) || 1;
  const dx = ax / n, dy = ay / n;
  const lift = 18 + Math.min(10, level);
  const bx = x, by = y - lift;
  switch (type) {
    case 'cannon': {
      c.fillStyle = '#5d4037'; c.beginPath(); c.ellipse(bx, by, 14, 8, 0, 0, Math.PI * 2); c.fill();
      const len = 22 + level * 0.6 - recoil * 5;
      c.strokeStyle = level >= 10 ? '#37474f' : '#263238'; c.lineWidth = 9 + level * 0.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(bx, by - 4); c.lineTo(bx + dx * len, by - 4 + dy * len); c.stroke(); c.lineCap = 'butt';
      c.fillStyle = '#212121'; c.beginPath(); c.arc(bx + dx * len, by - 4 + dy * len, 4, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'mortar': {
      c.fillStyle = '#4e342e'; c.beginPath(); c.ellipse(bx, by, 16, 9, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#37474f'; c.beginPath(); c.ellipse(bx + dx * 3, by - 10 - recoil * 3, 11, 13, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.ellipse(bx + dx * 3, by - 20 - recoil * 3, 8, 4, 0, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'sky_launcher': {
      c.fillStyle = '#1565c0'; c.fillRect(bx - 12, by - 10, 24, 12);
      for (let i = 0; i < 4; i++) { const ox = (i % 2) * 8 - 4, oy = Math.floor(i / 2) * 6 - 3; c.fillStyle = '#e53935'; c.beginPath(); c.arc(bx + ox + dx * 10, by - 14 + oy + dy * 6 - 6, 3, 0, Math.PI * 2); c.fill(); }
      break;
    }
    case 'ballista': {
      c.strokeStyle = '#5d4037'; c.lineWidth = 5; c.beginPath(); c.moveTo(bx - dx * 10, by - 6 - dy * 10); c.lineTo(bx + dx * 22, by - 6 + dy * 22); c.stroke();
      c.strokeStyle = '#8d6e63'; c.lineWidth = 3; c.beginPath(); c.moveTo(bx + dx * 8 - dy * 16, by - 6 + dy * 8 + dx * 8); c.lineTo(bx + dx * (8 - recoil * 6), by - 6 + dy * 8); c.lineTo(bx + dx * 8 + dy * 16, by - 6 + dy * 8 - dx * 8); c.stroke();
      break;
    }
    case 'watchtower': {
      const h = 50 + level * 2.2;
      figureArcher(c, x + dx * 4, y - h - 26, dx);
      break;
    }
    case 'arcane_spire': {
      const h = 60 + level * 2 + Math.sin(t * 2) * 4;
      const gr = c.createRadialGradient(x, y - h, 1, x, y - h, 16);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#e040fb'); gr.addColorStop(1, 'rgba(170,0,255,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(x, y - h, 16, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'brazier': {
      const h = 50 + level * 3;
      for (let i = 0; i < 5; i++) {
        const fx = x + Math.sin(t * 7 + i * 1.7) * 6, fy = y - h - 6 - ((t * 30 + i * 9) % 20);
        c.fillStyle = i % 2 ? 'rgba(255,152,0,0.85)' : 'rgba(255,235,59,0.85)';
        c.beginPath(); c.arc(fx, fy, 6 - ((t * 30 + i * 9) % 20) / 5, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case 'storm_tower': {
      const h = 80 + level * 4;
      const gr = c.createRadialGradient(x, y - h, 1, x, y - h, 14);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, '#4fc3f7'); gr.addColorStop(1, 'rgba(0,150,255,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(x, y - h, 14 + Math.sin(t * 6) * 2, 0, Math.PI * 2); c.fill();
      break;
    }
  }
}

function figureArcher(c: Ctx, x: number, y: number, dx: number) {
  c.fillStyle = '#2e7d32'; c.beginPath(); c.ellipse(x, y - 4, 4, 5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffcc99'; c.beginPath(); c.arc(x, y - 11, 3, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#6d4c41'; c.lineWidth = 1.5; c.beginPath(); c.arc(x + dx * 5, y - 5, 5, -1.3, 1.3); c.stroke();
}

const WALL_COLORS = ['#a1887f', '#a1887f', '#9e9e9e', '#9e9e9e', '#8d8d8d', '#78909c', '#607d8b', '#ffca28', '#ffb300', '#ab47bc', '#7e57c2', '#424242'];
export function wallColor(level: number) { return WALL_COLORS[Math.max(0, Math.min(WALL_COLORS.length - 1, level - 1))]; }
