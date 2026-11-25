import { describe, it, expect, afterEach } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, explode, hitTile, serialize, deserialize, passageCandidates, Run, Actor } from '../src/game/run';
import { W, H, T, computeFov, distMap, walkable } from '../src/game/dungeon';
import { MOBS, FEATURES, CLASS_ORDER } from '../src/game/content';
import { botRun } from './bot';
import flagOff from './fixtures/flag-off.json';

// Empty hall 20×9 without monsters, hero on the left
function hall(): Run {
  const r = newRun(91, 'krieger', defaultMeta());
  r.floor = 3; r.mobs = []; r.puzzle = null; r.fire.clear(); r.fuses.clear(); r.traps = []; r.hazards = []; r.mode = 'play'; r.gas = undefined;
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 4; y <= 12; y++) for (let x = 4; x <= 24; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 6; r.p.y = 8; r.p.hp = r.p.maxHp = 999;
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function mob(r: Run, x: number, y: number, kind = 'skelett'): Actor {
  const d = MOBS[kind];
  const m: Actor = { id: r.nextId++, kind, name: d.name, x, y, hp: 500, maxHp: 500, atk: 0, def: 0, st: {}, xp: 0, cd: 0, awake: false };
  r.mobs.push(m);
  return m;
}
const at = (x: number, y: number) => y * W + x;
const fnv = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };

afterEach(() => { FEATURES.destruction = true; FEATURES.huntPressure = true; FEATURES.spacing = true; });

describe('destructible world: objects', () => {
  it('a pot breaks on a blow; the hero stays put; contents are fixed per tile', () => {
    const r = hall(), i = at(7, 8);
    r.tiles[i] = T.POT;
    const gold = r.p.gold, pots = r.p.potions;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.tiles[i]).toBe(T.FLOOR);
    expect([r.p.x, r.p.y]).toEqual([6, 8]);
    expect(r.fx.some(f => f.k === 'break' && f.mat === 'clay')).toBe(true);
    // same pot, same contents
    const r2 = hall(); r2.tiles[i] = T.POT; act(r2, { t: 'move', dx: 1, dy: 0 });
    expect([r2.p.gold - gold, r2.p.potions - pots, r2.mobs.length]).toEqual([r.p.gold - gold, r.p.potions - pots, r.mobs.length]);
  });

  it('fire on oil lights the whole connected puddle in the same turn, then it burns out to scorch', () => {
    const r = hall();
    const puddle = [at(10, 8), at(11, 8), at(12, 8), at(12, 9), at(13, 9)], apart = at(15, 9);
    for (const i of [...puddle, apart]) r.tiles[i] = T.OIL;
    hitTile(r, puddle[0], 'fire');
    for (const i of puddle) expect(r.fire.has(i)).toBe(true);
    expect(r.fire.has(apart)).toBe(false); // not connected
    for (let k = 0; k < 6; k++) act(r, { t: 'wait' });
    for (const i of puddle) { expect(r.fire.has(i)).toBe(false); expect(r.tiles[i]).toBe(T.BURNT); }
  });

  it('ice melts to water under fire or a blast; water does not burn and puts out burning', () => {
    const r = hall();
    r.tiles[at(10, 8)] = T.ICE; r.tiles[at(14, 8)] = T.ICE;
    hitTile(r, at(10, 8), 'fire');
    explode(r, 14, 8, 1);
    expect(r.tiles[at(10, 8)]).toBe(T.WATER);
    expect(r.tiles[at(14, 8)]).toBe(T.WATER);
    hitTile(r, at(10, 8), 'fire');
    expect(r.fire.has(at(10, 8))).toBe(false);
    const m = mob(r, 10, 8); m.st.brand = 3;
    r.p.st.brand = 3; r.tiles[at(6, 8)] = T.WATER;
    act(r, { t: 'wait' });
    expect(m.st.brand).toBeUndefined();
    expect(r.p.st.brand).toBeUndefined();
  });

  it('fire burns cobwebs; anyone stepping into a web is held for a turn', () => {
    const r = hall();
    r.tiles[at(10, 8)] = T.WEB;
    hitTile(r, at(10, 8), 'fire');
    expect(r.tiles[at(10, 8)]).toBe(T.FLOOR);
    // hero: steps in, the next move is spent struggling
    r.tiles[at(7, 8)] = T.WEB;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect([r.p.x, r.tiles[at(7, 8)]]).toEqual([7, T.FLOOR]);
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.p.x).toBe(7);
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.p.x).toBe(8);
    // monster: same rule
    const r2 = hall(), m = mob(r2, 12, 8);
    m.awake = true;
    r2.tiles[at(11, 8)] = T.WEB;
    act(r2, { t: 'wait' });
    expect([m.x, m.st.netz]).toEqual([11, 2]);
    act(r2, { t: 'wait' });
    expect(m.x).toBe(11); // held
    act(r2, { t: 'wait' });
    expect(m.x).toBe(10);
  });

  it('a destroyed spore cap poisons everyone in the 3×3 cloud', () => {
    const r = hall();
    r.tiles[at(8, 8)] = T.SPORE;
    const m = mob(r, 9, 9);
    r.p.x = 7; r.p.y = 8;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.tiles[at(8, 8)]).toBe(T.FLOOR);
    expect(m.st.gift).toBeGreaterThan(0);
    expect(r.p.st.gift).toBeGreaterThan(0);
    expect(r.gas?.size).toBeGreaterThan(0);
    for (let k = 0; k < 4; k++) act(r, { t: 'wait' });
    expect(r.gas?.size ?? 0).toBe(0);
  });

  it('a ring of eight barrels explodes exactly eight times', () => {
    const r = hall();
    const ring = [[12, 7], [13, 7], [14, 7], [14, 8], [14, 9], [13, 9], [12, 9], [12, 8]].map(([x, y]) => at(x, y));
    for (const i of ring) r.tiles[i] = T.BARREL;
    r.fuses.set(ring[0], 1);
    act(r, { t: 'wait' });
    expect(r.fx.filter(f => f.k === 'boom' && f.barrel).length).toBe(8);
    for (const i of ring) expect(r.tiles[i]).toBe(T.BURNT);
  });

  it('chain: barrel smashes a crate and lights oil, the fire reaches a second barrel', () => {
    const r = hall();
    r.tiles[at(12, 8)] = T.BARREL; r.tiles[at(13, 8)] = T.CRATE;
    for (const x of [14, 15, 16, 17]) r.tiles[at(x, 9)] = T.OIL;
    r.tiles[at(18, 9)] = T.BARREL;
    r.fuses.set(at(12, 8), 1);
    act(r, { t: 'wait' });
    expect(r.tiles[at(13, 8)]).toBe(T.RUBBLE);
    expect(r.fire.has(at(17, 9))).toBe(true);
    for (let k = 0; k < 4 && r.tiles[at(18, 9)] === T.BARREL; k++) act(r, { t: 'wait' });
    expect(r.tiles[at(18, 9)]).toBe(T.BURNT);
  });

  it('blows from knockback or heavy monsters: pot breaks, barrel is lit, cracked wall gives way', () => {
    const r = hall();
    r.tiles[at(10, 8)] = T.POT; r.tiles[at(11, 8)] = T.BARREL; r.tiles[at(12, 8)] = T.CRACKED;
    expect(hitTile(r, at(10, 8), 'knock')).toBe(true);
    expect(r.tiles[at(10, 8)]).toBe(T.FLOOR);
    hitTile(r, at(11, 8), 'knock');
    expect(r.fuses.get(at(11, 8))).toBe(2);
    for (let k = 0; k < 3; k++) hitTile(r, at(12, 8), 'smash');
    expect(r.tiles[at(12, 8)]).toBe(T.RUBBLE);
  });

  it('a monster on cracked floor breaks through; bosses and elites do not', () => {
    const r = hall();
    r.tiles[at(9, 8)] = T.FRAGILE2; r.tiles[at(9, 10)] = T.FRAGILE2;
    const m = mob(r, 10, 8), e = mob(r, 10, 10);
    e.elite = true; m.awake = e.awake = true;
    r.p.x = 6; r.p.y = 9;
    act(r, { t: 'wait' });
    expect(r.mobs.includes(m)).toBe(false);
    expect(r.mobs.includes(e)).toBe(true);
  });

  it('puzzle vaults are never touched', () => {
    const r = hall();
    r.puzzle = { kind: 'ice', x: 14, y: 5, solved: false } as unknown as Run['puzzle'];
    r.tiles[at(16, 8)] = T.ICE; r.tiles[at(17, 8)] = T.CRATE; r.tiles[at(15, 7)] = T.STATUE;
    const before = [...r.tiles];
    explode(r, 16, 8, 2);
    hitTile(r, at(16, 8), 'fire');
    for (const i of [at(16, 8), at(17, 8), at(15, 7)]) expect(r.tiles[i]).toBe(before[i]);
  });

  it('save and load keep new tiles and the poison cloud', () => {
    const r = hall();
    r.tiles[at(8, 8)] = T.SPORE; r.tiles[at(10, 10)] = T.OIL; r.tiles[at(11, 10)] = T.WEB;
    r.p.x = 7;
    act(r, { t: 'move', dx: 1, dy: 0 });
    const b = deserialize(serialize(r))!;
    expect(b.gas && [...b.gas]).toEqual([...r.gas!]);
    expect(serialize(b)).toBe(serialize(r));
  });
});

describe('destructible world: generation', () => {
  // Walks a run down floor by floor and yields each fresh floor
  function* floors(seed: number, n: number) {
    const r = newRun(seed, CLASS_ORDER[seed % 3], defaultMeta());
    for (let f = 1; f <= n; f++) {
      yield r;
      r.mode = 'play'; r.mobs = []; r.tiles[r.p.y * W + r.p.x] = T.STAIRS;
      act(r, { t: 'descend' });
      if (r.floor % 5 === 0) { r.mode = 'play'; r.tiles[r.p.y * W + r.p.x] = T.STAIRS; act(r, { t: 'descend' }); }
    }
  }

  it('hidden passages connect two reachable areas, shorten the way and never touch a vault', () => {
    let found = 0;
    for (let seed = 1; seed <= 200; seed++) for (const r of floors(seed, 1)) {
      const t = r.tiles, d0 = distMap(t, r.p.x, r.p.y), z = r.puzzle;
      const open = (i: number) => walkable(t[i]) && d0[i] >= 0;
      for (let i = 0; i < W * H; i++) {
        if (t[i] !== T.CRACKED) continue;
        // a straight run of one or two cracked walls with reachable floor on both ends
        for (const st of [1, W]) for (const len of [1, 2]) {
          const run = Array.from({ length: len }, (_, k) => i + st * k), a = i - st, b = i + st * len;
          if (!run.every(w => t[w] === T.CRACKED) || !open(a) || !open(b)) continue;
          found++;
          const x = i % W, y = (i / W) | 0;
          if (z) expect(x >= z.x - 1 && x <= z.x + 7 && y >= z.y - 1 && y <= z.y + 7).toBe(false);
          expect(distMap(t, a % W, (a / W) | 0)[b]).toBeGreaterThanOrEqual(10 + len);
          for (const w of run) t[w] = T.FLOOR;
          expect(distMap(t, a % W, (a / W) | 0)[b]).toBe(len + 1);
          for (const w of run) t[w] = T.CRACKED;
        }
      }
    }
    expect(found).toBeGreaterThan(140); // most floors have at least one (about 3 in 4)
  });

  it('new objects appear per biome and the stairs stay reachable', () => {
    const count: Record<number, number[]> = { 0: [0, 0, 0, 0, 0], 1: [0, 0, 0, 0, 0], 2: [0, 0, 0, 0, 0] };
    const kinds: number[] = [T.POT, T.OIL, T.WATER, T.WEB, T.SPORE];
    for (let seed = 1; seed <= 12; seed++) for (const r of floors(seed, 14)) {
      const bio = Math.min(2, Math.floor((r.floor - 1) / 5));
      for (const v of r.tiles) { const k = kinds.indexOf(v); if (k >= 0) count[bio][k]++; }
      const s = r.tiles.indexOf(T.STAIRS);
      if (s >= 0) expect(distMap(r.tiles, r.p.x, r.p.y)[s]).toBeGreaterThanOrEqual(0);
    }
    expect(count[0][0] && count[0][1] && count[0][3]).toBeTruthy();  // crypt: pots, oil, webs
    expect(count[1][2] && count[1][3] && count[1][4]).toBeTruthy();  // cave: water, webs, spores
    expect(count[2][0] && count[2][1]).toBeTruthy();                 // forge: pots, oil
    expect(count[2][4] + count[0][4] + count[1][1] + count[2][2]).toBe(0); // nothing out of place
  });

  it('candidates are straight walls of one or two tiles between plain floor', () => {
    const r = newRun(5, 'krieger', defaultMeta());
    const c = passageCandidates(r);
    expect(c.length).toBeGreaterThan(0);
    for (const q of c) {
      for (const w of q.tiles) expect(r.tiles[w]).toBe(T.WALL);
      const step = Math.abs(q.b - q.a) / (q.tiles.length + 1);
      expect(step === 1 || step === W).toBe(true);
    }
  });
});

describe('destructible world: switch', () => {
  it('switched off: bot runs match the version before, bit for bit', () => {
    FEATURES.destruction = false; FEATURES.huntPressure = false; FEATURES.spacing = false; // all newer than the fixture
    const out: Record<string, string> = {};
    for (const cls of ['krieger', 'magier', 'waldlaeufer'] as const) for (const seed of [3, 17, 101]) {
      const r = botRun(newRun(seed * 7919, cls, defaultMeta()), 1500);
      r.fx = [];
      out[`${cls}-${seed}`] = `${r.floor}:${r.turn}:${fnv(serialize(r))}`;
    }
    expect(out).toEqual(flagOff);
  });

  it('switched off: no new tiles are generated', () => {
    FEATURES.destruction = false;
    for (let seed = 1; seed <= 20; seed++) {
      const r = newRun(seed, 'magier', defaultMeta());
      expect(r.tiles.some(v => v >= T.OIL)).toBe(false);
      expect(r.gas).toBeUndefined();
    }
  });
  void H;
});
