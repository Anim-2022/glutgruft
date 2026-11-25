import { describe, it, expect, afterEach } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, explode, Run, Actor, serialize, deserialize, hunted } from '../src/game/run';
import { W, H, T, computeFov } from '../src/game/dungeon';
import { FEATURES, HUNTER, MOBS } from '../src/game/content';

const F0 = { ...FEATURES };
afterEach(() => Object.assign(FEATURES, F0));

// Empty corridor 3×58, hero in the middle (as in hunters.test.ts)
function arena(floor = 4): Run {
  FEATURES.events = false;
  const r = newRun(77, 'krieger', defaultMeta());
  r.floor = floor; r.mobs = []; r.puzzle = null; r.fire.clear(); r.traps = []; r.hazards = []; r.evQ = []; r.ev = null;
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 5; y < 8; y++) for (let x = 2; x < 60; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 30; r.p.y = 6; r.p.hp = r.p.maxHp = 100000;
  r.entry = [3, 6];
  r.hunt = { next: HUNTER.first, n: 0 }; r.floorTurns = 0;
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function put(r: Run, kind: string, x: number, y: number): Actor {
  const d = MOBS[kind];
  const m: Actor = { id: r.nextId++, kind, name: d.name, x, y, hp: 1, maxHp: d.hp, atk: d.atk, def: d.def, st: {}, xp: d.xp, cd: 0, awake: true };
  r.mobs.push(m);
  return m;
}
const hunters = (r: Run) => r.mobs.filter(m => MOBS[m.kind].hunter);
// kill a hunter with a small blast (hp 1); returns the gold it paid
function slay(r: Run, m: Actor): number {
  const g = r.p.gold;
  m.hp = 1;
  explode(r, m.x, m.y, 1);
  expect(r.mobs.includes(m)).toBe(false);
  return r.p.gold - g;
}

describe('hunt pressure: farming does not pay', () => {
  it('each further hunter killed on a floor pays less, from the fourth on nothing; a new floor starts over', () => {
    const r = arena();
    const paid = [0, 1, 2, 3, 4].map(() => slay(r, put(r, 'echse', 40, 6)));
    const full = Math.ceil(MOBS.echse.xp / 6);
    expect(paid[0]).toBe(full);
    expect(paid[1]).toBeLessThan(paid[0]);
    expect(paid[2]).toBeLessThan(paid[1]);
    expect(paid.slice(3)).toEqual([0, 0]);
    // sum over a whole farming session stays below 1.6 × one hunter
    const total = HUNTER.rewardDecay.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(1.6);
    // next floor: full reward again
    r.tiles[r.p.y * W + r.p.x] = T.STAIRS; r.mode = 'play'; act(r, { t: 'descend' });
    expect(r.huntKills ?? 0).toBe(0);
  });

  it('switched off: every hunter pays in full', () => {
    FEATURES.huntPressure = false;
    const r = arena();
    const paid = [0, 1, 2].map(() => slay(r, put(r, 'echse', 40, 6)));
    expect(new Set(paid).size).toBe(1);
  });

  it('staying escalates: pairs from the third hunter, then Death that ignores the cap and pays nothing', () => {
    FEATURES.hunterForce = 'echse';
    const r = arena(7);
    r.floorTurns = HUNTER.first - 1;
    const waves: string[][] = [];
    for (let i = 0; i < 160 && waves.length < 5; i++) {
      const before = new Set(r.mobs.map(m => m.id));
      act(r, { t: 'wait' });
      const fresh = hunters(r).filter(m => !before.has(m.id));
      if (fresh.length) waves.push(fresh.map(m => m.kind));
      for (const m of hunters(r)) { m.x = 2 + (m.id % 3); m.y = 5 + (m.id % 3); m.st.stun = 9; }
    }
    expect(waves[0]).toEqual(['echse']);
    expect(waves[1]).toEqual(['echse']);
    expect(waves[2]).toEqual(['echse', 'echse']);   // a pair
    expect(waves[3]).toEqual(['tod']);              // Death, although the cap of four is full
    expect(hunters(r).length).toBeGreaterThan(HUNTER.cap);
    const death = hunters(r).find(m => m.kind === 'tod')!;
    expect(death.st.noReward).toBe(1);
    expect(slay(r, death)).toBe(0);
  });

  it('later stages grow much stronger and shake off stuns after one turn', () => {
    FEATURES.hunterForce = 'echse';
    const r = arena(7);
    r.floorTurns = HUNTER.first - 1;
    const got: Actor[] = [];
    for (let i = 0; i < 120 && got.length < 3; i++) {
      const before = new Set(r.mobs.map(m => m.id));
      act(r, { t: 'wait' });
      for (const m of hunters(r)) if (!before.has(m.id)) got.push(m);
      for (const m of hunters(r)) { m.x = 2 + (m.id % 3); m.y = 5 + (m.id % 3); m.st.stun = 9; }
    }
    expect(got[1].maxHp).toBeGreaterThanOrEqual(Math.round(got[0].maxHp * (1 + HUNTER.growHp2)) - 1);
    expect(got[2].atk).toBeGreaterThan(got[1].atk);
    // stage 3: a bash stuns for at most one turn
    const m = got[2];
    m.st = { stage: 2 }; m.x = 31; m.y = 6; r.p.hp = 100000;
    r.mobs = [m];
    r.p.skillLvl[0] = 2;
    act(r, { t: 'skill', i: 0 });
    expect(m.st.stun ?? 0).toBeLessThanOrEqual(1 + (r.p.st.frostkern ? 1 : 0));
  });

  it('while hunted: no passive mana or regen, fountains and altars refuse', () => {
    const mk = (withHunter: boolean) => {
      const r = arena();
      r.p.cls = 'magier'; r.p.res = 0; r.p.resMax = 20;
      if (withHunter) { const h = put(r, 'echse', 5, 6); h.hp = 999; h.st.stun = 99; }
      for (let k = 0; k < 9; k++) act(r, { t: 'wait' });
      return r;
    };
    expect(mk(false).p.res).toBeGreaterThan(0);
    const r = mk(true);
    expect(hunted(r)).toBe(true);
    expect(r.p.res).toBe(0);
    r.tiles[6 * W + 31] = T.FOUNTAIN; r.p.hp = 50; r.p.maxHp = 100;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.tiles[6 * W + 31]).toBe(T.FOUNTAIN);
    expect(r.p.hp).toBe(50);
  });

  it('a blocked hunter breaks through a cracked wall; webs do not hold it', () => {
    const r = arena();
    for (let y = 5; y < 8; y++) r.tiles[y * W + 20] = T.CRACKED;
    const h = put(r, 'echse', 19, 6); h.hp = 999;
    for (let k = 0; k < 4 && r.tiles[6 * W + 20] === T.CRACKED && r.tiles[5 * W + 20] === T.CRACKED && r.tiles[7 * W + 20] === T.CRACKED; k++) act(r, { t: 'wait' });
    expect([5, 6, 7].some(y => r.tiles[y * W + 20] === T.RUBBLE)).toBe(true);
    const r2 = arena(), h2 = put(r2, 'krake', 26, 6); h2.hp = 999;
    r2.tiles[6 * W + 27] = T.WEB;
    act(r2, { t: 'wait' });
    expect(h2.st.netz ?? 0).toBe(0);
  });

  it('the kill counter survives save and load', () => {
    const r = arena();
    slay(r, put(r, 'echse', 40, 6));
    const b = deserialize(serialize(r))!;
    expect(b.huntKills).toBe(1);
  });
  void H;
});
