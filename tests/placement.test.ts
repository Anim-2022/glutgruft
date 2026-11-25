import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { W, H, T, walkable, wallLike } from '../src/game/dungeon';
import { newRun, act, inVault } from '../src/game/run';

// Objects placed at random (pots, barrels, spore caps, chests …) keep their distance from each other
// and from doorways, so rooms read clearly and nothing blocks the way in.
const OBJ = new Set<number>([T.POT, T.SPORE, T.BARREL, T.PILLAR, T.CHEST, T.CURSED, T.MIMIC, T.ALTAR, T.TRADER, T.FOUNTAIN, T.TABLET]);
const LOOSE = new Set<number>([T.POT, T.SPORE, T.BARREL]);
const doorway = (t: Uint8Array, i: number) => walkable(t[i]) && ((wallLike(t[i - 1]) && wallLike(t[i + 1])) || (wallLike(t[i - W]) && wallLike(t[i + W])));

describe('object placement', () => {
  it('pots, barrels and spore caps never touch another object or a doorway', () => {
    let objects = 0, touch = 0, all = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const r = newRun(seed * 313, 'krieger', defaultMeta());
      for (let f = 1; f <= 12; f += 2) {
        while (r.floor < f) { r.mode = 'play'; r.mobs = []; r.tiles[r.p.y * W + r.p.x] = T.STAIRS; act(r, { t: 'descend' }); }
        const t = r.tiles;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!OBJ.has(t[i]) || inVault(r, x, y)) continue;
          all++;
          let bad = false;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const j = i + oy * W + ox;
            if (OBJ.has(t[j]) || doorway(t, j)) bad = true;
          }
          if (LOOSE.has(t[i])) { objects++; expect(bad).toBe(false); }
          else if (bad) touch++;
        }
      }
    }
    expect(objects).toBeGreaterThan(200);
    // chests, altars, traders … fall back to a tighter spot only when a room has no other place
    expect(touch / all).toBeLessThan(0.02);
  });
});
