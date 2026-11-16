import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { CRATE_TEMPLATES, cratesSolvable, mirror, genIce, iceMoves, VS } from '../src/game/puzzles';

describe('Rätsel', () => {
  it('jede Kistenvorlage ist lösbar und lässt Hebel und Tür frei', () => {
    CRATE_TEMPLATES.forEach((tpl, i) => {
      expect(tpl.length, `Vorlage ${i}`).toBe(VS);
      for (const r of tpl) expect(r.length, `Vorlage ${i}`).toBe(VS);
      expect(tpl[6][0]).toBe('L');
      expect(tpl[6][3] + tpl[6][1] + tpl[5][0], `Vorlage ${i}`).toBe('...');
      const n = cratesSolvable(tpl);
      expect(n, `Vorlage ${i}`).toBeGreaterThan(5);
      expect(cratesSolvable(mirror(tpl)), `Vorlage ${i} gespiegelt`).toBe(n);
    });
  });
  it('erzeugte Eishallen sind lösbar und ohne Sackgassen', () => {
    const rng = new RNG(5);
    for (let i = 0; i < 200; i++) expect(iceMoves(genIce(rng))).toBeGreaterThanOrEqual(4);
  });
});

import { defaultMeta } from '../src/core/save';
import { newRun, act } from '../src/game/run';
import { W, T, distMap } from '../src/game/dungeon';

describe('Rätselkammer in der Ebene', () => {
  it('ist erreichbar und kommt oft genug vor', () => {
    let vaults = 0;
    const kinds: Record<string, number> = {};
    for (let seed = 1; seed <= 300; seed++) {
      const run = newRun(seed, 'krieger', defaultMeta());
      const z = run.puzzle;
      if (!z) continue;
      vaults++;
      kinds[z.kind] = (kinds[z.kind] ?? 0) + 1;
      const d = distMap(run.tiles, run.p.x, run.p.y);
      expect(d[(z.y + 7) * W + z.x + 3], `Tür, Seed ${seed}`).toBeGreaterThan(0); // Tür unten Mitte
      expect(d[run.tiles.indexOf(T.STAIRS)]).toBeGreaterThan(0);
      if (z.kind === 'runes') expect(run.tiles.includes(T.TABLET)).toBe(true);
    }
    console.log(`Kammern: ${vaults}/300`, JSON.stringify(kinds));
    expect(vaults).toBeGreaterThan(100);
  });

  it('Runen in richtiger Reihenfolge geben eine Reliquie', () => {
    for (let seed = 1; seed < 400; seed++) {
      const run = newRun(seed, 'krieger', defaultMeta());
      const z = run.puzzle;
      if (!z || z.kind !== 'runes') continue;
      const pos = (k: number) => +Object.keys(z.runes).find(i => z.runes[+i] === k)!;
      run.mobs = [];
      for (const k of z.order) {
        const i = pos(k);
        run.p.x = (i % W) - 1; run.p.y = (i / W) | 0;
        act(run, { t: 'move', dx: 1, dy: 0 });
      }
      expect(z.solved).toBe(true);
      expect(run.mode).toBe('perk');
      act(run, { t: 'perk', i: 0 });
      expect(run.p.relics.length).toBe(1);
      return;
    }
    throw new Error('keine Runenkammer gefunden');
  });
});
