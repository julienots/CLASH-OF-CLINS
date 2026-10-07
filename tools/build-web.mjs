// Construit le client web dans build/www (bundle IIFE unique, compatible file:// et WebView Android).
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const out = 'build/www';
mkdirSync(out, { recursive: true });
const serve = process.argv.includes('--serve');
const server = process.env.KINGDOMS_SERVER_URL ?? '';
const opts = {
  entryPoints: ['game/src/main.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2019', 'chrome80'],
  outfile: `${out}/game.js`,
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  define: { __SERVER_URL__: JSON.stringify(server) },
  legalComments: 'none',
  logLevel: 'info',
};
function copyStatic() {
  cpSync('game/index.html', `${out}/index.html`);
  cpSync('game/public', out, { recursive: true });
}
copyStatic();
if (!serve) {
  await esbuild.build(opts);
  const kb = Math.round(statSync(`${out}/game.js`).size / 1024);
  console.log(`✔ build/www prêt (game.js ${kb} Ko)`);
} else {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  const port = Number(process.env.PORT ?? 8080);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
  createServer(async (req, res) => {
    let p = join(out, decodeURIComponent((req.url ?? '/').split('?')[0]));
    if (p.endsWith('/')) p += 'index.html';
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    if (p.endsWith('index.html') || p.endsWith('.css')) copyStatic();
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(p));
  }).listen(port, () => console.log(`▶ http://localhost:${port}`));
}
