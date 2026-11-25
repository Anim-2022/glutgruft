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
    throw new Error('keine Rune chamber gefunden');
  });
});

import { genLights, lightsMinMoves, lightsPress, lightCell, LIGHTS_ALL, iceStops, iceKind, slide, DOOR } from '../src/game/puzzles';
import { puzzleGoal, dartWarn, Run } from '../src/game/run';
import type { PuzzleKind } from '../src/game/run';

function vaultRun(kind: PuzzleKind, from = 1): Run {
  for (let seed = from; seed < from + 2000; seed++) {
    const run = newRun(seed, 'krieger', defaultMeta());
    if (run.puzzle?.kind === kind) { run.mobs = []; return run; }
  }
  throw new Error(`keine Kammer ${kind}`);
}
const stepOn = (run: Run, x: number, y: number) => { run.p.x = x; run.p.y = y + 1; act(run, { t: 'move', dx: 0, dy: -1 }); };

describe('Neue und verbesserte Kammern', () => {
  it('Glutschalen: immer lösbar in 3–5 Tritten', () => {
    const rng = new RNG(9);
    for (let i = 0; i < 200; i++) {
      const m = genLights(rng);
      expect(m).not.toBe(LIGHTS_ALL);
      const n = lightsMinMoves(m);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it('Glutschalen in der Ebene: die richtigen Tritte lösen die Kammer', () => {
    const run = vaultRun('braziers'), z = run.puzzle!;
    // eindeutige Lösung: die Menge der Tritte, die zu „alle brennen“ führt
    let press = -1;
    for (let sub = 0; sub < 512 && press < 0; sub++) {
      let m = z.lights!;
      for (let k = 0; k < 9; k++) if (sub & (1 << k)) m = lightsPress(m, k);
      if (m === LIGHTS_ALL) press = sub;
    }
    expect(press).toBeGreaterThan(0);
    for (let k = 0; k < 9; k++) if (press & (1 << k)) { const [lx, ly] = lightCell(k); stepOn(run, z.x + lx, z.y + ly); }
    expect(z.solved).toBe(true);
    expect(run.mode).toBe('perk');
    expect(puzzleGoal(run)).toMatch(/solved/);
  });

  it('Eiskristalle liegen auf erreichbaren Haltefeldern abseits des Ziels', () => {
    const rng = new RNG(11);
    for (let i = 0; i < 200; i++) {
      const g = genIce(rng), kind = iceKind(g);
      for (const c of iceStops(g)) {
        const x = c % 8, y = (c / 8) | 0;
        expect(g[y][x]).toBe('i');
        // ein Haltefeld: in mindestens eine Richtung geht es nicht weiter
        expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const [nx, ny] = slide(kind, x, y, dx, dy); return nx === x && ny === y; })).toBe(true);
        expect(c).not.toBe(DOOR[1] * 8 + DOOR[0]);
      }
    }
    const run = vaultRun('ice'), z = run.puzzle!;
    expect(z.gems!.length).toBe(z.gemsMax);
    for (const i of z.gems!) expect(run.tiles[i]).toBe(T.ICE);
  });

  it('Ice: one move slides the hero in one turn and reports the whole path for rendering', () => {
    const run = vaultRun('ice'), z = run.puzzle!, p = run.p, Wd = 64;
    let tested = 0;
    for (let y = 0; y < VS && !tested; y++) for (let x = 0; x < VS && !tested; x++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const sx = z.x + x, sy = z.y + y;
      if (run.tiles[sy * Wd + sx] !== T.ICE || run.tiles[(sy + dy) * Wd + sx + dx] !== T.ICE || run.tiles[(sy + 2 * dy) * Wd + sx + 2 * dx] !== T.ICE) continue;
      p.x = sx; p.y = sy; run.fx.length = 0;
      const turn = run.turn;
      act(run, { t: 'move', dx, dy });
      const f = run.fx.find(e => e.k === 'slide');
      if (!f || f.k !== 'slide') throw new Error('no slide fx');
      expect(run.turn).toBe(turn + 1);
      expect(f.path[0]).toEqual([sx, sy]);
      expect(f.path[f.path.length - 1]).toEqual([p.x, p.y]);
      expect(f.path.length).toBeGreaterThanOrEqual(3);
      f.path.forEach(([px, py], k) => { expect(px).toBe(sx + dx * k); expect(py).toBe(sy + dy * k); });
      tested++;
      break;
    }
    expect(tested).toBe(1);
  });

  it('Pfeilgang: mit Warten und Gehen erreichbar, rote Reihen sind genau die schießenden', () => {
    const run = vaultRun('darts'), z = run.puzzle!, p = run.p;
    p.hp = p.maxHp = 500;
    p.x = z.x + 3; p.y = z.y + 7;
    let hits = 0;
    for (let k = 0; k < 60 && !z.solved; k++) {
      const warn = dartWarn(run), next = p.y - 1;
      const hp0 = p.hp;
      if (z.entered && warn.includes(next)) act(run, { t: 'wait' });
      else act(run, { t: 'move', dx: 0, dy: -1 });
      if (p.hp < hp0) hits++;
      if (run.mode === 'perk') break;
    }
    expect(z.solved).toBe(true);
    expect(hits).toBe(0);
    // wer in einer roten Reihe stehen bleibt, wird getroffen
    const r2 = vaultRun('darts'), z2 = r2.puzzle!;
    r2.p.hp = r2.p.maxHp = 500; z2.entered = true;
    r2.p.x = z2.x + 3; r2.p.y = z2.y + 5;
    let hurt = false;
    for (let k = 0; k < 4; k++) { const h = r2.p.hp; act(r2, { t: 'wait' }); if (r2.p.hp < h) hurt = true; }
    expect(hurt).toBe(true);
  });

  it('Runen: Tafel lesen zeigt die Reihenfolge, ein Fehler ruft Wächter statt die Ebene zu wecken', () => {
    const run = vaultRun('runes'), z = run.puzzle!;
    const ti = run.tiles.indexOf(T.TABLET);
    run.p.x = (ti % W) - 1; run.p.y = (ti / W) | 0;
    act(run, { t: 'move', dx: 1, dy: 0 });
    expect(z.read).toBe(true);
    const wrong = +Object.keys(z.runes).find(i => z.runes[+i] !== z.order[0])!;
    run.p.x = (wrong % W) - 1; run.p.y = (wrong / W) | 0;
    act(run, { t: 'move', dx: 1, dy: 0 });
    expect(z.fails).toBe(1);
    const guards = run.mobs.filter(m => m.x >= z.x && m.x < z.x + 7 && m.y >= z.y && m.y < z.y + 7);
    expect(guards.length).toBe(1);
    expect(puzzleGoal(run)).toMatch(/Tries 2\/3/);
  });

  it('alle sechs Kammerarten kommen vor', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) { const k = newRun(seed, 'magier', defaultMeta()).puzzle?.kind; if (k) kinds.add(k); }
    expect([...kinds].sort()).toEqual(['arena', 'braziers', 'crates', 'darts', 'ice', 'runes']);
  });
});
