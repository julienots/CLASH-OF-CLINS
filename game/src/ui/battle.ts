// Scène de combat : déploiement tactile, sorts, héros, effets visuels/sonores, résultat.
import type { App, Scene } from './app';
import { Input } from './input';
import { h, clear } from './dom';
import { BattleSim, TICK, type SimEvent, type BattleSetup } from '../combat/sim';
import { makeSetup, invasionSetup, type Opponent, type AppliedResult } from '../combat/setup';
import type { OpponentRef } from '../core/actions';
import type { RBuilding, RShot, RUnit, Scene as RScene } from '../render/renderer';
import { toScreen } from '../render/iso';
import { PK } from '../render/particles';
import { bdef } from '../buildings/defs';
import { UNITS } from '../units/defs';
import { SPELLS, sdef } from '../spells/defs';
import { HEROES } from '../heroes/defs';
import { audio } from '../audio/audio';
import { fmt, fmtTime } from '../core/util';
import { RES_ICON, type ResKey } from '../core/types';
import { UNIT_EMOJI } from './icons';
import { FORMATIONS } from '../campaign/basegen';
import { MAP_SIZE } from '../core/state';
import { CAMPAIGN } from '../campaign/campaign';

type Sel = { kind: 'unit' | 'spell' | 'hero'; id: string } | null;

export class BattleScene implements Scene {
  name = 'battle';
  sim: BattleSim;
  input!: Input;
  sel: Sel = null;
  shots: RShot[] = [];
  speed = 1;
  started = false;
  scoutLeft = 30;
  private acc = 0;
  private bar!: HTMLElement;
  private top!: HTMLElement;
  private abil!: HTMLElement;
  private resultShown = false;
  private lastLootFx = 0;
  private unitAtk = new Map<number, number>();
  private recoil = new Map<number, number>();
  private banner: HTMLElement | null = null;
  invasion: boolean;

  constructor(private app: App, private opp: Opponent | null, private ref: OpponentRef | null, private seed: number, mode: 'attack' | 'invasion' = 'attack') {
    this.invasion = mode === 'invasion';
    const setup: BattleSetup = this.invasion ? invasionSetup(app.s, seed) : makeSetup(app.s, opp!, seed);
    this.sim = new BattleSim(setup);
    if (this.invasion) this.started = true;
  }

  enter() {
    const app = this.app;
    app.r.fx.clear();
    app.r.cam.zoom = Math.max(app.r.cam.minZoom, Math.min(0.9, app.r.cam.minZoom * 1.35));
    app.r.cam.centerOn(MAP_SIZE / 2, MAP_SIZE / 2);
    this.input = new Input(app.r.canvas, app.r.cam, {
      tap: (x, y) => this.onTap(x, y),
      dragStart: () => false,
    });
    // appui long = déploiement continu
    let holdTimer: number | null = null;
    let holdPos = { x: 0, y: 0 };
    const cv = app.r.canvas;
    const startHold = (e: PointerEvent) => {
      if (this.sel?.kind !== 'unit') return;
      holdPos = { x: e.offsetX, y: e.offsetY };
      holdTimer = window.setTimeout(() => { holdTimer = window.setInterval(() => this.deployAt(holdPos.x, holdPos.y, true), 110) as unknown as number; }, 350);
    };
    const stopHold = () => { if (holdTimer !== null) { clearTimeout(holdTimer); clearInterval(holdTimer); holdTimer = null; } };
    cv.addEventListener('pointerdown', startHold);
    cv.addEventListener('pointermove', (e: PointerEvent) => { holdPos = { x: e.offsetX, y: e.offsetY }; });
    cv.addEventListener('pointerup', stopHold);
    cv.addEventListener('pointercancel', stopHold);
    this.disposeHold = () => { stopHold(); cv.removeEventListener('pointerdown', startHold); cv.removeEventListener('pointerup', stopHold); cv.removeEventListener('pointercancel', stopHold); };
    this.top = h('div', { class: 'battle-top' });
    this.bar = h('div', { class: 'unit-bar' });
    this.abil = h('div', { class: 'ability-btn' });
    app.layer.append(this.top, this.bar, this.abil);
    // sélection initiale
    const first = Object.entries(this.sim.remaining).find(([, n]) => n > 0);
    if (first) this.sel = { kind: 'unit', id: first[0] };
    this.renderBar();
    this.renderTop();
    audio.music('battle');
    if (!this.invasion && Object.values(this.sim.remaining).every(n => n <= 0) && Object.keys(this.sim.heroesLeft).length === 0) app.toast('Aucune troupe ! Entraînez une armée avant d\'attaquer.', 'bad');
    if (this.invasion) this.showBanner('👹 Invasion ! Touchez la carte pour la Frappe royale ⚡');
    else this.showBanner(`Phase d'observation : ${this.opp?.campaignIndex ? CAMPAIGN[this.opp.campaignIndex - 1].intro : 'déployez hors des zones rouges.'}`);
  }
  private disposeHold: () => void = () => {};
  exit() { this.input.dispose(); this.disposeHold(); this.banner?.remove(); }

  private showBanner(text: string, ms = 3500) {
    this.banner?.remove();
    this.banner = h('div', { class: 'toast', style: { position: 'absolute', top: '90px', left: '50%', transform: 'translateX(-50%)', animation: 'none', zIndex: '20' } }, text);
    this.app.layer.appendChild(this.banner);
    const b = this.banner;
    setTimeout(() => b.remove(), ms);
  }

  // ───── Entrées ─────
  private onTap(x: number, y: number) {
    if (this.sim.ended) return;
    const w = this.app.r.cam.viewToWorld(x, y);
    if (this.invasion) {
      if (this.sim.command({ tick: 0, t: 'royal', x: w.x, y: w.y })) { audio.sfx('zap'); this.app.r.shake = 6; }
      else this.app.toast('Frappe royale en recharge…', 'bad');
      return;
    }
    if (!this.sel) return;
    if (this.sel.kind === 'spell') {
      const ok = this.sim.command({ tick: 0, t: 'spell', spell: this.sel.id, x: w.x, y: w.y });
      if (!ok) { this.app.toast((this.sim.spellReadyAt[this.sel.id] ?? 0) > this.sim.tick ? 'Sort en recharge' : 'Plus de sorts de ce type', 'bad'); audio.sfx('error'); }
      else { this.started = true; this.app.vibrate(15); }
      this.renderBar();
      return;
    }
    this.deployAt(x, y, false);
  }

  private deployAt(x: number, y: number, repeat: boolean) {
    if (!this.sel || this.sim.ended) return;
    const w = this.app.r.cam.viewToWorld(x, y);
    let ok = false;
    if (this.sel.kind === 'unit') ok = this.sim.command({ tick: 0, t: 'deploy', unit: this.sel.id, x: w.x + (repeat ? (Math.random() - 0.5) * 0.6 : 0), y: w.y + (repeat ? (Math.random() - 0.5) * 0.6 : 0) });
    else if (this.sel.kind === 'hero') ok = this.sim.command({ tick: 0, t: 'hero', hero: this.sel.id, x: w.x, y: w.y });
    if (!ok) {
      if (!this.sim.canDeployAt(w.x, w.y)) { if (!repeat) { this.app.toast('Zone interdite : déployez hors des zones rouges', 'bad'); audio.sfx('error'); } }
      else if (!repeat) this.app.toast('Plus d\'unités de ce type', 'bad');
      this.flashForbidden = 1.2;
      return;
    }
    this.started = true;
    audio.sfx('deploy');
    this.app.vibrate(8);
    if (this.sel.kind === 'hero' || (this.sim.remaining[this.sel.id] ?? 0) <= 0) {
      const next = Object.entries(this.sim.remaining).find(([, n]) => n > 0);
      this.sel = next ? { kind: 'unit', id: next[0] } : null;
    }
    this.renderBar();
  }
  private flashForbidden = 0;

  // ───── HUD de combat ─────
  private renderTop() {
    clear(this.top);
    const sim = this.sim;
    const stars = h('div', { class: 'stars' }, [0, 1, 2].map(i => h('span', { class: i < sim.stars ? 'on' : '' }, '★')));
    const loot = h('div', { class: 'muted' }, ...(['gold', 'wood', 'energy'] as ResKey[]).filter(k => this.totalLoot[k]).map(k => h('div', null, `${RES_ICON[k]} ${fmt(sim.lootGained[k])} / ${fmt(this.totalLoot[k])}`)));
    const name = this.invasion ? 'Invasion sauvage' : this.opp?.name ?? '';
    const sub = this.invasion ? 'Défendez votre village !' : `Citadelle ${this.opp?.citadel} · ${FORMATIONS[this.opp!.formation]}${this.opp?.trophies ? ' · 🏆 ' + this.opp.trophies : ''}`;
    this.top.append(
      h('div', { class: 'opp' }, h('h3', null, name), h('div', { class: 'muted' }, sub), loot),
      h('div', { class: 'timer' }, h('div', { class: 'muted' }, this.started ? 'Fin du combat' : 'Observation'), h('b', null, this.started ? fmtTime(sim.timeLeft) : `${Math.ceil(this.scoutLeft)}s`)),
      h('div', { class: 'opp', style: { textAlign: 'right' } }, stars, h('div', { class: 'dmg' }, `${sim.destruction}%`),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '4px' } },
          h('button', { class: 'btn small ghost', onclick: () => { this.speed = this.speed === 1 ? 2 : 1; this.renderTop(); } }, `×${this.speed}`),
          h('button', { class: 'btn small red', onclick: () => this.surrender() }, this.sim.deployed ? 'Terminer' : 'Quitter'))));
  }
  private get totalLoot() {
    if (!this._total) { this._total = { gold: 0, wood: 0, energy: 0, crystals: 0 }; for (const r of Object.values(this.sim.setup.loot)) for (const [k, v] of Object.entries(r)) this._total[k as ResKey] += v ?? 0; }
    return this._total;
  }
  private _total: Record<ResKey, number> | null = null;

  private renderBar() {
    clear(this.bar);
    if (this.invasion) { this.bar.append(h('div', { class: 'muted', style: { padding: '10px' } }, 'Vos défenses et vos héros protègent le village. Touchez pour lancer la Frappe royale ⚡ (6 s de recharge).')); return; }
    const sim = this.sim;
    const slot = (sel: Sel, emoji: string, label: string, n: number | string, cls: string, extra?: HTMLElement) => h('div', {
      class: `slot ${cls} ${this.sel && sel && this.sel.kind === sel.kind && this.sel.id === sel.id ? 'sel' : ''} ${n === 0 ? 'empty' : ''}`,
      onclick: () => { this.sel = sel; audio.sfx('click'); this.renderBar(); }, 'data-slot': sel?.id,
    }, h('span', { class: 'n' }, typeof n === 'number' ? '×' + n : n), h('span', { class: 'e' }, emoji), label, extra);
    for (const [id, n] of Object.entries(sim.setup.attacker.units)) if (n > 0) slot && this.bar.append(slot({ kind: 'unit', id }, UNIT_EMOJI[id] ?? '❔', UNITS[id].name, sim.remaining[id] ?? 0, ''));
    for (const hl of sim.setup.attacker.heroes) {
      const hd = HEROES.find(x => x.id === hl.id)!;
      const deployed = !sim.heroesLeft[hl.id];
      const u = sim.units.find(x => x.hero === hl.id && x.team === 'att');
      const ult = h('div', { class: 'ult' }, h('i', { style: { width: Math.round((u?.ultCharge ?? 0) * 100) + '%' } }));
      this.bar.append(slot(deployed ? null : { kind: 'hero', id: hl.id }, hd.id === 'arkon' ? '🪓' : hd.id === 'lyra' ? '🏹' : hd.id === 'bronn' ? '🛡️' : '🗡️', hd.name, deployed ? (u?.alive ? 'actif' : '✝') : `niv${hl.level}`, 'hero', ult));
    }
    for (const sp of SPELLS) {
      const n = sim.setup.attacker.spells[sp.id];
      if (!n) continue;
      const cd = (sim.spellReadyAt[sp.id] ?? 0) > sim.tick ? h('div', { class: 'cd' }) : undefined;
      this.bar.append(slot({ kind: 'spell', id: sp.id }, sp.icon, sp.name, sim.spellsLeft[sp.id] ?? 0, 'spell', cd));
    }
    if (!this.bar.children.length) this.bar.append(h('div', { class: 'muted', style: { padding: '10px' } }, 'Aucune troupe disponible. Quittez et entraînez une armée.'));
    // boutons de compétences des héros déployés
    clear(this.abil);
    for (const u of sim.units) {
      if (!u.hero || u.team !== 'att' || !u.alive) continue;
      const hd = HEROES.find(x => x.id === u.hero)!;
      if (!u.abilityUsed) this.abil.append(h('button', { class: 'btn purple small', onclick: () => { if (sim.command({ tick: 0, t: 'ability', hero: hd.id })) audio.sfx('ability'); this.renderBar(); } }, `✨ ${hd.ability.name}`));
      if (u.ultCharge >= 1) this.abil.append(h('button', { class: 'btn gold small pulse', onclick: () => { const c = this.app.r.cam.viewToWorld(this.app.r.cam.vw / 2, this.app.r.cam.vh / 2); if (sim.command({ tick: 0, t: 'ultimate', hero: hd.id, x: u.x, y: u.y }) || sim.command({ tick: 0, t: 'ultimate', hero: hd.id, x: c.x, y: c.y })) { audio.sfx('ability'); this.app.r.shake = 8; } this.renderBar(); } }, `💥 ${hd.ultimate.name}`));
    }
  }

  private surrender() {
    if (!this.sim.deployed) { this.app.nav.village(); return; }
    this.app.confirm('Terminer le combat', 'Le combat sera arrêté et le résultat calculé.', 'Terminer', () => { this.sim.command({ tick: 0, t: 'surrender' }); }, 'red');
  }

  // ───── Boucle ─────
  update(dt: number) {
    const app = this.app;
    app.r.cam.update(dt);
    this.flashForbidden = Math.max(0, this.flashForbidden - dt);
    if (!this.sim.ended) {
      if (!this.started) {
        this.scoutLeft -= dt;
        if (this.scoutLeft <= 0) { this.started = true; this.showBanner('Le combat commence !'); }
      } else {
        this.acc += dt * this.speed;
        let steps = 0;
        while (this.acc >= TICK && steps < 8) {
          this.acc -= TICK; steps++;
          const evs = this.sim.step();
          this.handleEvents(evs);
          if (this.sim.ended) break;
        }
      }
    }
    for (const s of this.shots) s.t += dt * this.speed;
    this.shots = this.shots.filter(s => s.t < s.dur + 0.05);
    for (const [k, v] of this.recoil) { const nv = v - dt * 4; if (nv <= 0) this.recoil.delete(k); else this.recoil.set(k, nv); }
    if (Math.floor(this.sim.time * 4) !== Math.floor((this.sim.time - dt) * 4) || !this.started) { this.renderTop(); }
    if (this.sim.tick % 5 === 0) this.renderBar();
    if (this.sim.ended && !this.resultShown) { this.resultShown = true; setTimeout(() => this.finish(), 900); }
  }

  private handleEvents(evs: SimEvent[]) {
    const fx = this.app.r.fx;
    for (const e of evs) {
      switch (e.e) {
        case 'shot': {
          const arc = e.kind === 'shell' || e.kind === 'catapult' ? 60 : e.kind === 'arrow' || e.kind === 'archer' ? 12 : 4;
          this.shots.push({ fx: e.fx, fy: e.fy, tx: e.tx, ty: e.ty, kind: e.kind, t: 0, dur: e.dur, arc });
          if (e.from > 0) this.recoil.set(e.from, 1);
          else this.unitAtk.set(-e.from, this.sim.tick);
          audio.sfx(e.kind === 'ball' || e.kind === 'shell' || e.kind === 'bolt' ? 'cannon' : e.kind === 'arrow' || e.kind === 'archer' ? 'arrow' : e.kind === 'lightning' || e.kind === 'arcane' ? 'zap' : e.kind === 'rocket' ? 'cannon' : 'magic');
          break;
        }
        case 'swing': audio.sfx('hit'); break;
        case 'hit': {
          const s = toScreen(e.x, e.y);
          if (e.r >= 1) {
            fx.burst(s.x, s.y, 4, Math.round(10 + e.r * 6), e.kind === 'lightning' ? '#b3e5fc' : e.kind === 'star' ? '#fff59d' : e.kind === 'shadow' || e.kind === 'eclipse' ? '#ce93d8' : '#ffab40', 90 * e.r, 0.6, 4, PK.dot, 60);
            fx.spawn(s.x, s.y, 0, 0, 0, 0, 0.5, e.r * 28, e.kind === 'lightning' ? '#81d4fa' : '#ff9800', PK.ring);
            fx.burst(s.x, s.y, 10, 6, 'rgba(90,90,90,0.6)', 30, 1.2, 8, PK.smoke);
            audio.sfx(e.kind === 'lightning' ? 'zap' : 'explosion');
            if (e.r >= 2) this.app.r.shake = Math.max(this.app.r.shake, 5);
          } else fx.burst(s.x, s.y, 8, 4, '#fff3e0', 40, 0.3, 2);
          break;
        }
        case 'destroy': {
          const s = toScreen(e.x, e.y);
          fx.burst(s.x, s.y, 20, 18 + e.size * 6, '#8d6e63', 120, 1.2, 5, PK.debris, 200);
          fx.burst(s.x, s.y, 20, 10, 'rgba(80,80,80,0.6)', 30, 1.8, 14, PK.smoke);
          fx.spawn(s.x, s.y - 20, 0, 0, 0, 0, 0.5, 40 + e.size * 10, '#ffcc80', PK.glow);
          this.app.r.shake = Math.max(this.app.r.shake, e.size >= 3 ? 7 : 2);
          audio.sfx(e.size >= 2 ? 'destroy' : 'hit');
          break;
        }
        case 'death': { const s = toScreen(e.x, e.y); fx.burst(s.x, s.y, 6, 6, e.team === 'att' ? '#e0e0e0' : '#ef9a9a', 40, 0.6, 3, PK.smoke); audio.sfx('death'); break; }
        case 'trap': {
          const s = toScreen(e.x, e.y);
          const col = e.type === 'ice_trap' ? '#80deea' : e.type === 'rune_trap' ? '#ce93d8' : e.type === 'spring_trap' ? '#fff' : '#ff7043';
          fx.spawn(s.x, s.y, 0, 0, 0, 0, 0.7, e.r * 30, col, PK.ring);
          fx.burst(s.x, s.y, 4, 20, col, 120, 0.8, 4, PK.dot, 80);
          audio.sfx(e.type === 'ice_trap' ? 'freeze' : 'explosion');
          this.app.r.shake = 4;
          break;
        }
        case 'spell': {
          const s = toScreen(e.x, e.y); const sd = sdef(e.spell);
          fx.spawn(s.x, s.y, 0, 0, 0, 0, 0.9, e.r * 36, sd.color, PK.ring);
          fx.burst(s.x, s.y, 30, 30, sd.color, 100, 1, 4, PK.dot, 50);
          audio.sfx(e.spell === 'lightning' ? 'zap' : e.spell === 'heal' ? 'heal' : e.spell === 'freeze' ? 'freeze' : e.spell === 'meteor' ? 'explosion' : 'magic');
          if (e.spell === 'meteor') { fx.spawn(s.x, s.y - 120, 0, 0, 120 * 1.2, 0, 0.9, 18, '#ff6e40', PK.glow); this.app.r.shake = 10; }
          break;
        }
        case 'deploy': { const s = toScreen(e.x, e.y); fx.burst(s.x, s.y, 2, 6, '#d7ccc8', 30, 0.5, 4, PK.smoke); break; }
        case 'ability': { const s = toScreen(e.x, e.y); fx.text(s.x, s.y - 60, e.name + ' !', '#ffd54f', 18); fx.spawn(s.x, s.y, 0, 0, 0, 0, 0.8, 70, '#ffd54f', PK.ring); break; }
        case 'heal': { const s = toScreen(e.x, e.y); fx.burst(s.x, s.y, 20, 4, '#69f0ae', 20, 0.8, 3); break; }
        case 'loot': {
          if (this.sim.tick - this.lastLootFx > 3) { this.lastLootFx = this.sim.tick; const s = toScreen(e.x, e.y); fx.text(s.x, s.y - 50, `+${fmt(e.amount)} ${RES_ICON[e.res]}`, e.res === 'gold' ? '#ffd54f' : '#d7a46a', 14); }
          break;
        }
        case 'star': audio.sfx('star'); this.showBanner('★'.repeat(e.stars) + ' Étoile obtenue !', 1500); this.app.vibrate(40); break;
      }
    }
  }

  private finish() {
    const app = this.app;
    const sim = this.sim;
    if (this.invasion) {
      const r = app.act('invasion', { seed: this.seed, commands: sim.log });
      const won = r.ok && r.data.won;
      audio.sfx(won ? 'victory' : 'defeat');
      this.resultPanel(won ? 'Village défendu !' : 'Le village est tombé…', won, sim.stars, sim.destruction, r.ok ? r.data.reward : {}, won ? (Object.keys(r.data.reward ?? {}).length ? 'Les habitants célèbrent votre victoire.' : 'Victoire ! (récompense en recharge : revenez plus tard)') : 'Améliorez vos défenses et réessayez.');
      return;
    }
    // validation : le résultat est recalculé à partir de la liste de commandes (comme le serveur)
    const r = app.act('battle', { opponent: this.ref, seed: this.seed, commands: sim.log, allowEmpty: true });
    if (!r.ok) { this.resultPanel('Combat annulé', false, 0, 0, {}, r.error ?? ''); return; }
    const res = r.data.result as { stars: number; destruction: number };
    const ap = r.data.applied as AppliedResult;
    if (res.stars !== sim.stars || res.destruction !== sim.destruction) console.warn('Désynchronisation de replay', res, sim.stars, sim.destruction);
    audio.sfx(res.stars > 0 ? 'victory' : 'defeat');
    const extra = [ap.trophies ? `🏆 ${ap.trophies > 0 ? '+' : ''}${ap.trophies}` : '', ap.crystals ? `💎 +${ap.crystals}` : '', ap.newStars ? `⭐ +${ap.newStars} étoile(s) de campagne` : ''].filter(Boolean).join(' · ');
    this.resultPanel(res.stars > 0 ? 'Victoire !' : 'Défaite', res.stars > 0, res.stars, res.destruction, { ...ap.loot, ...(ap.reward ?? {}) }, extra);
  }

  private resultPanel(title: string, won: boolean, stars: number, destruction: number, gains: Partial<Record<ResKey, number>>, sub: string) {
    const app = this.app;
    app.openPanel(won ? '🏆 Résultat' : 'Résultat', body => {
      body.append(h('div', { class: 'result' },
        h('h1', null, title),
        h('div', { class: 'big-stars stars' }, [0, 1, 2].map(i => h('span', { class: i < stars ? 'on' : '' }, '★'))),
        h('div', { class: 'dmg' }, `Destruction : ${destruction}%`),
        h('div', { class: 'cost', style: { justifyContent: 'center', fontSize: '20px', margin: '12px 0' } }, ...(Object.entries(gains) as [ResKey, number][]).filter(([, v]) => v > 0).map(([k, v]) => h('span', null, `${RES_ICON[k]} +${fmt(v)}`))),
        h('p', { class: 'muted' }, sub),
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn gold', 'data-btn': 'Retour', onclick: () => app.nav.village() }, '🏰 Retour au village'))));
    }, { onClose: () => app.nav.village() });
  }

  // ───── Rendu ─────
  render(dt: number) {
    const sim = this.sim;
    const t = sim.tick;
    const buildings: RBuilding[] = sim.buildings.map(b => ({
      uid: b.uid, type: b.type, level: b.level, x: b.x, y: b.y, size: b.size,
      hpFrac: b.hp / b.maxHp, destroyed: !b.alive,
      aim: b.def ? Math.atan2(b.aimY, b.aimX) : undefined,
      recoil: this.recoil.get(b.uid) ?? 0,
      frozen: b.frozenUntil > t, stunned: b.stunnedUntil > t,
      skin: b.isCitadel && this.invasion ? this.app.s.inventory.citadelSkin : undefined,
    }));
    for (const tr of sim.traps) if ((tr.revealed || this.invasion) && !tr.triggered) buildings.push({ uid: -tr.uid, type: tr.type, level: 1, x: Math.floor(tr.x - tr.size / 2), y: Math.floor(tr.y - tr.size / 2), size: tr.size, alpha: 0.7 });
    const units: RUnit[] = [];
    const a = (1 - (this.acc / TICK)) ;
    for (const u of sim.units) {
      if (!u.alive) continue;
      const k = Math.max(0, Math.min(1, 1 - a));
      const hd = u.hero ? HEROES.find(x => x.id === u.hero) : undefined;
      let skinColor: string | undefined, skinAccent: string | undefined;
      if (hd && u.team === 'att') { const skin = hd.skins.find(s => s.id === this.app.s.heroes[hd.id]?.skin) ?? hd.skins[0]; skinColor = skin.color; skinAccent = skin.accent; }
      units.push({
        id: u.id, type: u.type, x: u.px + (u.x - u.px) * k, y: u.py + (u.y - u.py) * k, face: u.facing,
        atk: Math.max(0, 1 - (t - u.lastAttack) / 3), team: u.team, hp: u.hp / u.maxHp, hero: u.hero, skinColor, skinAccent,
        frozen: u.frozenUntil > t, invisible: u.invisUntil > t, flying: u.flying, shield: u.shield > 0, raged: u.rageUntil > t,
      });
    }
    const rubble = sim.buildings.filter(b => !b.alive && !b.isWall).map(b => ({ x: b.x, y: b.y, size: b.size }));
    const zones = [
      ...sim.zones.map(z => ({ x: z.x, y: z.y, r: z.r, color: sdef(z.spell).color })),
      ...sim.traps.filter(tr => tr.zoneUntil > t).map(tr => ({ x: tr.x, y: tr.y, r: tr.stats.radius, color: '#ce93d8' })),
    ];
    const showForbidden = !this.invasion && (!this.started || this.flashForbidden > 0 || (this.sel?.kind !== 'spell' && !this.sim.deployed));
    const scene: RScene = {
      buildings, units, shots: this.shots, zones, showGrid: false,
      forbidden: showForbidden ? sim.forbiddenMask() : null, deployHint: showForbidden,
      theme: this.invasion ? this.app.s.inventory.theme : this.opp?.kind === 'event' ? 'theme_desert' : this.opp?.campaignIndex && this.opp.campaignIndex > 10 && this.opp.campaignIndex <= 15 ? 'theme_winter' : 'classic',
      weather: this.opp?.campaignIndex && this.opp.campaignIndex > 10 && this.opp.campaignIndex <= 15 ? 'snow' : this.invasion ? 'storm' : 'clear',
      rubble,
    };
    this.app.r.render(scene, dt);
    void bdef;
  }
}

export function newBattleSeed() { return (Math.random() * 2 ** 31) >>> 0; }
export type { Opponent };
