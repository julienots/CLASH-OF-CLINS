// Serveur autoritaire KINGDOMS.
// Le client n'est jamais la source de vérité pour les ressources, récompenses,
// résultats de combat, achats et classements : chaque action est rejouée ici
// avec le même code de règles (game/src/core/actions.ts).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { dispatch } from '../../game/src/core/actions';
import { newGame, advance } from '../../game/src/core/game';
import type { GameState } from '../../game/src/core/state';
import { grantProduct, iapProduct } from '../../game/src/shop/catalog';
import { mockSign } from '../../game/src/purchases/iap';
import { citadelLevel } from '../../game/src/village/query';
import { processOfflineDefenses } from '../../game/src/defense/offlineDefense';
import { Store, type Account } from './store';

export interface ServerOptions {
  port: number;
  dataDir: string;
  secret: string;
  devMode: boolean;               // accepte les jetons d'achat de test
  verifyGooglePurchase?: (productId: string, token: string) => Promise<{ valid: boolean; consumed?: boolean; reason?: string }>;
  now?: () => number;
}

interface Ctx { req: IncomingMessage; res: ServerResponse; body: any; account: Account | null; url: URL }

export function startServer(opts: ServerOptions) {
  const store = new Store(opts.dataDir);
  const now = opts.now ?? (() => Date.now());
  const rate = new Map<string, { n: number; t: number }>();

  const sign = (id: string) => id + '.' + createHmac('sha256', opts.secret).update(id).digest('base64url');
  const verifyToken = (tok: string): string | null => {
    const i = tok.lastIndexOf('.');
    if (i < 0) return null;
    const id = tok.slice(0, i);
    const a = Buffer.from(sign(id)), b = Buffer.from(tok);
    return a.length === b.length && timingSafeEqual(a, b) ? id : null;
  };

  const json = (res: ServerResponse, code: number, data: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization' });
    res.end(JSON.stringify(data));
  };

  const routes: Record<string, (c: Ctx) => Promise<unknown> | unknown> = {
    'GET /health': () => ({ ok: true, time: now(), players: store.count() }),

    'POST /auth/guest': c => {
      const device = String(c.body?.deviceId ?? '').slice(0, 64);
      if (device.length < 8) throw new HttpError(400, 'deviceId invalide');
      let acc = store.byDevice(device);
      if (!acc) {
        const id = 'p_' + randomBytes(8).toString('hex');
        const state = newGame(now(), String(c.body?.name ?? 'Souverain').slice(0, 16));
        state.player.id = id;
        acc = store.create({ id, device, state, issuedSeeds: [], createdAt: now() });
      }
      return { token: sign(acc.id), playerId: acc.id, state: acc.state };
    },

    'GET /state': c => {
      const acc = need(c);
      const from = acc.state.lastTick;
      advance(acc.state, now());
      processOfflineDefenses(acc.state, from, now());
      store.save(acc);
      return { state: acc.state };
    },

    /** Action de jeu : rejouée avec l'horloge du serveur. En cas de refus, l'état faisant foi est renvoyé. */
    'POST /action': c => {
      const acc = need(c);
      const name = String(c.body?.name ?? '');
      const args = c.body?.args ?? {};
      if (name === 'battle') {
        const ref = args.opponent;
        // les raids doivent utiliser une graine émise par le serveur (anti-triche)
        if (ref?.kind === 'raid') {
          const i = acc.issuedSeeds.indexOf(ref.seed >>> 0);
          if (i < 0) return { ok: false, error: 'Adversaire non attribué par le serveur', state: acc.state };
          acc.issuedSeeds.splice(i, 1);
        }
      }
      const r = dispatch(acc.state, name, args, now());
      store.save(acc);
      if (!r.ok) return { ok: false, error: r.error, state: acc.state };
      return { ok: true, data: r.data };
    },

    'POST /matchmaking/raid': c => {
      const acc = need(c);
      const seed = randomBytes(4).readUInt32LE(0);
      acc.issuedSeeds.push(seed);
      if (acc.issuedSeeds.length > 20) acc.issuedSeeds.shift();
      store.save(acc);
      return { seed };
    },

    /** Validation d'achat. Production : Google Play Developer API (purchases.products.get). */
    'POST /iap/verify': async c => {
      const acc = need(c);
      const { productId, token, signature } = c.body ?? {};
      if (!iapProduct(productId) || typeof token !== 'string') return { valid: false, reason: 'produit inconnu' };
      if (store.tokenUsed(token)) return { valid: false, reason: 'jeton déjà utilisé' };
      let valid = false;
      if (token.startsWith('test.')) valid = opts.devMode && signature === mockSign(token);
      else if (opts.verifyGooglePurchase) valid = (await opts.verifyGooglePurchase(productId, token)).valid;
      if (!valid) return { valid: false, reason: 'refusé' };
      const g = grantProduct(acc.state, productId, token);
      if (!g.ok) return { valid: false, reason: g.error };
      store.markToken(token, acc.id);
      store.save(acc);
      return { valid: true, granted: g.data };
    },

    'GET /leaderboard': c => {
      const scope = c.url.searchParams.get('scope') ?? 'global';
      const me = c.account;
      let list = store.all();
      if (scope === 'region' && me) list = list.filter(a => a.state.player.region === me.state.player.region);
      if (scope === 'guild' && me) list = list.filter(a => a.state.guild && a.state.guild.id === me.state.guild?.id);
      const rows = list.map(a => ({ name: a.state.player.name, trophies: scope === 'season' ? a.state.pass.xp : a.state.player.trophies, citadel: citadelLevel(a.state) }))
        .sort((x, y) => y.trophies - x.trophies).slice(0, 100);
      return { rows };
    },

    // ── Guildes partagées entre vrais joueurs ──
    'GET /guilds': () => ({ guilds: store.guilds().map(g => ({ id: g.id, name: g.name, emblem: g.emblem, members: g.members.length, minTrophies: g.minTrophies })) }),
    'POST /guilds/create': c => {
      const acc = need(c);
      const name = String(c.body?.name ?? '').replace(/[<>]/g, '').trim().slice(0, 24);
      if (name.length < 3) throw new HttpError(400, 'Nom trop court');
      if (store.guildOf(acc.id)) throw new HttpError(409, 'Déjà dans une guilde');
      return { guild: store.createGuild({ id: 'g_' + randomBytes(5).toString('hex'), name, emblem: String(c.body?.emblem ?? '🦁').slice(0, 4), members: [acc.id], chat: [], minTrophies: 0 }) };
    },
    'POST /guilds/join': c => {
      const acc = need(c);
      const g = store.guild(String(c.body?.id ?? ''));
      if (!g) throw new HttpError(404, 'Guilde introuvable');
      if (store.guildOf(acc.id)) throw new HttpError(409, 'Déjà dans une guilde');
      if (g.members.length >= 30) throw new HttpError(409, 'Guilde complète');
      if (acc.state.player.trophies < g.minTrophies) throw new HttpError(403, 'Trophées insuffisants');
      g.members.push(acc.id); store.saveGuild(g);
      return { guild: g };
    },
    'POST /guilds/chat': c => {
      const acc = need(c);
      const g = store.guildOf(acc.id);
      if (!g) throw new HttpError(404, 'Aucune guilde');
      const text = String(c.body?.text ?? '').replace(/[<>]/g, '').trim().slice(0, 200);
      if (!text) throw new HttpError(400, 'Message vide');
      g.chat.push({ from: acc.state.player.name, text, at: now() });
      if (g.chat.length > 200) g.chat.splice(0, g.chat.length - 200);
      store.saveGuild(g);
      return { ok: true };
    },
    'GET /guilds/chat': c => {
      const acc = need(c);
      const g = store.guildOf(acc.id);
      const since = Number(c.url.searchParams.get('since') ?? 0);
      return { messages: g ? g.chat.filter(m => m.at > since) : [] };
    },
    'POST /guilds/donate': c => {
      const acc = need(c);
      const g = store.guildOf(acc.id);
      const target = store.get(String(c.body?.to ?? ''));
      if (!g || !target || !g.members.includes(target.id) || target.id === acc.id) throw new HttpError(400, 'Destinataire invalide');
      const unit = String(c.body?.unit ?? '');
      if (!((acc.state.army.units[unit] ?? 0) > 0)) throw new HttpError(400, 'Unité indisponible');
      acc.state.army.units[unit]--;
      target.state.army.guildTroops[unit] = (target.state.army.guildTroops[unit] ?? 0) + 1;
      acc.state.player.stats.donations++;
      store.save(acc); store.save(target);
      return { ok: true };
    },
  };

  function need(c: Ctx): Account {
    if (!c.account) throw new HttpError(401, 'Non authentifié');
    return c.account;
  }

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    const url = new URL(req.url ?? '/', 'http://localhost');
    const ip = req.socket.remoteAddress ?? '?';
    const r = rate.get(ip) ?? { n: 0, t: now() };
    if (now() - r.t > 1000) { r.n = 0; r.t = now(); }
    if (++r.n > 60) return json(res, 429, { error: 'Trop de requêtes' });
    rate.set(ip, r);
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return json(res, 404, { error: 'Introuvable' });
    try {
      const body = req.method === 'POST' ? await readBody(req) : null;
      const auth = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      const id = auth ? verifyToken(auth) : null;
      const account = id ? store.get(id) ?? null : null;
      json(res, 200, await handler({ req, res, body, account, url }));
    } catch (e) {
      if (e instanceof HttpError) json(res, e.code, { error: e.message });
      else { console.error(e); json(res, 500, { error: 'Erreur serveur' }); }
    }
  });
  server.listen(opts.port);
  return { server, store, close: () => new Promise<void>(r => server.close(() => r())) };
}

class HttpError extends Error { constructor(public code: number, msg: string) { super(msg); } }

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > 512 * 1024) { reject(new HttpError(413, 'Requête trop volumineuse')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new HttpError(400, 'JSON invalide')); } });
    req.on('error', reject);
  });
}

export type { GameState };
