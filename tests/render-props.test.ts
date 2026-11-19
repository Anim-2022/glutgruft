import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { genDungeon, W, H, T, wallLike, walkable } from '../src/game/dungeon';
import { propAt } from '../src/render/props';

// Dekor ist reine Darstellung: fest am Feld, nur auf Wandfront oder freiem Boden, nie in einem Gang
describe('Dekor je Biom', () => {
  for (const style of [0, 1, 2]) it(`Biom ${style}: Platzierung fest und an erlaubten Stellen`, () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { tiles } = genDungeon(new RNG(seed * 97 + style), style);
      const before = tiles.slice();
      let n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = propAt(tiles, seed, x, y), i = y * W + x;
        expect(propAt(tiles, seed, x, y)).toEqual(p);
        if (!p) continue;
        n++;
        if (p.kind === 'wall') { expect(tiles[i]).toBe(T.WALL); expect(wallLike(tiles[i + W])).toBe(false); continue; }
        expect(tiles[i]).toBe(T.FLOOR);
        if (p.kind === 'foot') {
          expect(wallLike(tiles[i - W])).toBe(true);
          // links, rechts und unten offen: kein Gang wird optisch versperrt
          for (const d of [-1, 1, W]) expect(walkable(tiles[i + d])).toBe(true);
        }
        if (p.kind === 'flat') for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(wallLike(tiles[i + dy * W + dx])).toBe(false);
      }
      expect(n).toBeGreaterThan(5);
      expect(tiles).toEqual(before);
    }
  });
});
