// HUD du village : ressources, profil, ouvriers, bouclier, événement, boutons principaux.
import type { App } from './app';
import { h } from './dom';
import { fmt, fmtTime } from '../core/util';
import { storageCap, citadelLevel, builderCount, freeBuilders } from '../village/query';
import { xpForLevel } from '../progression/progression';
import { currentEvent } from '../events/events';
import { isOnline, serverConfigured } from '../networking/api';
import { passTier } from '../battlepass/pass';
import { missionDef } from '../progression/missions';

export interface HudCallbacks {
  attack(): void; build(): void; army(): void; guild(): void; shop(): void; pass(): void; world(): void; menu(): void; events(): void; profile(): void; missions(): void; edit(): void; builders(): void; log(): void;
}

export class Hud {
  root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  constructor(private app: App, cb: HudCallbacks) {
    const res = (k: string, icon: string, color: string) => {
      const fill = h('div', { class: 'fill', style: { background: color } });
      const val = h('b', null, '0');
      const cap = h('small', null, '');
      this.els[k] = val; this.els[k + 'Fill'] = fill; this.els[k + 'Cap'] = cap;
      return h('div', { class: 'res ' + k, onclick: k === 'crystals' ? () => cb.shop() : undefined }, fill, cap, val, h('span', { class: 'ic' }, icon));
    };
    const iconBtn = (e: string, label: string, onclick: () => void, cls = '', badgeKey?: string) => {
      const badge = badgeKey ? (this.els[badgeKey] = h('span', { class: 'badge', style: { display: 'none' } })) : null;
      return h('button', { class: 'btn icon-btn ' + cls, onclick, 'data-btn': label }, h('span', { class: 'e' }, e), label, badge);
    };
    this.els.lvl = h('div', { class: 'lvl-badge' }, '1');
    this.els.xp = h('i');
    this.els.name = h('b');
    this.els.trophies = h('span');
    this.els.builders = h('span');
    this.els.shield = h('span');
    this.els.event = h('span');
    this.els.net = h('span');
    this.els.fps = h('div', { class: 'fps', style: { display: 'none' } });
    this.root = h('div', null,
      h('div', { class: 'hud-top' },
        h('div', null,
          h('div', { class: 'profile-chip', onclick: () => cb.profile(), style: { cursor: 'pointer' } }, this.els.lvl, h('div', null, this.els.name, h('div', { class: 'xpbar' }, this.els.xp))),
          h('div', { class: 'chips' },
            h('div', { class: 'chip' }, '🏆', this.els.trophies),
            h('div', { class: 'chip', onclick: () => cb.builders(), style: { cursor: 'pointer' } }, '👷', this.els.builders),
            h('div', { class: 'chip', onclick: () => cb.log(), style: { cursor: 'pointer' } }, '🛡️', this.els.shield)),
          h('div', { class: 'chips' }, h('div', { class: 'chip event-chip', onclick: () => cb.events() }, this.els.event), h('div', { class: 'chip', 'data-net': 1 }, this.els.net))),
        h('div', { class: 'res-col' }, res('gold', '🪙', '#f2c94c'), res('wood', '🪵', '#a0703c'), res('energy', '⚡', '#4dd0e1'), res('crystals', '💎', '#b388ff'))),
      h('div', { class: 'left-btns' },
        iconBtn('🗺️', 'Monde', cb.world, 'ghost'),
        iconBtn('📜', 'Missions', cb.missions, 'ghost', 'missionsBadge'),
        iconBtn('👑', 'Pass', cb.pass, 'ghost', 'passBadge')),
      h('div', { class: 'hud-bottom' },
        h('button', { class: 'btn gold big-attack', onclick: cb.attack, 'data-btn': 'Attaquer' }, h('span', { class: 'e' }, '⚔️'), 'Attaquer'),
        h('div', { class: 'right-row' },
          iconBtn('🛡️', 'Guilde', cb.guild, 'purple'),
          iconBtn('🪖', 'Armée', cb.army, ''),
          iconBtn('🛒', 'Boutique', cb.shop, 'gold'),
          iconBtn('🔨', 'Construire', cb.build, 'green'),
          iconBtn('☰', 'Menu', cb.menu, 'ghost'))),
      this.els.fps);
    this.update();
  }

  update() {
    const s = this.app.s; const now = Date.now();
    const cap = storageCap(s);
    for (const k of ['gold', 'wood', 'energy', 'crystals'] as const) {
      this.els[k].textContent = fmt(s.resources[k]);
      if (k !== 'crystals') {
        const f = cap[k] ? s.resources[k] / cap[k] : 0;
        this.els[k + 'Fill'].style.width = Math.round(f * 100) + '%';
        this.els[k + 'Cap'].textContent = cap[k] ? 'max ' + fmt(cap[k]) : '';
      }
    }
    (this.els.energy.parentElement as HTMLElement).style.display = cap.energy > 0 || s.resources.energy > 0 ? '' : 'none';
    this.els.lvl.textContent = String(s.player.level);
    this.els.xp.style.width = Math.round((s.player.xp / xpForLevel(s.player.level)) * 100) + '%';
    this.els.name.textContent = `${s.player.name} · Citadelle ${citadelLevel(s)}`;
    this.els.trophies.textContent = fmt(s.player.trophies);
    this.els.builders.textContent = `${freeBuilders(s)}/${builderCount(s)}`;
    this.els.shield.textContent = s.player.shieldUntil > now ? fmtTime((s.player.shieldUntil - now) / 1000) : 'Aucun';
    const ev = currentEvent(now);
    this.els.event.textContent = `${ev.event.icon} ${ev.event.name} · ${fmtTime((ev.endsAt - now) / 1000)}`;
    this.els.net.textContent = !serverConfigured() ? '📴 Mode solo' : isOnline() ? '🟢 En ligne' : '🔴 Hors-ligne';
    const claimable = s.missions.daily.filter(m => { const d = missionDef(m.id); return d && !m.claimed && m.progress >= d.goal; }).length;
    this.badge('missionsBadge', claimable);
    const tier = passTier(s);
    let passClaims = 0; for (let t = 1; t <= tier; t++) { if (!s.pass.claimedFree.includes(t)) passClaims++; if (s.pass.premium && !s.pass.claimedPremium.includes(t)) passClaims++; }
    this.badge('passBadge', passClaims);
    if (s.settings.showFps) { this.els.fps.style.display = ''; this.els.fps.textContent = `${Math.round(this.app.r.fps)} FPS · ${this.app.r.drawCalls} draws · ${this.app.r.fx.count} part.`; }
    else this.els.fps.style.display = 'none';
  }
  private badge(k: string, n: number) { const b = this.els[k]; if (!b) return; b.style.display = n > 0 ? '' : 'none'; b.textContent = String(n); }
}
