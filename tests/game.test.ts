import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { defaultMeta } from '../src/core/save';
import { W, H, T, genDungeon, distMap, center, los, walkable } from '../src/game/dungeon';
import { newRun, act, serialize, deserialize, Action } from '../src/game/run';
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
      const { tiles, rooms } = genDungeon(new RNG(seed), seed % 3);
      expect(rooms.length).toBeGreaterThanOrEqual(6);
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

  it('ein gespeicherter Lauf geht exakt gleich weiter', () => {
    const a = newRun(11, 'waldlaeufer', defaultMeta());
    const r1 = new RNG(3);
    for (let i = 0; i < 200; i++) act(a, randomAction(r1));
    const b = deserialize(serialize(a))!;
    expect(b).not.toBeNull();
    const r2 = new RNG(9), r3 = new RNG(9);
    for (let i = 0; i < 300; i++) { act(a, randomAction(r2)); act(b, randomAction(r3)); }
    a.fx = []; b.fx = [];
    expect(serialize(b)).toBe(serialize(a));
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
        expect(walkable(run.tiles[p.y * W + p.x]) || run.tiles[p.y * W + p.x] === T.ICE).toBe(true);
        const seen = new Set<number>([p.y * W + p.x]);
        for (const m of run.mobs) {
          expect(m.hp).toBeGreaterThan(0);
          expect(walkable(run.tiles[m.y * W + m.x])).toBe(true);
          const k = m.y * W + m.x;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      }
    }
  });
});

function randomAction(r: RNG): Action {
  const n = r.int(0, 20);
  if (n < 8) { const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][n % 4]; return { t: 'move', dx: d[0], dy: d[1] }; }
  if (n === 8) return { t: 'wait' };
  if (n === 9) return { t: 'shoot' };
  if (n === 10) return { t: 'potion' };
  if (n === 11) return { t: 'descend' };
  if (n === 12) return { t: 'skill', i: r.int(0, 2) };
  if (n === 13) return { t: 'bomb' };
  if (n === 14) return { t: 'buy', i: r.int(0, 3) };
  if (n === 17) return { t: 'equip', i: r.int(0, 3) };
  if (n === 18) return { t: 'unequip', slot: r.int(0, 2) };
  if (n === 19) return { t: 'sell', i: r.int(0, 3) };
  if (n === 15) return { t: 'leave' };
  if (n === 16) return { t: 'target', x: r.int(0, W - 1), y: r.int(0, H - 1) };
  return { t: 'perk', i: r.int(0, 2) };
}

import { SPR, PAL } from '../src/render/sprites';

describe('sprites', () => {
  it('sind rechteckig, quadratisch und nutzen nur Palettenfarben', () => {
    for (const [name, rows] of Object.entries(SPR)) {
      for (const [i, row] of rows.entries()) {
        expect(row.length, `${name} Zeile ${i}`).toBe(rows.length);
        for (const ch of row) expect(ch === '.' || ch in PAL, `${name} Zeichen ${ch}`).toBe(true);
      }
    }
  });
});

import { VIEWS } from '../src/render/sprites';

describe('Blickrichtungen', () => {
  it('haben dieselbe Größe wie die Vorderansicht', () => {
    for (const [name, v] of Object.entries(VIEWS)) {
      for (const [key, rows] of Object.entries(v)) {
        expect(rows.length, `${name}.${key}`).toBe(SPR[name].length);
        rows.forEach((r, i) => {
          expect(r.length, `${name}.${key} Zeile ${i}`).toBe(SPR[name].length);
          for (const ch of r) expect(ch === '.' || ch in PAL, `${name}.${key} Zeichen ${ch}`).toBe(true);
        });
      }
    }
  });
});
