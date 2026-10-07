// Contrôleur principal du client : état, actions, sauvegarde, scènes, panneaux, notifications.
import type { GameState } from '../core/state';
import { dispatch } from '../core/actions';
import { advance } from '../core/game';
import { SaveManager, type StorageBackend } from '../save/save';
import { Renderer } from '../render/renderer';
import { audio } from '../audio/audio';
import { h, clear } from './dom';
import type { ActionResult } from '../core/types';
import { tickGuild } from '../guilds/guild';
import { tickWar } from '../wars/war';
import { syncMissions } from '../progression/missions';
import { syncSeason } from '../battlepass/pass';
import { processOfflineDefenses } from '../defense/offlineDefense';
import { PurchaseService, AndroidBillingProvider, MockBillingProvider, type BillingProvider } from '../purchases/iap';
import { grantProduct } from '../shop/catalog';
import { checkOnline, isOnline, serverConfigured, call } from '../networking/api';

export interface Scene {
  name: string;
  enter(): void;
  exit(): void;
  update(dt: number): void;
  render(dt: number): void;
  onResize?(): void;
}

export interface PanelHandle { close(): void; refresh(): void; el: HTMLElement }

declare global { interface Window { KingdomsNative?: { save(data: string): void; load(): string; vibrate(ms: number): void; isRelease(): boolean; share(text: string): void; exit(): void } } }

export function platformStorage(): StorageBackend {
  const native = typeof window !== 'undefined' ? window.KingdomsNative : undefined;
  return {
    get: k => {
      let v: string | null = null;
      try { v = localStorage.getItem(k); } catch { /* stockage indisponible */ }
      if (!v && native && k === 'kingdoms.save') { try { v = native.load() || null; } catch { /* */ } }
      return v;
    },
    set: (k, v) => {
      try { localStorage.setItem(k, v); } catch { /* quota */ }
      if (native && k === 'kingdoms.save') { try { native.save(v); } catch { /* */ } }
    },
    remove: k => { try { localStorage.removeItem(k); } catch { /* */ } if (native && k === 'kingdoms.save') { try { native.save(''); } catch { /* */ } } },
  };
}

export class App {
  s!: GameState;
  saver: SaveManager;
  r: Renderer;
  ui: HTMLElement;
  layer: HTMLElement;
  toasts: HTMLElement;
  scene: Scene | null = null;
  panels: { handle: PanelHandle; render: (body: HTMLElement, h2: PanelHandle) => void; body: HTMLElement }[] = [];
  purchases: PurchaseService;
  private saveTimer = 0;
  private dirty = false;
  private tickAcc = 0;
  hooks: { onStateChange: (() => void)[] } = { onStateChange: [] };
  release: boolean;
  nav: { village(): void; battle(opp: import('../combat/setup').Opponent, ref: import('../core/actions').OpponentRef): void; invasion(): void } = { village() {}, battle() {}, invasion() {} };

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.r = new Renderer(canvas);
    this.ui = ui;
    this.layer = h('div', { class: 'layer' });
    this.toasts = h('div', { class: 'toasts' });
    this.saver = new SaveManager(platformStorage());
    this.release = !!window.KingdomsNative?.isRelease?.();
    const provider: BillingProvider = window.KingdomsBilling ? new AndroidBillingProvider() : new MockBillingProvider();
    this.purchases = new PurchaseService(provider, {
      grant: (pid, token) => { const r = grantProduct(this.s, pid, token); if (r.ok) { this.changed(); this.save(true); } return r; },
      addPending: raw => { if (!this.s.shop.pendingTokens.includes(raw)) this.s.shop.pendingTokens.push(raw); this.save(true); },
      isProcessed: token => this.s.shop.tokens.includes(token),
    });
  }

  load(now: number) {
    const { state, status } = this.saver.load(now);
    this.s = state;
    const from = state.lastTick;
    advance(this.s, now, { report: true });
    const attacks = processOfflineDefenses(this.s, from, now);
    syncMissions(this.s, now);
    syncSeason(this.s, now);
    this.r.setQuality(this.s.settings.quality);
    audio.setVolumes(this.s.settings.music, this.s.settings.sfx);
    if (status === 'recovered') this.toast('Sauvegarde restaurée depuis la copie de secours', 'bad');
    if (status === 'migrated') this.toast('Sauvegarde mise à jour vers la nouvelle version', 'good');
    this.save(true);
    return { status, attacks };
  }

  now() { return Date.now(); }

  /** Exécute une action de jeu via le registre partagé (même code que le serveur). */
  act(name: string, args: any = {}, opts: { silent?: boolean; sound?: string } = {}): ActionResult<any> {
    const r = dispatch(this.s, name, args, this.now());
    if (!r.ok) {
      if (!opts.silent) { this.toast(r.error ?? 'Action impossible', 'bad'); audio.sfx('error'); this.vibrate(30); }
    } else {
      if (opts.sound) audio.sfx(opts.sound);
      this.changed();
      if (isOnline()) void call('POST', '/action', { name, args, at: this.now() }).catch(() => { /* re-synchronisé plus tard */ });
    }
    return r;
  }

  changed() {
    this.dirty = true;
    for (const f of this.hooks.onStateChange) f();
    this.refreshPanels();
  }

  save(now = false) {
    if (now) { this.saver.save(this.s); this.dirty = false; return; }
    this.dirty = true;
  }

  vibrate(ms: number) {
    if (!this.s?.settings.vibration) return;
    try { if (window.KingdomsNative) window.KingdomsNative.vibrate(ms); else navigator.vibrate?.(ms); } catch { /* */ }
  }

  toast(msg: string, kind: 'good' | 'bad' | '' = '') {
    const t = h('div', { class: 'toast ' + kind }, msg);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), 2500);
  }

  setScene(sc: Scene) {
    this.closeAllPanels();
    this.scene?.exit();
    this.scene = sc;
    clear(this.ui);
    this.ui.appendChild(this.layer);
    clear(this.layer);
    sc.enter();
    this.ui.appendChild(this.toasts);
  }

  // ───── Panneaux modaux ─────
  openPanel(title: string, render: (body: HTMLElement, p: PanelHandle) => void, opts: { wide?: boolean; onClose?: () => void } = {}): PanelHandle {
    audio.sfx('open');
    const body = h('div', { class: 'panel-body' });
    const titleEl = h('h2', null, title);
    const panel = h('div', { class: 'panel' + (opts.wide ? ' wide' : '') }, h('div', { class: 'panel-head' }, titleEl, h('button', { class: 'close', onclick: () => handle.close(), 'aria-label': 'Fermer' }, '✕')), body);
    const back = h('div', { class: 'backdrop', onpointerdown: (e: Event) => { if (e.target === back) handle.close(); } }, panel);
    const entry = { handle: null as unknown as PanelHandle, render, body };
    const handle: PanelHandle = {
      el: panel,
      close: () => { back.remove(); this.panels = this.panels.filter(p => p !== entry); opts.onClose?.(); },
      refresh: () => { const st = body.scrollTop; clear(body); render(body, handle); body.scrollTop = st; },
    };
    entry.handle = handle;
    this.panels.push(entry);
    this.ui.insertBefore(back, this.toasts);
    render(body, handle);
    return handle;
  }
  refreshPanels() { for (const p of this.panels) p.handle.refresh(); }
  closeAllPanels() { for (const p of [...this.panels]) p.handle.close(); }

  confirm(title: string, text: string, okLabel: string, onOk: () => void, cls = 'green') {
    const p = this.openPanel(title, body => {
      body.append(h('p', null, text), h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn ghost', onclick: () => p.close() }, 'Annuler'),
        h('button', { class: 'btn ' + cls, onclick: () => { p.close(); onOk(); } }, okLabel)));
    });
  }

  // ───── Boucle ─────
  frame(dt: number) {
    this.tickAcc += dt;
    if (this.tickAcc >= 1) {
      this.tickAcc = 0;
      const now = this.now();
      if (this.scene?.name !== 'battle') {
        const before = this.s.buildings.filter(b => b.build).length + (this.s.research.active ? 1 : 0);
        advance(this.s, now);
        tickGuild(this.s, now);
        tickWar(this.s, now, 1);
        syncMissions(this.s, now);
        syncSeason(this.s, now);
        const after = this.s.buildings.filter(b => b.build).length + (this.s.research.active ? 1 : 0);
        if (after < before) { audio.sfx('upgrade'); this.toast('Construction terminée !', 'good'); this.changed(); }
        for (const f of this.hooks.onStateChange) f();
      }
      this.saveTimer += 1;
      if (this.dirty && this.saveTimer >= 3) { this.saveTimer = 0; this.save(true); }
    }
    this.scene?.update(dt);
    this.scene?.render(dt);
  }

  async connect() {
    if (!serverConfigured()) return;
    await checkOnline(true);
  }
}
