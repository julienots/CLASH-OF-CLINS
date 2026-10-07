import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server';
import { makeSetup, findOpponent } from '../../game/src/combat/setup';
import { planAttack } from '../../game/src/combat/ai';
import { simulate } from '../../game/src/combat/sim';
import { mockSign } from '../../game/src/purchases/iap';
import type { GameState } from '../../game/src/core/state';

let srv: ReturnType<typeof startServer>;
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
let token = '';
const api = async (method: string, path: string, body?: unknown, tok = token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() as any };
};

beforeAll(() => { srv = startServer({ port, dataDir: mkdtempSync(join(tmpdir(), 'kgd-')), secret: 'test-secret', devMode: true }); });
afterAll(async () => { await srv.close(); });

describe('serveur autoritaire', () => {
  it('authentifie un invité et renvoie son état', async () => {
    const r = await api('POST', '/auth/guest', { deviceId: 'device-123456', name: 'Tester' }, '');
    expect(r.status).toBe(200);
    token = r.data.token;
    expect(r.data.state.player.name).toBe('Tester');
    expect((await api('GET', '/state', undefined, 'faux.jeton')).status).toBe(401);
  });
  it('applique les actions valides et refuse la triche', async () => {
    const st: GameState = (await api('GET', '/state')).data.state;
    const mine = st.buildings.find(b => b.type === 'gold_mine')!;
    // refus : amélioration impossible (Citadelle 1) → l'état faisant foi est renvoyé
    const bad = await api('POST', '/action', { name: 'upgrade', args: { uid: mine.uid } });
    expect(bad.data.ok).toBe(false);
    expect(bad.data.state).toBeDefined();
    const good = await api('POST', '/action', { name: 'train', args: { unit: 'soldier', count: 5 } });
    expect(good.data.ok).toBe(true);
    const cheat = await api('POST', '/action', { name: 'train', args: { unit: 'soldier', count: 1e9 } });
    expect(cheat.data.ok).toBe(false);
  });
  it('re-simule les raids et n\'accepte que les graines émises par le serveur', async () => {
    const forged = await api('POST', '/action', { name: 'battle', args: { opponent: { kind: 'raid', seed: 42 }, seed: 1, commands: [] } });
    expect(forged.data.ok).toBe(false);
    const { seed } = (await api('POST', '/matchmaking/raid')).data;
    const st: GameState = (await api('GET', '/state')).data.state;
    const opp = findOpponent(st, seed, Date.now());
    const setup = makeSetup(st, opp, 7);
    const cmds = planAttack(setup, 3);
    const local = simulate(setup, cmds);
    const r = await api('POST', '/action', { name: 'battle', args: { opponent: { kind: 'raid', seed }, seed: 7, commands: cmds, claimedStars: 3 } });
    expect(r.data.ok).toBe(true);
    // le résultat retenu est celui recalculé par le serveur, pas celui annoncé
    expect(r.data.data.result.stars).toBe(local.stars);
    const replay = await api('POST', '/action', { name: 'battle', args: { opponent: { kind: 'raid', seed }, seed: 7, commands: cmds } });
    expect(replay.data.ok).toBe(false); // graine à usage unique
  });
  it('valide les achats, refuse les rejeux de jeton', async () => {
    const t = 'test.crystals_small.abc123';
    const before = (await api('GET', '/state')).data.state.resources.crystals;
    const ok = await api('POST', '/iap/verify', { productId: 'crystals_small', token: t, signature: mockSign(t) });
    expect(ok.data.valid).toBe(true);
    expect((await api('GET', '/state')).data.state.resources.crystals).toBe(before + 120);
    expect((await api('POST', '/iap/verify', { productId: 'crystals_small', token: t, signature: mockSign(t) })).data.valid).toBe(false);
    expect((await api('POST', '/iap/verify', { productId: 'crystals_small', token: 'test.x', signature: 'bad' })).data.valid).toBe(false);
    expect((await api('POST', '/iap/verify', { productId: 'crystals_large', token: 'GPA.1234', signature: '' })).data.valid).toBe(false);
  });
  it('guildes réelles, chat et classements', async () => {
    const c = await api('POST', '/guilds/create', { name: 'Serveur', emblem: '🐉' });
    expect(c.status).toBe(200);
    const other = (await api('POST', '/auth/guest', { deviceId: 'device-abcdefgh' }, '')).data.token;
    expect((await api('POST', '/guilds/join', { id: c.data.guild.id }, other)).status).toBe(200);
    expect((await api('POST', '/guilds/chat', { text: '<script>Bonjour</script>' }, other)).status).toBe(200);
    const msgs = (await api('GET', '/guilds/chat?since=0')).data.messages;
    expect(msgs[0].text).not.toContain('<');
    const lb = (await api('GET', '/leaderboard?scope=global')).data.rows;
    expect(lb.length).toBe(2);
  });
});
