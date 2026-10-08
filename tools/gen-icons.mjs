// Génère l'icône KINGDOMS (blason original : tour dorée et couronne sur fond nuit royale) aux tailles Android.
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
const base = '/opt/pw-browsers';
const dir = existsSync(base) ? readdirSync(base).find(d => /^chromium-\d+/.test(d)) : null;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? (dir ? `${base}/${dir}/chrome-linux/chrome` : undefined) });
const page = await browser.newPage();
const draw = `(size, round, splash) => {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const s = size / 512;
  g.scale(s, s);
  if (!splash) {
    const bg = g.createRadialGradient(256, 200, 40, 256, 256, 360); bg.addColorStop(0, '#2f5ea8'); bg.addColorStop(1, '#0d1a33');
    g.fillStyle = bg;
    if (round) { g.beginPath(); g.arc(256, 256, 256, 0, Math.PI * 2); g.fill(); } else { const r = 110; g.beginPath(); g.moveTo(r, 0); g.arcTo(512, 0, 512, 512, r); g.arcTo(512, 512, 0, 512, r); g.arcTo(0, 512, 0, 0, r); g.arcTo(0, 0, 512, 0, r); g.fill(); }
  }
  // rayons
  g.save(); g.translate(256, 250); g.globalAlpha = 0.15; g.fillStyle = '#ffe08a';
  for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.lineTo(0, -240); g.fill(); }
  g.restore();
  // tour
  const gold = g.createLinearGradient(150, 0, 360, 0); gold.addColorStop(0, '#ffe08a'); gold.addColorStop(0.5, '#f2b632'); gold.addColorStop(1, '#b77a0b');
  g.fillStyle = gold; g.strokeStyle = '#5a3b00'; g.lineWidth = 10; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(160, 420); g.lineTo(175, 230); g.lineTo(160, 230); g.lineTo(160, 175); g.lineTo(198, 175); g.lineTo(198, 205); g.lineTo(234, 205); g.lineTo(234, 175); g.lineTo(278, 175); g.lineTo(278, 205); g.lineTo(314, 205); g.lineTo(314, 175); g.lineTo(352, 175); g.lineTo(352, 230); g.lineTo(337, 230); g.lineTo(352, 420); g.closePath();
  g.fill(); g.stroke();
  // porte
  g.fillStyle = '#3a2400'; g.beginPath(); g.moveTo(222, 420); g.lineTo(222, 350); g.arc(256, 350, 34, Math.PI, 0); g.lineTo(290, 420); g.fill();
  // fenêtre
  g.fillStyle = '#3a2400'; g.beginPath(); g.moveTo(244, 290); g.lineTo(244, 262); g.arc(256, 262, 12, Math.PI, 0); g.lineTo(268, 290); g.fill();
  // couronne
  const cg = g.createLinearGradient(0, 70, 0, 160); cg.addColorStop(0, '#fff3c0'); cg.addColorStop(1, '#e09a00');
  g.fillStyle = cg; g.beginPath(); g.moveTo(176, 160); g.lineTo(166, 82); g.lineTo(214, 120); g.lineTo(256, 66); g.lineTo(298, 120); g.lineTo(346, 82); g.lineTo(336, 160); g.closePath(); g.fill(); g.stroke();
  for (const [x, y, col] of [[256, 66, '#e53935'], [166, 82, '#42a5f5'], [346, 82, '#42a5f5']]) { g.fillStyle = col; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.stroke(); }
  // sol
  g.fillStyle = '#3e7d32'; g.beginPath(); g.ellipse(256, 428, 150, 22, 0, 0, Math.PI * 2); g.fill();
  return c.toDataURL('image/png').split(',')[1];
}`;
const out = async (file, size, round = false, splash = false) => {
  const b64 = await page.evaluate(`(${draw})(${size}, ${round}, ${splash})`);
  writeFileSync(file, Buffer.from(b64, 'base64'));
};
const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, px] of Object.entries(dens)) {
  mkdirSync(`android/res/mipmap-${d}`, { recursive: true });
  await out(`android/res/mipmap-${d}/ic_launcher.png`, px);
  await out(`android/res/mipmap-${d}/ic_launcher_round.png`, px, true);
}
mkdirSync('android/res/drawable', { recursive: true });
await out('android/res/drawable/splash_logo.png', 288, false, true);
await out('game/public/icon.png', 192);
mkdirSync('docs/store', { recursive: true });
await out('docs/store/icon-512.png', 512);
await browser.close();
console.log('✔ icônes générées');
