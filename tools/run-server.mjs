import * as esbuild from 'esbuild';
await esbuild.build({ entryPoints: ['server/src/main.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: 'build/server.mjs', logLevel: 'warning' });
await import('../build/server.mjs');
