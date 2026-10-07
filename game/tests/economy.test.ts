import { describe, it, expect } from 'vitest';
import { newGame, advance } from '../src/core/game';
import { dispatch } from '../src/core/actions';
import { storageCap, citadelLevel, freeBuilders, countOf } from '../src/village/query';
import { findFreeSpot } from '../src/village/grid';
import { crystalsForTime } from '../src/resources/economy';
import { MAP_SIZE } from '../src/core/state';

const T0 = Date.UTC(2026, 9, 7, 12);
const H = 3600000;

describe('création du village', () => {
  it('crée un village de départ cohérent', () => {
    const s = newGame(T0);
    expect(citadelLevel(s)).toBe(1);
    for (const t of ['citadel', 'gold_mine', 'sawmill', 'gold_vault', 'wood_depot', 'barracks', 'army_camp', 'cannon']) expect(countOf(s, t)).toBeGreaterThan(0);
    expect(freeBuilders(s)).toBe(2);
    expect(s.resources.gold).toBeGreaterThan(0);
  });
});

describe('construction & amélioration', () => {
  it('place un bâtiment, consomme ressources et ouvrier, puis termine', () => {
    const s = newGame(T0);
    const spot = findFreeSpot(s, 'gold_mine', undefined, 1)!;
    const wood = s.resources.wood;
    const r = dispatch(s, 'place', { type: 'gold_mine', x: spot.x, y: spot.y }, T0);
    expect(r.ok).toBe(true);
    expect(s.resources.wood).toBe(wood - 150);
    const b = s.buildings[s.buildings.length - 1];
    expect(b.build).toBeDefined();
    expect(freeBuilders(s)).toBe(1);
    advance(s, T0 + 60000);
    expect(b.level).toBe(1);
    expect(freeBuilders(s)).toBe(2);
  });
  it('refuse le chevauchement et le hors-territoire', () => {
    const s = newGame(T0);
    const cit = s.buildings.find(b => b.type === 'citadel')!;
    expect(dispatch(s, 'place', { type: 'gold_mine', x: cit.x, y: cit.y }, T0).ok).toBe(false);
    expect(dispatch(s, 'place', { type: 'gold_mine', x: 0, y: 0 }, T0).ok).toBe(false);
  });
  it('limite les chantiers au nombre d\'ouvriers', () => {
    const s = newGame(T0);
    s.resources.gold = s.resources.wood = 2000;
    s.buildings.find(b => b.type === 'citadel')!.level = 2;
    const ids = s.buildings.filter(b => b.type === 'cannon' || b.type === 'gold_mine' || b.type === 'sawmill').map(b => b.uid);
    const ok = ids.map(uid => dispatch(s, 'upgrade', { uid }, T0).ok);
    expect(ok.filter(Boolean).length).toBe(2);
  });
  it('améliore la Citadelle et débloque du contenu + agrandit le territoire', () => {
    const s = newGame(T0);
    s.resources.gold = s.resources.wood = 2500;
    const cit = s.buildings.find(b => b.type === 'citadel')!;
    expect(dispatch(s, 'upgrade', { uid: cit.uid }, T0).ok).toBe(true);
    advance(s, T0 + H);
    expect(citadelLevel(s)).toBe(2);
    const spot = findFreeSpot(s, 'farm', undefined, 2);
    expect(spot).not.toBeNull();
  });
  it('annule un chantier avec remboursement de 50 %', () => {
    const s = newGame(T0);
    const mine = s.buildings.find(b => b.type === 'gold_mine')!;
    const w = s.resources.wood;
    dispatch(s, 'upgrade', { uid: mine.uid }, T0);
    const spent = w - s.resources.wood;
    dispatch(s, 'cancel', { uid: mine.uid }, T0);
    expect(s.resources.wood).toBe(w - spent + Math.floor(spent / 2));
  });
  it('accélère en cristaux à un prix raisonnable', () => {
    expect(crystalsForTime(60)).toBe(1);
    expect(crystalsForTime(3600)).toBe(20);
    expect(crystalsForTime(86400)).toBe(260);
  });
});

describe('déplacement / mode édition', () => {
  it('déplace plusieurs bâtiments à la fois et refuse les collisions', () => {
    const s = newGame(T0);
    const mine = s.buildings.find(b => b.type === 'gold_mine')!;
    const saw = s.buildings.find(b => b.type === 'sawmill')!;
    expect(dispatch(s, 'move', { moves: [{ uid: mine.uid, x: 12, y: 30 }, { uid: saw.uid, x: 16, y: 30 }] }, T0).ok).toBe(true);
    expect(mine.x).toBe(12);
    expect(dispatch(s, 'move', { moves: [{ uid: mine.uid, x: 16, y: 30 }] }, T0).ok).toBe(false);
    // échange de positions (multi-sélection)
    expect(dispatch(s, 'move', { moves: [{ uid: mine.uid, x: 16, y: 30 }, { uid: saw.uid, x: 12, y: 30 }] }, T0).ok).toBe(true);
    expect(dispatch(s, 'move', { moves: [{ uid: mine.uid, x: MAP_SIZE, y: 0 }] }, T0).ok).toBe(false);
  });
  it('construit une ligne de murs rapidement', () => {
    const s = newGame(T0);
    s.resources.gold = s.resources.wood = 2500;
    const cit = s.buildings.find(b => b.type === 'citadel')!;
    dispatch(s, 'upgrade', { uid: cit.uid }, T0);
    advance(s, T0 + H);
    const cells = Array.from({ length: 8 }, (_, i) => ({ x: 10 + i, y: 34 }));
    const r = dispatch(s, 'walls', { cells }, T0 + H);
    expect(r.ok).toBe(true);
    expect(countOf(s, 'wall')).toBe(r.data);
  });
});

describe('production & stockage', () => {
  it('produit hors-ligne, plafonne et rapporte les gains', () => {
    const s = newGame(T0);
    advance(s, T0 + 10 * H, { report: true });
    const mine = s.buildings.find(b => b.type === 'gold_mine')!;
    expect(mine.stored!.gold).toBeGreaterThan(0);
    expect(mine.stored!.gold).toBeLessThanOrEqual(900);
    expect(s.offlineReport?.gained.gold).toBeGreaterThan(0);
  });
  it('la récolte respecte la capacité des coffres', () => {
    const s = newGame(T0);
    const cap = storageCap(s);
    s.resources.gold = cap.gold - 10;
    advance(s, T0 + 10 * H);
    const mine = s.buildings.find(b => b.type === 'gold_mine')!;
    const r = dispatch(s, 'collect', { uid: mine.uid }, T0 + 10 * H);
    expect(r.ok).toBe(true);
    expect(s.resources.gold).toBe(cap.gold);
    expect(mine.stored!.gold).toBeGreaterThan(0);
  });
  it('le temps qui recule ne casse rien', () => {
    const s = newGame(T0);
    advance(s, T0 - 10 * H);
    expect(s.resources.gold).toBeGreaterThan(0);
    advance(s, T0 + H);
    expect(Number.isFinite(s.resources.gold)).toBe(true);
  });
});
