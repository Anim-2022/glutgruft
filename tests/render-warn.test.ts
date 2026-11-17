import { describe, it, expect } from 'vitest';
import { newRun, serialize } from '../src/game/run';
import { defaultMeta } from '../src/core/save';
import { walkable, los, W } from '../src/game/dungeon';
import { threatOf, statusMarks } from '../src/render/warn';

// Die Angriffswarnung der Darstellung darf den Spielzustand nicht berühren.
describe('render warnings and statuses are pure', () => {
  it('threatOf und statusMarks ändern weder RNG noch Lauf, Gegner oder Held', () => {
    const run = newRun(4242, 'krieger', defaultMeta());
    const p = run.p;
    // Aufbau: ein Nahkämpfer daneben, ein Schütze in Schussweite, ein Golem im Ausholen
    const free: [number, number][] = [];
    for (let y = p.y - 4; y <= p.y + 4; y++) for (let x = p.x - 4; x <= p.x + 4; x++)
      if (walkable(run.tiles[y * W + x]) && !(x === p.x && y === p.y)) free.push([x, y]);
    const adj = free.find(([x, y]) => Math.abs(x - p.x) + Math.abs(y - p.y) === 1)!;
    const far = free.find(([x, y]) => Math.abs(x - p.x) + Math.abs(y - p.y) >= 3 && los(run.tiles, x, y, p.x, p.y))!;
    const base = run.mobs[0];
    run.mobs = [
      { ...base, id: 901, kind: 'skelett', x: adj[0], y: adj[1], awake: true, st: { brand: 2, gift: 3 }, cd: 0 },
      { ...base, id: 902, kind: 'schuetze', x: far[0], y: far[1], awake: true, st: { sproede: 2 }, cd: 0 },
      { ...base, id: 903, kind: 'golem', x: adj[0], y: adj[1], awake: true, st: {}, cd: 1 },
      { ...base, id: 904, kind: 'ratte', x: adj[0], y: adj[1], awake: true, st: { stun: 2 }, cd: 0 },
      ...run.mobs.slice(1),
    ];
    p.st.wall = 2; p.st.dodge = 1;
    const before = serialize(run), rng0 = run.rng.s, fx0 = run.fx.length;
    const seen = new Set<string | null>(), marks = new Set<string>();
    for (let k = 0; k < 100; k++) {
      for (const m of run.mobs) { seen.add(threatOf(run, m)); statusMarks(m, false).forEach(x => marks.add(x)); }
      statusMarks(p, true).forEach(x => marks.add(x));
    }
    expect([...marks].sort()).toEqual(['brand', 'dodge', 'gift', 'sproede', 'stun', 'wall']);
    expect(seen.has('melee')).toBe(true);
    expect(seen.has('shot')).toBe(true);
    expect(seen.has(null)).toBe(true);
    expect(run.rng.s).toBe(rng0);
    expect(run.fx.length).toBe(fx0);
    expect(serialize(run)).toBe(before);
    // Gegenprobe: der Generator läuft danach genau wie ein frischer weiter
    const twin = newRun(4242, 'krieger', defaultMeta());
    twin.rng.s = rng0;
    expect(run.rng.next()).toBe(twin.rng.next());
  });
});
