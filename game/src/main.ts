// Point d'entrée du client KINGDOMS.
import { App } from './ui/app';
import { VillageScene } from './ui/village';
import { BattleScene, newBattleSeed } from './ui/battle';
import { audio } from './audio/audio';
import { openOfflineReport } from './ui/panels';
import { configureServer } from './networking/api';
import { citadelLevel } from './village/query';
import { MAP_SIZE } from './core/state';

declare const __SERVER_URL__: string;

function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const bar = document.getElementById('loadbar') as HTMLElement | null;
  if (bar) bar.style.width = '40%';
  try { if (typeof __SERVER_URL__ === 'string' && __SERVER_URL__) configureServer({ baseUrl: __SERVER_URL__ }); } catch { /* */ }
  const app = new App(canvas, ui);
  (window as any).kingdoms = app; // accès debug / tests e2e
  const { attacks } = app.load(Date.now());
  if (bar) bar.style.width = '80%';
  const village = () => {
    const v = new VillageScene(app);
    app.setScene(v);
    app.r.cam.zoom = Math.max(app.r.cam.minZoom, Math.min(1, Math.min(app.r.cam.vw / 1500, app.r.cam.vh / 760)));
    app.r.cam.centerOn(MAP_SIZE / 2, MAP_SIZE / 2 + 1);
    void citadelLevel;
  };
  app.nav = {
    village,
    battle: (opp, ref) => app.setScene(new BattleScene(app, opp, ref, newBattleSeed(), 'attack')),
    invasion: () => app.setScene(new BattleScene(app, null, null, newBattleSeed(), 'invasion')),
  };
  app.r.resize();
  village();
  void app.connect();
  window.addEventListener('resize', () => { app.r.resize(); app.scene?.onResize?.(); });
  // l'audio ne démarre qu'après un geste utilisateur
  const unlock = () => { audio.unlock(); audio.music(app.scene?.name === 'battle' ? 'battle' : 'village'); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { app.save(true); audio.suspend(); }
    else { audio.resume(); }
  });
  window.addEventListener('pagehide', () => app.save(true));
  // boucle principale
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  const loop = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { app.r.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    try { app.frame(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const splash = document.getElementById('splash');
  if (bar) bar.style.width = '100%';
  setTimeout(() => { if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 500); } openOfflineReport(app, attacks); }, 400);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
