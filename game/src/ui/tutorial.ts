// Tutoriel progressif : construire, récolter, améliorer, entraîner, attaquer, défendre, guilde.
import type { App } from './app';
import type { VillageScene } from './village';
import type { BuildingInstance } from '../core/state';
import { h } from './dom';
import { countOf } from '../village/query';
import { audio } from '../audio/audio';
import { bus } from '../core/events';

interface Step { who: string; text: string; target?: string; done: (app: App, t: Tutorial) => boolean; action?: (app: App, v: VillageScene) => void; actionLabel?: string }

export class Tutorial {
  el: HTMLElement | null = null;
  private flags = new Set<string>();
  private shown = -1;
  static STEPS: Step[] = [
    { who: '👑', text: 'Bienvenue, Souverain ! Votre royaume vous attend. Commençons par construire une seconde Mine d\'or.', target: 'Construire', done: a => countOf(a.s, 'gold_mine') >= 2, actionLabel: 'Construire', action: (_a, v) => v.startPlacing('gold_mine') },
    { who: '🪙', text: 'Vos mines et scieries produisent en continu. Touchez une bulle 🪙 ou 🪵 pour récolter.', done: (_a, t) => t.has('collect') },
    { who: '🔨', text: 'Améliorez un bâtiment : sélectionnez-le puis touchez « Améliorer ». La Citadelle débloque tout le reste !', done: a => a.s.buildings.some(b => (b.build && b.build.toLevel > 1) || (b.level > 1 && b.type !== 'deco_pine')) },
    { who: '🪖', text: 'Une armée se prépare au camp. Ouvrez « Armée » et entraînez quelques soldats.', target: 'Armée', done: a => a.s.army.queue.length > 0 || a.s.player.stats.unitsTrained > 0 },
    { who: '⚔️', text: 'Il est temps d\'attaquer ! Touchez « Attaquer » puis lancez le premier niveau de campagne.', target: 'Attaquer', done: a => (a.s.campaign.stars[1] ?? 0) > 0 },
    { who: '🛡️', text: 'Des monstres approchent ! Défendez votre village : menu « Attaquer » → « Défendre le village ».', target: 'Attaquer', done: a => a.s.player.stats.invasionsRepelled > 0 || a.s.player.stats.defensesWon > 0 },
    { who: '🤝', text: 'Enfin, les guildes : entraide, dons et guerres. Ouvrez le panneau Guilde (Portail requis à la Citadelle 3).', target: 'Guilde', done: (_a, t) => t.has('guild') },
  ];

  private off: () => void;
  constructor(private app: App, private v: VillageScene) { this.off = bus.on('tut', (f: string) => this.event(f)); }
  has(f: string) { return this.flags.has(f); }
  event(f: string) { this.flags.add(f); }
  onSelect(_b: BuildingInstance) { return false; }

  get step() { return this.app.s.player.tutorialStep; }

  show() {
    if (this.app.s.player.tutorialDone) return;
    this.render();
  }
  dispose() { this.off(); this.hide(); }
  hide() { this.el?.remove(); this.el = null; document.querySelectorAll('.pulse').forEach(e => e.classList.remove('pulse')); }

  update() {
    const s = this.app.s;
    if (s.player.tutorialDone) { if (this.el) this.hide(); return; }
    const st = Tutorial.STEPS[s.player.tutorialStep];
    if (!st) return;
    if (st.done(this.app, this)) {
      audio.sfx('reward');
      const next = s.player.tutorialStep + 1;
      if (next >= Tutorial.STEPS.length) {
        this.app.act('tutorial', { step: next, done: true }, { silent: true });
        s.resources.crystals += 100;
        this.app.toast('Tutoriel terminé ! 💎 +100', 'good');
        this.hide();
        return;
      }
      this.app.act('tutorial', { step: next }, { silent: true });
    }
    if (this.shown !== s.player.tutorialStep) this.render();
  }

  private render() {
    this.hide();
    const s = this.app.s;
    const st = Tutorial.STEPS[s.player.tutorialStep];
    if (!st) return;
    this.shown = s.player.tutorialStep;
    this.el = h('div', { class: 'tuto' },
      h('div', { class: 'who' }, st.who),
      h('div', { style: { flex: '1' } }, h('div', { class: 'muted', style: { color: '#7a5a1a' } }, `Étape ${s.player.tutorialStep + 1}/${Tutorial.STEPS.length}`), h('p', null, st.text)),
      st.action ? h('button', { class: 'btn gold small', onclick: () => st.action!(this.app, this.v) }, st.actionLabel ?? 'Go') : null,
      h('button', { class: 'btn ghost small', style: { color: '#3b2a12' }, onclick: () => { this.app.act('tutorial', { step: 99, done: true }, { silent: true }); this.hide(); } }, 'Passer'));
    this.app.layer.appendChild(this.el);
    if (st.target) document.querySelector(`[data-btn="${st.target}"]`)?.classList.add('pulse');
  }
}
