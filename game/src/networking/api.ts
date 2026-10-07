// Client réseau : détection de connexion, appels serveur, file d'actions.
// Le serveur (server/) re-joue chaque action avec les mêmes règles et fait foi.

export interface ServerConfig { baseUrl: string; timeoutMs: number }

let config: ServerConfig = { baseUrl: '', timeoutMs: 6000 };
let token = '';
let lastOnlineCheck = 0;
let online = false;

export function configureServer(c: Partial<ServerConfig>) { config = { ...config, ...c }; }
export function serverConfigured(): boolean { return !!config.baseUrl; }
export function setSessionToken(t: string) { token = t; }

export function isOnline(): boolean { return online; }

export async function checkOnline(force = false): Promise<boolean> {
  if (!serverConfigured()) { online = false; return false; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { online = false; return false; }
  if (!force && Date.now() - lastOnlineCheck < 15000) return online;
  lastOnlineCheck = Date.now();
  try { const r = await call<{ ok: boolean }>('GET', '/health'); online = !!r.ok; }
  catch { online = false; }
  return online;
}

export class NetworkError extends Error {}

export async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (!serverConfigured()) throw new NetworkError('Aucun serveur configuré');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
  try {
    const res = await fetch(config.baseUrl + path, {
      method, signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new NetworkError(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    online = false;
    throw e instanceof NetworkError ? e : new NetworkError('Connexion impossible');
  } finally {
    clearTimeout(timer);
  }
}

/** Fonctionnalités nécessitant le serveur (messages d'erreur clairs hors-ligne). */
export const ONLINE_FEATURES = ['classement mondial', 'guildes réelles', 'guerres entre joueurs', 'achats intégrés'];
