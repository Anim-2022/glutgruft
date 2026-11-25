import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { genDungeon, W, H, T, wallLike, walkable } from '../src/game/dungeon';
import { propAt, propsFor, propFamily, SPACING, VARIETY_R, torchSpots, TORCH_GAP } from '../src/render/props';
import { newRun, act } from '../src/game/run';
import { defaultMeta } from '../src/core/save';
import { biomeOf } from '../src/game/content';
import { VS } from '../src/game/puzzles';

// Dekor ist reine Darstellung: fest am Feld, nur auf Wandfront oder freiem Boden, nie in einem Gang
describe('Dekor je Biom', () => {
  for (const style of [0, 1, 2]) it(`Biom ${style}: Slotierung fest und an erlaubten Stellen`, () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { tiles } = genDungeon(new RNG(seed * 97 + style), style);
      const before = tiles.slice();
      let n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = propAt(tiles, seed, x, y), i = y * W + x;
        expect(propAt(tiles, seed, x, y)).toEqual(p);
        if (!p) continue;
        n++;
        if (p.kind === 'wall') {
          // gerade Wandstrecke: auch links und rechts Front
          for (const d of [-1, 0, 1]) { expect(tiles[i + d]).toBe(T.WALL); expect(wallLike(tiles[i + d + W])).toBe(false); }
          continue;
        }
        expect(tiles[i]).toBe(T.FLOOR);
        if (p.kind === 'foot') {
          for (const d of [-W - 1, -W, -W + 1]) expect(wallLike(tiles[i + d])).toBe(true);
          // links, rechts und zwei Felder nach unten offen: Raum, kein Gang
          for (const d of [-1, 1, W, 2 * W]) expect(walkable(tiles[i + d])).toBe(true);
        }
        if (p.kind === 'flat') for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(wallLike(tiles[i + dy * W + dx])).toBe(false);
      }
      expect(n).toBeGreaterThan(2);
      // nie zwei Stücke dicht beieinander
      const spots: [number, number][] = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (propAt(tiles, seed, x, y)) spots.push([x, y]);
      for (const [ax, ay] of spots) for (const [bx, by] of spots) if (ax !== bx || ay !== by) expect(Math.max(Math.abs(ax - bx), Math.abs(ay - by))).toBeGreaterThan(SPACING);
      expect(tiles).toEqual(before);
    }
  });

  it('Fackeln stehen nie dicht beieinander und nur auf Wandfronten', () => {
    for (const style of [0, 1, 2]) for (let seed = 1; seed <= 6; seed++) {
      const { tiles } = genDungeon(new RNG(seed * 31 + style), style);
      const t = torchSpots(tiles, seed);
      expect(t.length).toBeGreaterThan(2);
      for (const i of t) { expect(tiles[i]).toBe(T.WALL); expect(walkable(tiles[i + W])).toBe(true); }
      for (const a of t) for (const b of t) if (a !== b) expect(Math.max(Math.abs((a % W) - (b % W)), Math.abs(((a / W) | 0) - ((b / W) | 0)))).toBeGreaterThan(TORCH_GAP);
    }
  });

  // Real floors (with objects and puzzle chambers): decor keeps clear of everything that stands on the floor
  const OBJ = new Set<number>([T.POT, T.SPORE, T.BARREL, T.PILLAR, T.CHEST, T.CURSED, T.MIMIC, T.ALTAR, T.TRADER, T.FOUNTAIN, T.TABLET, T.STAIRS, T.CRATE]);
  it('no decor in puzzle chambers, beside objects or crowding torches; neighbours differ', () => {
    let floors = 0, props = 0, near = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = newRun(seed * 101, 'krieger', defaultMeta());
      for (let f = 1; f <= 7; f += 3) {
        while (r.floor < f) { r.mode = 'play'; r.mobs = []; r.tiles[r.p.y * W + r.p.x] = T.STAIRS; act(r, { t: 'descend' }); }
        const z = r.puzzle, bi = biomeOf(r.floor), zone = z ? { x0: z.x - 1, y0: z.y - 1, x1: z.x + VS, y1: z.y + VS + 1 } : null;
        const map = propsFor(r.tiles, r.seed + r.floor, bi, zone), torches = new Set(torchSpots(r.tiles, r.seed + r.floor));
        const spots: [number, number][] = [];
        floors++;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const p = map[y * W + x];
          if (!p) continue;
          props++; spots.push([x, y]);
          if (zone) expect(x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1).toBe(false);
          if (p.kind === 'wall') { expect(torches.has(y * W + x - 1) || torches.has(y * W + x + 1) || torches.has(y * W + x)).toBe(false); continue; }
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) expect(OBJ.has(r.tiles[(y + oy) * W + x + ox])).toBe(false);
        }
        // the same variant never twice within VARIETY_R; the same family only rarely
        for (const [ax, ay] of spots) for (const [bx, by] of spots) {
          if ((ax === bx && ay === by) || Math.max(Math.abs(ax - bx), Math.abs(ay - by)) > VARIETY_R) continue;
          const a = map[ay * W + ax]!, b = map[by * W + bx]!;
          if (a.kind !== b.kind) continue;
          expect(a.pick).not.toBe(b.pick);
          if (propFamily(bi, a) === propFamily(bi, b)) near++;
        }
      }
    }
    expect(props / floors).toBeGreaterThan(5);
    expect(near / props).toBeLessThan(0.25);
  });
});
