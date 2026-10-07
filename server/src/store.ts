// Stockage persistant simple (fichiers JSON atomiques). Interface pensée pour
// être remplacée par une base de données (PostgreSQL/Redis) en production.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GameState } from '../../game/src/core/state';

export interface Account { id: string; device: string; state: GameState; issuedSeeds: number[]; createdAt: number }
export interface Guild { id: string; name: string; emblem: string; members: string[]; chat: { from: string; text: string; at: number }[]; minTrophies: number }

export class Store {
  private accounts = new Map<string, Account>();
  private devices = new Map<string, string>();
  private guildMap = new Map<string, Guild>();
  private tokens = new Map<string, string>();
  constructor(private dir: string) {
    mkdirSync(join(dir, 'accounts'), { recursive: true });
    mkdirSync(join(dir, 'guilds'), { recursive: true });
    for (const f of readdirSync(join(dir, 'accounts'))) {
      try { const a = JSON.parse(readFileSync(join(dir, 'accounts', f), 'utf8')) as Account; this.accounts.set(a.id, a); this.devices.set(a.device, a.id); } catch { /* fichier corrompu ignoré */ }
    }
    for (const f of readdirSync(join(dir, 'guilds'))) { try { const g = JSON.parse(readFileSync(join(dir, 'guilds', f), 'utf8')) as Guild; this.guildMap.set(g.id, g); } catch { /* */ } }
    const tp = join(dir, 'tokens.json');
    if (existsSync(tp)) try { for (const [k, v] of Object.entries(JSON.parse(readFileSync(tp, 'utf8')))) this.tokens.set(k, v as string); } catch { /* */ }
  }
  private write(path: string, data: unknown) { const tmp = path + '.tmp'; writeFileSync(tmp, JSON.stringify(data)); renameSync(tmp, path); }
  count() { return this.accounts.size; }
  all() { return [...this.accounts.values()]; }
  get(id: string) { return this.accounts.get(id); }
  byDevice(d: string) { const id = this.devices.get(d); return id ? this.accounts.get(id) : undefined; }
  create(a: Account) { this.accounts.set(a.id, a); this.devices.set(a.device, a.id); this.save(a); return a; }
  save(a: Account) { this.write(join(this.dir, 'accounts', a.id + '.json'), a); }
  tokenUsed(t: string) { return this.tokens.has(t); }
  markToken(t: string, id: string) { this.tokens.set(t, id); this.write(join(this.dir, 'tokens.json'), Object.fromEntries(this.tokens)); }
  guilds() { return [...this.guildMap.values()]; }
  guild(id: string) { return this.guildMap.get(id); }
  guildOf(pid: string) { return this.guilds().find(g => g.members.includes(pid)); }
  createGuild(g: Guild) { this.guildMap.set(g.id, g); this.saveGuild(g); return g; }
  saveGuild(g: Guild) { this.write(join(this.dir, 'guilds', g.id + '.json'), g); }
}
