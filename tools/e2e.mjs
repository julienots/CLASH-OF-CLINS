// Test de bout en bout dans Chromium (viewport de téléphone en paysage) :
// joue réellement la boucle CONSTRUIRE → PRODUIRE → AMÉLIORER → ENTRAÎNER → ATTAQUER → GAGNER → DÉFENDRE.
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const shots = resolve('test-results/e2e');
mkdirSync(shots, { recursive: true });
const base = '/opt/pw-browsers';
const dir = existsSync(base) ? readdirSync(base).find(d => /^chromium-\d+/.test(d)) : null;
const executablePath = process.env.CHROME_PATH ?? (dir ? `${base}/${dir}/chrome-linux/chrome` : undefined);
const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2, hasTouch: false });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errors.push(m.text()); });
const url = 'file://' + resolve('build/www/index.html');
let step = 0;
const shot = async name => { await page.screenshot({ path: `${shots}/${String(++step).padStart(2, '0')}-${name}.png` }); };
const ok = (cond, msg) => { if (!cond) { errors.push('ASSERT ' + msg); console.log('✘', msg); } else console.log('✔', msg); };
const state = () => page.evaluate(() => { const s = window.kingdoms.s; return { res: s.resources, buildings: s.buildings.length, army: s.army, stars: s.campaign.stars, stats: s.player.stats, trophies: s.player.trophies, tut: s.player.tutorialStep }; });
const click = async sel => { await page.locator(sel).first().click({ force: true }); await page.waitForTimeout(250); };
const worldToView = (x, y) => page.evaluate(([x, y]) => window.kingdoms.r.cam.worldToView(x, y), [x, y]);

await page.goto(url);
await page.waitForTimeout(1200);
await shot('village');
let s0 = await state();
ok(s0.buildings > 5, 'village initial créé');

// 1. CONSTRUIRE : seconde mine d'or via le tutoriel
await click('.tuto .btn.gold');
await click('[data-ctx="Construire"]');
let s1 = await state();
ok(s1.buildings === s0.buildings + 1, 'mine d\'or construite');
await shot('construction');

// 2. PRODUIRE / RÉCOLTER : avance le temps de 30 min puis récolte tout
await page.evaluate(() => { const s = window.kingdoms.s; s.lastTick -= 1800000; for (const b of s.buildings) if (b.build) { b.build.endAt -= 1800000; b.build.startAt -= 1800000; } });
await page.waitForTimeout(1300);
const before = (await state()).res.gold;
const collected = await page.evaluate(() => window.kingdoms.act('collectAll').ok);
const after = (await state()).res.gold;
ok(collected && after > before, `récolte : or ${before} → ${after}`);

// accumule encore 3 h de production pour financer la Citadelle
await page.evaluate(() => { const s = window.kingdoms.s; s.lastTick -= 3 * 3600000; });
await page.waitForTimeout(1200);
await page.evaluate(() => window.kingdoms.act('collectAll'));
// 3. AMÉLIORER : sélectionne la Citadelle et l'améliore
const cit = await page.evaluate(() => window.kingdoms.s.buildings.find(b => b.type === 'citadel'));
const cp = await worldToView(cit.x + 2, cit.y + 2);
await page.mouse.click(cp.x, cp.y - 20);
await page.waitForTimeout(300);
await shot('selection');
await click('[data-ctx="Améliorer"]');
await shot('amelioration');
await click('.panel [data-btn="Améliorer"]');
const upg = await page.evaluate(() => window.kingdoms.s.buildings.find(b => b.type === 'citadel').build);
ok(!!upg, 'amélioration de la Citadelle lancée');

// 4. ENTRAÎNER
await page.evaluate(() => { window.kingdoms.closeAllPanels(); });
await click('[data-btn="Armée"]');
await click('[data-unit="soldier"] .btn.green >> nth=1');
await shot('armee');
await page.evaluate(() => window.kingdoms.act('finishTraining'));
const st4 = await state();
ok((st4.army.units.soldier ?? 0) > 10, `entraînement : ${st4.army.units.soldier} soldats`);
await page.evaluate(() => { window.kingdoms.closeAllPanels(); });

// 5. ATTAQUER : campagne niveau 1
await click('[data-btn="Attaquer"]');
await shot('menu-attaque');
await click('[data-btn="Campagne"]');
await click('[data-campaign="1"]');
await page.waitForTimeout(500);
await shot('combat-observation');
// déploiement sur le bord
const spots = await page.evaluate(() => {
  const k = window.kingdoms, sim = k.scene.sim, out = [];
  for (let a = 0; a < Math.PI * 2 && out.length < 15; a += 0.21) {
    for (let r = 8; r < 22; r += 0.5) {
      const x = 22 + Math.cos(a) * r, y = 22 + Math.sin(a) * r;
      if (!sim.canDeployAt(x, y)) continue;
      const v = k.r.cam.worldToView(x, y);
      if (v.x > 40 && v.y > 90 && v.x < k.r.cam.vw - 40 && v.y < k.r.cam.vh - 100) { out.push(v); break; }
    }
  }
  return out;
});
ok(spots.length >= 10, `zones de déploiement visibles à l'écran (${spots.length})`);
for (const p of spots) await page.mouse.click(p.x, p.y);
const deployed = await page.evaluate(() => Object.values(window.kingdoms.scene.sim.usedUnits).reduce((a, b) => a + b, 0));
ok(deployed >= 10, `${deployed} unités déployées par toucher`);
await page.waitForTimeout(2500);
await shot('combat');
// accélère la fin
await page.evaluate(async () => { const sc = window.kingdoms.scene; sc.speed = 2; let n = 0; while (!sc.sim.ended && n++ < 4000) { const ev = sc.sim.step(); } });
await page.waitForTimeout(2200);
await shot('resultat');
const st5 = await state();
ok((st5.stars[1] ?? 0) > 0, `victoire campagne niveau 1 (${st5.stars[1] ?? 0}★)`);
await click('[data-btn="Retour"]');
await page.waitForTimeout(500);

// 6. DÉFENDRE : invasion
await page.evaluate(() => window.kingdoms.nav.invasion());
await page.waitForTimeout(2500);
await shot('invasion');
await page.evaluate(async () => { const sc = window.kingdoms.scene; let n = 0; while (!sc.sim.ended && n++ < 4000) sc.sim.step(); });
await page.waitForTimeout(2200);
await shot('invasion-resultat');
const st6 = await state();
ok(st6.stats.invasionsRepelled + st6.stats.defensesLost > 0, `invasion résolue (repoussées=${st6.stats.invasionsRepelled})`);
await page.evaluate(() => window.kingdoms.nav.village());
await page.waitForTimeout(500);

// 7. Panneaux principaux
for (const [btn, name] of [['Boutique', 'boutique'], ['Pass', 'pass'], ['Missions', 'missions'], ['Monde', 'monde'], ['Guilde', 'guilde'], ['Construire', 'construire']]) {
  await page.evaluate(() => window.kingdoms.closeAllPanels());
  await click(`[data-btn="${btn}"]`);
  await page.waitForTimeout(300);
  await shot(name);
}
await page.evaluate(() => window.kingdoms.closeAllPanels());
// 8. Sauvegarde / rechargement
await page.evaluate(() => window.kingdoms.save(true));
const beforeReload = await state();
await page.reload();
await page.waitForTimeout(1500);
const afterReload = await state();
ok(afterReload.buildings === beforeReload.buildings && afterReload.stars[1] === beforeReload.stars[1], 'sauvegarde restaurée après rechargement');
await shot('apres-rechargement');
// 9. Achat test (fournisseur de test hors Android) + restauration
const cr = (await state()).res.crystals;
await page.evaluate(() => window.kingdoms.purchases.buy('crystals_small'));
const cr2 = (await state()).res.crystals;
ok(cr2 === cr + 120, `achat test validé : 💎 ${cr} → ${cr2}`);
// 10. Environnement Android simulé : mêmes ponts que MainActivity/BillingBridge (sans bibliothèque Billing)
const android = await browser.newPage({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 3 });
android.on('pageerror', e => errors.push('ANDROID PAGEERROR ' + e.message));
await android.addInitScript(() => {
  let file = '';
  window.KingdomsNative = { save: d => { file = d; window.__nativeSaves = (window.__nativeSaves || 0) + 1; }, load: () => file, vibrate: () => {}, isRelease: () => true, share: () => {}, exit: () => {} };
  window.KingdomsBilling = { call: (m, a, id) => setTimeout(() => window.__kbCb[id](JSON.stringify(m === 'available' ? { data: false } : { error: 'unavailable', message: 'non intégré' })), 5) };
});
await android.goto(url);
await android.waitForTimeout(1200);
const andr = await android.evaluate(async () => { const k = window.kingdoms; k.save(true); const r = await k.purchases.buy('crystals_small'); return { release: k.release, saves: window.__nativeSaves, buy: r }; });
ok(andr.release === true, 'build release détecté via le pont natif');
ok(andr.saves > 0, 'sauvegarde écrite dans le fichier natif');
ok(!andr.buy.ok && andr.buy.code === 'unavailable', 'sans Play Billing : achat refusé proprement (' + andr.buy.error + ')');
await android.screenshot({ path: `${shots}/${String(++step).padStart(2, '0')}-android-sim.png` });
await android.close();
const fps = await page.evaluate(() => window.kingdoms.r.fps);
console.log('FPS mesurés (swiftshader headless) :', Math.round(fps));
await browser.close();
if (errors.length) { console.log('\nERREURS:\n' + errors.join('\n')); process.exit(1); }
console.log('\n✅ E2E OK — captures dans test-results/e2e');
