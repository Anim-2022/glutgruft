import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { defaultMeta } from '../src/core/save';
import { W, H, T, genDungeon, distMap, center, los } from '../src/game/dungeon';
import { newRun, act, Action } from '../src/game/run';
import { CLASS_ORDER } from '../src/game/content';

describe('rng', () => {
  it('ist deterministisch', () => {
    const a = new RNG(42), b = new RNG(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
});

describe('dungeon', () => {
  it('alle Räume sind vom Start erreichbar', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { tiles, rooms } = genDungeon(new RNG(seed));
      expect(rooms.length).toBeGreaterThanOrEqual(4);
      const [sx, sy] = center(rooms[0]);
      const d = distMap(tiles, sx, sy);
      for (const r of rooms) { const [x, y] = center(r); expect(d[y * W + x]).toBeGreaterThanOrEqual(0); }
    }
  });
  it('Wände blockieren die Sicht', () => {
    const tiles = new Uint8Array(W * H).fill(T.FLOOR);
    tiles[5 * W + 5] = T.WALL;
    expect(los(tiles, 3, 5, 7, 5)).toBe(false);
    expect(los(tiles, 3, 4, 7, 4)).toBe(true);
    expect(los(tiles, 3, 5, 5, 5)).toBe(true);
  });
});

describe('run', () => {
  it('Truhen und Altäre versperren nie den Weg zur Treppe', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const run = newRun(seed, 'krieger', defaultMeta());
      const d = distMap(run.tiles, run.p.x, run.p.y);
      const stairs = run.tiles.indexOf(T.STAIRS);
      expect(stairs).toBeGreaterThanOrEqual(0);
      expect(d[stairs]).toBeGreaterThan(0);
      for (const m of run.mobs) expect(d[m.y * W + m.x]).toBeGreaterThanOrEqual(0);
    }
  });

  it('gleicher Seed ergibt gleichen Verlauf', () => {
    const play = () => {
      const run = newRun(7, 'magier', defaultMeta());
      const r = new RNG(1);
      for (let i = 0; i < 300; i++) act(run, randomAction(r));
      return [run.p.x, run.p.y, run.p.hp, run.floor, run.kills, run.turn];
    };
    expect(play()).toEqual(play());
  });

  it('zufällige Aktionen brechen keine Invarianten', () => {
    for (const cls of CLASS_ORDER) for (let seed = 1; seed <= 8; seed++) {
      const run = newRun(seed, cls, defaultMeta());
      const r = new RNG(seed * 31);
      for (let i = 0; i < 1500 && run.mode !== 'dead' && run.mode !== 'win'; i++) {
        act(run, randomAction(r));
        const p = run.p;
        expect(p.hp).toBeLessThanOrEqual(p.maxHp);
        expect(p.res).toBeGreaterThanOrEqual(0);
        expect(p.res).toBeLessThanOrEqual(p.resMax);
        expect(run.tiles[p.y * W + p.x] === T.FLOOR || run.tiles[p.y * W + p.x] === T.STAIRS).toBe(true);
        const seen = new Set<number>([p.y * W + p.x]);
        for (const m of run.mobs) {
          expect(m.hp).toBeGreaterThan(0);
          const k = m.y * W + m.x;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      }
    }
  });
});

function randomAction(r: RNG): Action {
  const n = r.int(0, 13);
  if (n < 8) { const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][n % 4]; return { t: 'move', dx: d[0], dy: d[1] }; }
  if (n === 8) return { t: 'wait' };
  if (n === 9) return { t: 'shoot' };
  if (n === 10) return { t: 'potion' };
  if (n === 11) return { t: 'descend' };
  if (n === 12) return { t: 'skill', i: r.int(0, 2) };
  return { t: 'perk', i: r.int(0, 2) };
}
