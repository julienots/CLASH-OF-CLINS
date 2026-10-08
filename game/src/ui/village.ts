// Scène du village : sélection, récolte, construction, déplacement, mode édition, murs.
import type { App, Scene } from './app';
import { Hud } from './hud';
import { Input } from './input';
import { h } from './dom';
import type { RBuilding, Scene as RScene } from '../render/renderer';
import { MAP_SIZE, type BuildingInstance } from '../core/state';
import { bdef, blevel } from '../buildings/defs';
import { canPlaceAt, occupancy, buildArea, findFreeSpot } from '../village/grid';
import { citadelLevel, producerCapacity } from '../village/query';
import { fmtTime, fmt } from '../core/util';
import { audio } from '../audio/audio';
import { PK } from '../render/particles';
import { toScreen } from '../render/iso';
import { currentEvent } from '../events/events';
import * as P from './panels';
import { RES_ICON, type ResKey } from '../core/types';
import { Tutorial } from './tutorial';

type Mode = 'normal' | 'place' | 'edit';

export class VillageScene implements Scene {
  name = 'village';
  hud!: Hud;
  input!: Input;
  mode: Mode = 'normal';
  selected: number | null = null;
  placing: { type: string; x: number; y: number } | null = null;
  wallPath: { x: number; y: number }[] = [];
  edit = new Map<number, { x: number; y: number }>();
  editSel = new Set<number>();
  private dragOrigin: { wx: number; wy: number; starts: Map<number, { x: number; y: number }> } | null = null;
  private ctx: HTMLElement | null = null;
  private unsub: (() => void) | null = null;
  tutorial!: Tutorial;
  private walkers: { x: number; y: number; tx: number; ty: number; type: string; t: number }[] = [];

  constructor(private app: App) {}

  enter() {
    const app = this.app;
    this.hud = new Hud(app, {
      attack: () => P.openAttack(app),
      build: () => P.openBuildMenu(app, type => this.startPlacing(type)),
      army: () => P.openArmy(app),
      guild: () => P.openGuild(app),
      shop: () => P.openShop(app),
      pass: () => P.openPass(app),
      world: () => P.openWorld(app),
      menu: () => P.openMenu(app, this),
      events: () => P.openEvents(app),
      profile: () => P.openProfile(app),
      missions: () => P.openMissions(app),
      edit: () => this.setMode(this.mode === 'edit' ? 'normal' : 'edit'),
      builders: () => P.openBuilders(app, uid => this.select(uid)),
      log: () => P.openDefenseLog(app),
    });
    app.layer.appendChild(this.hud.root);
    this.input = new Input(app.r.canvas, app.r.cam, {
      tap: (x, y) => this.onTap(x, y),
      dragStart: (x, y) => this.onDragStart(x, y),
      drag: (x, y) => this.onDrag(x, y),
      dragEnd: () => this.onDragEnd(),
    });
    const f = () => { this.hud.update(); if (this.selected !== null) this.renderCtx(); };
    app.hooks.onStateChange.push(f);
    this.unsub = () => { app.hooks.onStateChange = app.hooks.onStateChange.filter(x => x !== f); };
    audio.music('village');
    this.tutorial = new Tutorial(app, this);
    this.tutorial.show();
  }
  exit() { this.input.dispose(); this.unsub?.(); this.tutorial?.dispose(); }

  // ───── Modes ─────
  setMode(m: Mode) {
    if (this.mode === 'edit' && m !== 'edit') { this.edit.clear(); this.editSel.clear(); }
    this.mode = m;
    this.placing = m === 'place' ? this.placing : null;
    this.select(null);
    if (m === 'edit') this.app.toast('Mode édition : touchez pour sélectionner (plusieurs possibles), glissez pour déplacer.');
    this.renderCtx();
  }

  startPlacing(type: string) {
    const s = this.app.s;
    const center = this.app.r.cam.viewToWorld(this.app.r.cam.vw / 2, this.app.r.cam.vh / 2);
    const spot = findFreeSpot(s, type, { x: Math.round(center.x), y: Math.round(center.y) }, citadelLevel(s));
    if (!spot) { this.app.toast('Plus de place libre !', 'bad'); return; }
    this.placing = { type, x: spot.x, y: spot.y };
    this.wallPath = [];
    this.mode = 'place';
    this.select(null);
    this.renderCtx();
  }

  select(uid: number | null) {
    this.selected = uid;
    if (uid !== null) audio.sfx('click');
    this.renderCtx();
  }

  // ───── Entrées ─────
  private worldAt(x: number, y: number) { return this.app.r.cam.viewToWorld(x, y); }
  private buildingAt(wx: number, wy: number): BuildingInstance | null {
    const s = this.app.s;
    let best: BuildingInstance | null = null;
    for (const b of s.buildings) {
      const pos = this.edit.get(b.uid) ?? b;
      const size = bdef(b.type).size;
      // tolérance pour viser les bâtiments hauts
      if (wx >= pos.x - 0.3 && wy >= pos.y - 0.3 && wx < pos.x + size + 0.6 && wy < pos.y + size + 0.6) {
        if (!best || pos.x + pos.y > (this.edit.get(best.uid) ?? best).x + (this.edit.get(best.uid) ?? best).y) best = b;
      }
    }
    return best;
  }

  private onTap(x: number, y: number) {
    const w = this.worldAt(x, y);
    const s = this.app.s;
    if (this.mode === 'place' && this.placing) {
      const size = bdef(this.placing.type).size;
      this.placing.x = Math.floor(w.x - size / 2 + 0.5); this.placing.y = Math.floor(w.y - size / 2 + 0.5);
      if (this.placing.type === 'wall') this.wallPath = [{ x: Math.floor(w.x), y: Math.floor(w.y) }];
      this.renderCtx();
      return;
    }
    const b = this.buildingAt(w.x, w.y);
    if (this.mode === 'edit') {
      if (b) { if (this.editSel.has(b.uid)) this.editSel.delete(b.uid); else this.editSel.add(b.uid); audio.sfx('click'); }
      else this.editSel.clear();
      this.renderCtx();
      return;
    }
    if (!b) { this.select(null); return; }
    // récolte directe
    const stored = b.stored ? Object.entries(b.stored).reduce((a, [, v]) => a + (v ?? 0), 0) : 0;
    if (stored >= 1 && !b.build && this.selected !== b.uid) {
      const r = this.app.act('collect', { uid: b.uid }, { silent: true });
      if (r.ok) { this.collectFx(b, r.data); return; }
      this.app.toast('Stockage plein ! Améliorez vos entrepôts.', 'bad');
    }
    if (this.tutorial.onSelect(b)) return;
    this.select(this.selected === b.uid ? null : b.uid);
  }

  collectFx(b: BuildingInstance, got: Partial<Record<ResKey, number>>) {
    const size = bdef(b.type).size;
    const c = toScreen(b.x + size / 2, b.y + size / 2);
    let i = 0;
    for (const [k, v] of Object.entries(got) as [ResKey, number][]) {
      this.app.r.fx.text(c.x, c.y - 60 - i * 18, `+${fmt(v)} ${RES_ICON[k]}`, k === 'gold' ? '#ffd54f' : k === 'wood' ? '#d7a46a' : k === 'energy' ? '#80deea' : '#e1bee7', 18);
      this.app.r.fx.burst(c.x, c.y - 30, 10, 12, k === 'gold' ? '#ffd54f' : k === 'wood' ? '#a0703c' : '#80deea', 60, 0.8, 3, PK.dot, 120);
      i++;
      audio.sfx(k === 'wood' ? 'wood' : 'coin');
    }
    this.app.vibrate(10);
    this.tutorial.event('collect');
  }

  private onDragStart(x: number, y: number): boolean {
    const w = this.worldAt(x, y);
    if (this.mode === 'place' && this.placing) {
      if (this.placing.type === 'wall') { this.wallPath = [{ x: Math.floor(w.x), y: Math.floor(w.y) }]; this.placing.x = Math.floor(w.x); this.placing.y = Math.floor(w.y); return true; }
      const size = bdef(this.placing.type).size;
      if (w.x >= this.placing.x - 1 && w.y >= this.placing.y - 1 && w.x <= this.placing.x + size + 1 && w.y <= this.placing.y + size + 1) {
        this.dragOrigin = { wx: w.x, wy: w.y, starts: new Map([[-1, { x: this.placing.x, y: this.placing.y }]]) };
        return true;
      }
      return false;
    }
    const b = this.buildingAt(w.x, w.y);
    if (!b) return false;
    if (this.mode === 'edit') {
      if (!this.editSel.has(b.uid)) { this.editSel.clear(); this.editSel.add(b.uid); }
      const starts = new Map<number, { x: number; y: number }>();
      for (const u of this.editSel) { const bb = this.app.s.buildings.find(q => q.uid === u)!; starts.set(u, { ...(this.edit.get(u) ?? { x: bb.x, y: bb.y }) }); }
      this.dragOrigin = { wx: w.x, wy: w.y, starts };
      return true;
    }
    if (this.selected === b.uid) {
      this.dragOrigin = { wx: w.x, wy: w.y, starts: new Map([[b.uid, { x: b.x, y: b.y }]]) };
      return true;
    }
    return false;
  }

  private onDrag(x: number, y: number) {
    const w = this.worldAt(x, y);
    if (this.mode === 'place' && this.placing?.type === 'wall' && !this.dragOrigin) {
      const last = this.wallPath[this.wallPath.length - 1];
      const cx = Math.floor(w.x), cy = Math.floor(w.y);
      if (!last || last.x !== cx || last.y !== cy) {
        // complète en ligne droite (pas de diagonales)
        let px = last?.x ?? cx, py = last?.y ?? cy;
        while (px !== cx || py !== cy) {
          if (px !== cx) px += Math.sign(cx - px); else py += Math.sign(cy - py);
          if (!this.wallPath.some(p => p.x === px && p.y === py)) this.wallPath.push({ x: px, y: py });
        }
        this.placing.x = cx; this.placing.y = cy;
      }
      return;
    }
    if (!this.dragOrigin) return;
    const dx = Math.round(w.x - this.dragOrigin.wx), dy = Math.round(w.y - this.dragOrigin.wy);
    for (const [uid, st] of this.dragOrigin.starts) {
      if (uid === -1 && this.placing) { this.placing.x = st.x + dx; this.placing.y = st.y + dy; }
      else this.edit.set(uid, { x: st.x + dx, y: st.y + dy });
    }
  }

  private onDragEnd() {
    if (this.mode === 'place' && this.placing?.type === 'wall' && !this.dragOrigin) { this.renderCtx(); return; }
    const o = this.dragOrigin; this.dragOrigin = null;
    if (!o) return;
    if (this.mode === 'normal' && this.selected !== null) {
      // déplacement direct d'un bâtiment sélectionné (sauvegarde automatique)
      const pos = this.edit.get(this.selected);
      if (pos) {
        const r = this.app.act('move', { moves: [{ uid: this.selected, ...pos }] }, { silent: true });
        if (!r.ok) this.app.toast(r.error ?? 'Emplacement invalide', 'bad'); else audio.sfx('build');
        this.edit.delete(this.selected);
      }
    }
    this.renderCtx();
  }

  // ───── Barre contextuelle ─────
  renderCtx() {
    this.ctx?.remove();
    this.ctx = null;
    const app = this.app, s = app.s;
    const btn = (e: string, label: string, onclick: () => void, cls = '') => h('button', { class: 'btn ' + cls, onclick, 'data-ctx': label }, h('span', { class: 'e' }, e), label);
    let title = '', btns: HTMLElement[] = [];
    if (this.mode === 'place' && this.placing) {
      const d = bdef(this.placing.type);
      title = d.name;
      btns = [
        btn('✖', 'Annuler', () => { this.placing = null; this.wallPath = []; this.setMode('normal'); }, 'red'),
        btn('✔', 'Construire', () => this.confirmPlace(), 'green'),
      ];
    } else if (this.mode === 'edit') {
      title = `Mode édition · ${this.editSel.size} sélectionné(s)`;
      btns = [
        btn('✖', 'Annuler', () => { this.edit.clear(); this.setMode('normal'); }, 'red'),
        btn('🔄', 'Rotation', () => { for (const u of this.editSel) app.act('rotate', { uid: u }, { silent: true }); }, 'ghost'),
        btn('🧱', 'Tout murs', () => { for (const b of s.buildings) if (b.type === 'wall') this.editSel.add(b.uid); this.renderCtx(); }, 'ghost'),
        btn('✔', 'Valider', () => this.commitEdit(), 'green'),
      ];
    } else if (this.selected !== null) {
      const b = s.buildings.find(x => x.uid === this.selected);
      if (!b) { this.selected = null; return; }
      const d = bdef(b.type);
      title = `${d.name} · niv. ${b.level}${b.build ? ` → ${b.build.toLevel} (${fmtTime((b.build.endAt - Date.now()) / 1000)})` : ''}`;
      btns.push(btn('ℹ️', 'Infos', () => P.openBuildingInfo(app, b.uid), 'ghost'));
      if (b.build) {
        btns.push(btn('💎', 'Terminer', () => P.finishNowDialog(app, b.uid), 'purple'));
        btns.push(btn('✖', 'Annuler', () => app.confirm('Annuler le chantier', 'Vous récupérerez 50 % des ressources.', 'Confirmer', () => { app.act('cancel', { uid: b.uid }); this.select(null); }, 'red'), 'red'));
      } else if (b.level < d.levels.length && d.category !== 'decoration') {
        btns.push(btn('⬆️', 'Améliorer', () => P.openBuildingInfo(app, b.uid, true), 'green'));
      }
      if (b.stored && Object.values(b.stored).some(v => (v ?? 0) >= 1)) btns.push(btn('🧺', 'Récolter', () => { const r = app.act('collect', { uid: b.uid }); if (r.ok) this.collectFx(b, r.data); }, 'gold'));
      if (b.type === 'barracks' || b.type === 'army_camp' || b.type === 'workshop' || b.type === 'academy') btns.push(btn('🪖', 'Armée', () => P.openArmy(app), ''));
      if (b.type === 'laboratory') btns.push(btn('⚗️', 'Recherche', () => P.openResearch(app), ''));
      if (b.type === 'temple' || b.type === 'forge') btns.push(btn('🦸', 'Héros', () => P.openHeroes(app), 'gold'));
      if (b.type === 'market') btns.push(btn('⚖️', 'Échanger', () => P.openMarket(app), 'gold'));
      if (b.type === 'guild_portal') btns.push(btn('🛡️', 'Guilde', () => P.openGuild(app), 'purple'));
      if (b.type === 'observatory') btns.push(btn('🗺️', 'Monde', () => P.openWorld(app), ''));
      if (b.type === 'citadel') btns.push(btn('🎨', 'Apparence', () => P.openCosmetics(app), 'ghost'));
      if (d.category === 'wall') btns.push(btn('🧱', 'Rangée', () => { const row = s.buildings.filter(x => x.type === 'wall' && (x.y === b.y || x.x === b.x) && x.level === b.level).map(x => x.uid); P.upgradeWallsDialog(app, row); }, 'ghost'));
      if (d.category === 'decoration' || d.category === 'wall') btns.push(btn('🗑️', 'Retirer', () => { app.act('remove', { uid: b.uid }); this.select(null); }, 'red'));
    } else return;
    this.ctx = h('div', { class: 'ctx-bar' }, h('div', { class: 'ctx-title' }, title), h('div', { class: 'ctx-btns' }, btns));
    this.app.layer.appendChild(this.ctx);
  }

  private confirmPlace() {
    const p = this.placing; if (!p) return;
    const app = this.app;
    if (p.type === 'wall') {
      const cells = this.wallPath.length ? this.wallPath : [{ x: p.x, y: p.y }];
      const r = app.act('walls', { cells });
      if (r.ok) { audio.sfx('build'); app.toast(`${r.data} murailles construites`, 'good'); }
      this.wallPath = [];
      return; // reste en mode murs pour enchaîner
    }
    const r = app.act('place', { type: p.type, x: p.x, y: p.y });
    if (r.ok) {
      audio.sfx('build');
      const c = toScreen(p.x + bdef(p.type).size / 2, p.y + bdef(p.type).size / 2);
      app.r.fx.burst(c.x, c.y, 0, 20, '#bcaaa4', 80, 0.8, 5, PK.smoke);
      this.placing = null;
      this.setMode('normal');
      this.tutorial.event('build:' + p.type);
    }
  }

  private commitEdit() {
    const moves = [...this.edit.entries()].map(([uid, p]) => ({ uid, x: p.x, y: p.y }));
    if (moves.length) {
      const r = this.app.act('move', { moves });
      if (!r.ok) return;
      audio.sfx('build');
      this.app.toast('Disposition sauvegardée', 'good');
    }
    this.edit.clear();
    this.setMode('normal');
  }

  // ───── Rendu ─────
  update(dt: number) {
    this.app.r.cam.update(dt);
    // villageois qui se promènent (vie du village)
    const s = this.app.s;
    if (this.walkers.length < Math.min(8, 2 + Math.floor(s.buildings.length / 8))) {
      const a = s.buildings[Math.floor(Math.random() * s.buildings.length)], b = s.buildings[Math.floor(Math.random() * s.buildings.length)];
      if (a && b && bdef(a.type).category !== 'wall' && bdef(b.type).category !== 'wall') this.walkers.push({ x: a.x + bdef(a.type).size + 0.3, y: a.y + bdef(a.type).size + 0.3, tx: b.x + bdef(b.type).size + 0.3, ty: b.y + bdef(b.type).size + 0.3, type: Math.random() < 0.6 ? 'soldier' : 'archer', t: 0 });
    }
    for (const w of this.walkers) { const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy); w.t += dt; if (d > 0.1) { w.x += dx / d * dt * 1.2; w.y += dy / d * dt * 1.2; } }
    this.walkers = this.walkers.filter(w => Math.hypot(w.tx - w.x, w.ty - w.y) > 0.15 && w.t < 40);
    this.tutorial.update();
  }

  render(dt: number) {
    const app = this.app, s = app.s, now = Date.now();
    const cl = citadelLevel(s);
    const grid = this.mode !== 'normal' || this.dragOrigin ? occupancy(s.buildings, new Set([...this.edit.keys()])) : null;
    const buildings: RBuilding[] = [];
    for (const b of s.buildings) {
      const d = bdef(b.type);
      const pos = this.edit.get(b.uid) ?? b;
      const rb: RBuilding = { uid: b.uid, type: b.type, level: Math.max(1, b.level), x: pos.x, y: pos.y, size: d.size, rot: b.rot, skin: b.type === 'citadel' ? s.inventory.citadelSkin : undefined };
      if (b.build) { rb.constructing = true; rb.progress = Math.min(1, (now - b.build.startAt) / Math.max(1, b.build.endAt - b.build.startAt)); rb.label = fmtTime((b.build.endAt - now) / 1000); if (b.level === 0) rb.level = 1; }
      if (b.stored) {
        const cap = producerCapacity(s, b);
        let best: ResKey | null = null, bv = 0;
        for (const [k, v] of Object.entries(b.stored) as [ResKey, number][]) if (v > bv) { bv = v; best = k; }
        if (best && bv >= Math.max(1, cap * 0.08)) rb.bubble = RES_ICON[best];
      }
      if (this.selected === b.uid || this.editSel.has(b.uid)) {
        rb.selected = true;
        const L = blevel(b.type, Math.max(1, b.level));
        if (L.defense) { rb.range = L.defense.range; rb.minRange = L.defense.minRange; }
      }
      if (this.edit.has(b.uid) && grid) rb.ghost = canPlaceAt(grid, pos.x, pos.y, d.size, cl) && !this.overlapsEdit(b.uid) ? 'ok' : 'bad';
      if (d.category === 'defense') rb.aim = 0.8 + Math.sin(now / 2500 + b.uid) * 0.6;
      buildings.push(rb);
    }
    if (this.mode === 'place' && this.placing) {
      const d = bdef(this.placing.type);
      const g = grid ?? occupancy(s.buildings);
      if (this.placing.type === 'wall' && this.wallPath.length) {
        for (const c of this.wallPath) buildings.push({ uid: -2, type: 'wall', level: 1, x: c.x, y: c.y, size: 1, ghost: canPlaceAt(g, c.x, c.y, 1, cl) ? 'ok' : 'bad' });
      } else buildings.push({ uid: -1, type: this.placing.type, level: 1, x: this.placing.x, y: this.placing.y, size: d.size, ghost: canPlaceAt(g, this.placing.x, this.placing.y, d.size, cl) ? 'ok' : 'bad', selected: true, range: d.levels[0].defense?.range });
    }
    const ev = currentEvent(now).event.id;
    const theme = s.inventory.theme;
    const scene: RScene = {
      buildings,
      units: this.walkers.map((w, i) => ({ id: i, type: w.type, x: w.x, y: w.y, face: Math.atan2(w.ty - w.y, w.tx - w.x), atk: 0, team: 'att' as const, hp: 1 })),
      shots: [], zones: [],
      showGrid: this.mode !== 'normal',
      buildArea: buildArea(cl),
      theme,
      weather: ev === 'storm' ? 'storm' : theme === 'theme_winter' ? 'snow' : theme === 'theme_autumn' ? 'leaves' : 'clear',
    };
    app.r.render(scene, dt);
  }

  private overlapsEdit(uid: number): boolean {
    const a = this.edit.get(uid)!; const sa = bdef(this.app.s.buildings.find(b => b.uid === uid)!.type).size;
    for (const [u, p] of this.edit) {
      if (u === uid) continue;
      const sb = bdef(this.app.s.buildings.find(b => b.uid === u)!.type).size;
      if (a.x < p.x + sb && p.x < a.x + sa && a.y < p.y + sb && p.y < a.y + sa) return true;
    }
    return false;
  }

  focusBuilding(type: string) {
    const b = this.app.s.buildings.find(x => x.type === type);
    if (b) { const sz = bdef(b.type).size; this.app.r.cam.centerOn(b.x + sz / 2, b.y + sz / 2); }
    void MAP_SIZE;
  }
}
