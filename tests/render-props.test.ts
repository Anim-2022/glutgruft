import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { genDungeon, W, H, T, wallLike, walkable } from '../src/game/dungeon';
import { propAt, SPACING, torchSpots, TORCH_GAP } from '../src/render/props';

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
});
