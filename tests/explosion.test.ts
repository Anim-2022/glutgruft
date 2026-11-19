import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, explode, Run, Actor } from '../src/game/run';
import { W, H, T, computeFov } from '../src/game/dungeon';
import { MOBS } from '../src/game/content';

// Freier Saal 20×9 ohne Gegner, Held links
function hall(): Run {
  const r = newRun(91, 'krieger', defaultMeta());
  r.floor = 3; r.mobs = []; r.puzzle = null; r.fire.clear(); r.fuses.clear(); r.traps = []; r.mode = 'play';
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 4; y <= 12; y++) for (let x = 4; x <= 24; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 6; r.p.y = 8; r.p.hp = r.p.maxHp = 999;
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function mob(r: Run, x: number, y: number): Actor {
  const d = MOBS.skelett;
  const m: Actor = { id: r.nextId++, kind: 'skelett', name: d.name, x, y, hp: 500, maxHp: 500, atk: 0, def: 0, st: {}, xp: 0, cd: 0, awake: false };
  r.mobs.push(m);
  return m;
}

describe('Fässer und Feuer', () => {
  it('ein angeschlagenes Fass explodiert erst nach 2 oder 3 weiteren Zügen', () => {
    const r = hall(), bi = 8 * W + 7;
    r.tiles[bi] = T.BARREL;
    act(r, { t: 'move', dx: 1, dy: 0 }); // Schlag gegen das Fass
    expect(r.fuses.has(bi)).toBe(true);
    let moves = 0;
    while (r.tiles[bi] === T.BARREL && moves < 6) { act(r, { t: 'wait' }); moves++; }
    expect(r.tiles[bi]).toBe(T.BURNT);
    expect([2, 3]).toContain(moves);
  });

  it('die Fassexplosion reicht zwei Felder weit, aber nicht durch Wände', () => {
    const r = hall();
    for (let y = 4; y <= 12; y++) r.tiles[y * W + 17] = T.WALL; // Trennwand
    r.tiles[8 * W + 15] = T.BARREL;
    const near = mob(r, 13, 8), diag = mob(r, 14, 6), far = mob(r, 12, 8), behind = mob(r, 18, 8);
    r.fuses.set(8 * W + 15, 1);
    act(r, { t: 'wait' });
    expect(near.hp).toBeLessThan(500);   // zwei Felder
    expect(diag.hp).toBeLessThan(500);   // (−1, −2): noch im Kreis
    expect(far.hp).toBe(500);            // drei Felder
    expect(behind.hp).toBe(500);         // hinter der Wand
    // Brandfläche rund um das Fass
    expect(r.tiles[8 * W + 14]).toBe(T.BURNT);
    expect(r.tiles[8 * W + 16]).toBe(T.BURNT);
  });

  it('die Bombe des Helden bleibt bei 3×3', () => {
    const r = hall();
    const a = mob(r, 11, 9), b = mob(r, 12, 8);
    explode(r, 10, 8, 1);
    expect(a.hp).toBeLessThan(500);
    expect(b.hp).toBe(500);
    expect(r.tiles[8 * W + 10]).toBe(T.FLOOR); // die Bombe brennt keinen Boden ab
  });

  it('Kisten lassen sich auch über Brandfläche schieben', () => {
    const r = hall();
    r.tiles[8 * W + 7] = T.CRATE; r.tiles[8 * W + 8] = T.BURNT;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.tiles[8 * W + 8]).toBe(T.CRATE);
    expect(r.p.x).toBe(7);
  });
});
