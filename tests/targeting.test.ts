import { describe, it, expect, afterEach } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, serialize, deserialize, aimTargets, aimable, aimName, Run, Actor } from '../src/game/run';
import { W, H, T, computeFov } from '../src/game/dungeon';
import { MOBS, FEATURES, ClassId } from '../src/game/content';

// Empty hall 21×9 without monsters, hero on the left (same layout as the destruction tests)
function hall(cls: ClassId = 'waldlaeufer'): Run {
  const r = newRun(91, cls, defaultMeta());
  r.floor = 3; r.mobs = []; r.puzzle = null; r.fire.clear(); r.fuses.clear(); r.traps = []; r.hazards = []; r.mode = 'play'; r.gas = undefined;
  r.ev = null; r.evQ = [];
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
const place = (r: Run, x: number, y: number, t: number) => { r.tiles[at(x, y)] = t; computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen); };

afterEach(() => { FEATURES.destruction = true; });

describe('targeting: choosing a target', () => {
  it('Tab cycles visible enemies nearest first, then objects nearest first, then wraps', () => {
    const r = hall();
    const far = mob(r, 9, 8), near = mob(r, 8, 9);
    place(r, 10, 8, T.BARREL); place(r, 8, 7, T.POT);
    const order = aimTargets(r).map(q => q.mob ?? `t${q.tile}`);
    expect(order).toEqual([near.id, far.id, `t${at(8, 7)}`, `t${at(10, 8)}`]);
    const seen: (number | string)[] = [];
    for (let k = 0; k < 5; k++) { act(r, { t: 'cycle' }); seen.push(r.tgt !== undefined ? `t${r.tgt}` : r.target); }
    expect(seen).toEqual([near.id, far.id, `t${at(8, 7)}`, `t${at(10, 8)}`, near.id]);
    expect(r.turn).toBe(0); // choosing a target costs no turn
  });

  it('a click on an object selects it, a click on an enemy switches back, a click on floor clears', () => {
    const r = hall(), m = mob(r, 9, 9);
    place(r, 10, 8, T.BARREL);
    act(r, { t: 'target', x: 10, y: 8 });
    expect(r.tgt).toBe(at(10, 8)); expect(r.target).toBe(0);
    expect(aimName(r)).toBe('Barrel');
    act(r, { t: 'target', x: 9, y: 9 });
    expect(r.target).toBe(m.id); expect(r.tgt).toBeUndefined();
    act(r, { t: 'target', x: 12, y: 10 });
    expect(r.target).toBe(0); expect(r.tgt).toBeUndefined();
    expect(aimName(r)).toBeNull();
  });

  it('objects out of sight, out of reach or in a vault cannot be chosen', () => {
    const r = hall();
    place(r, 20, 8, T.BARREL);              // 14 tiles away
    place(r, 10, 8, T.BARREL); place(r, 8, 8, T.WALL); // straight behind a wall
    expect(r.vis[at(10, 8)]).toBe(0);
    expect(aimable(r, at(20, 8))).toBe(false);
    expect(aimable(r, at(10, 8))).toBe(false);
    expect(aimTargets(r)).toEqual([]);
    act(r, { t: 'target', x: 20, y: 8 });
    expect(r.tgt).toBeUndefined();
    place(r, 9, 10, T.POT);
    r.puzzle = { x: 8, y: 9 } as Run['puzzle'];
    expect(aimable(r, at(9, 10))).toBe(false);
  });
});

describe('targeting: shooting objects', () => {
  it('the ranger shoots a barrel at range: it catches fire and explodes through the normal path', () => {
    const r = hall(), i = at(10, 8), m = mob(r, 11, 9);
    place(r, 10, 8, T.BARREL);
    act(r, { t: 'target', x: 10, y: 8 });
    const hp = m.hp;
    act(r, { t: 'shoot' });
    expect(r.turn).toBe(1);
    expect(r.fuses.has(i)).toBe(true);           // lit, like a blow
    expect(r.log).toContain('The barrel catches fire!');
    expect(m.hp).toBe(hp);                        // the enemy next to it was not shot
    for (let k = 0; k < 3 && r.tiles[i] === T.BARREL; k++) act(r, { t: 'wait' });
    expect(r.tiles[i]).toBe(T.BURNT);
    expect(m.hp).toBeLessThan(hp);                // caught in the blast
    expect(r.tgt).toBeUndefined();                // gone with the barrel
  });

  it('the aimed shot reaches farther than the basic shot; out of reach the shot costs no turn', () => {
    const r = hall(), i = at(13, 8);
    place(r, 13, 8, T.BARREL);                   // 7 tiles: beyond the basic shot (5), within the aimed shot (8)
    act(r, { t: 'cycle' });
    expect(r.tgt).toBe(i);
    act(r, { t: 'shoot' });
    expect(r.turn).toBe(0);
    expect(r.log[r.log.length - 1]).toBe('The target is out of range.');
    r.p.res = 8;
    act(r, { t: 'skill', i: 0 });
    expect(r.turn).toBe(1);
    expect(r.fuses.has(i)).toBe(true);
  });

  it('the mage fireball at a barrel makes it explode at the end of the turn', () => {
    const r = hall('magier'), i = at(11, 8);
    place(r, 11, 8, T.BARREL);
    act(r, { t: 'target', x: 11, y: 8 });
    act(r, { t: 'skill', i: 0 });
    expect(r.tiles[i]).toBe(T.BURNT);
    expect(r.tgt).toBeUndefined();
  });

  it('a pot breaks and a spore cap bursts when shot', () => {
    const r = hall();
    place(r, 9, 8, T.POT); place(r, 9, 10, T.SPORE);
    act(r, { t: 'target', x: 9, y: 8 });
    act(r, { t: 'shoot' });
    expect(r.tiles[at(9, 8)]).toBe(T.FLOOR);
    expect(r.tgt).toBeUndefined();
    act(r, { t: 'target', x: 9, y: 10 });
    act(r, { t: 'shoot' });
    expect(r.tiles[at(9, 10)]).toBe(T.FLOOR);
    expect(r.gas?.size).toBeGreaterThan(0);
  });

  it('without the destruction switch only barrels are targets and they still light', () => {
    FEATURES.destruction = false;
    const r = hall();
    place(r, 9, 8, T.POT); place(r, 10, 9, T.BARREL);
    expect(aimTargets(r).map(q => q.tile)).toEqual([at(10, 9)]);
    act(r, { t: 'target', x: 10, y: 9 });
    act(r, { t: 'shoot' });
    expect(r.fuses.has(at(10, 9))).toBe(true);
  });
});

describe('targeting: clearing and saving', () => {
  it('the object target is dropped when it leaves reach and on a floor change', () => {
    const r = hall();
    place(r, 13, 8, T.BARREL);
    act(r, { t: 'target', x: 13, y: 8 });
    expect(r.tgt).toBe(at(13, 8));
    act(r, { t: 'move', dx: -1, dy: 0 });         // 8 tiles: still in reach
    expect(r.tgt).toBe(at(13, 8));
    act(r, { t: 'move', dx: -1, dy: 0 });         // 9 tiles: out of reach
    expect(r.tgt).toBeUndefined();
    act(r, { t: 'move', dx: 1, dy: 0 });
    act(r, { t: 'target', x: 13, y: 8 });
    expect(r.tgt).toBe(at(13, 8));
    r.tiles[at(r.p.x, r.p.y)] = T.STAIRS;
    act(r, { t: 'descend' });
    expect(r.floor).toBe(4);
    expect(r.tgt).toBeUndefined();
  });

  it('save and load keep a tile target; old saves without it still load', () => {
    const r = hall();
    place(r, 10, 8, T.BARREL);
    act(r, { t: 'target', x: 10, y: 8 });
    const back = deserialize(serialize(r))!;
    expect(back.tgt).toBe(at(10, 8));
    expect(aimName(back)).toBe('Barrel');
    act(back, { t: 'shoot' });
    expect(back.fuses.has(at(10, 8))).toBe(true);
    const o = JSON.parse(serialize(r)); delete o.tgt;
    const old = deserialize(JSON.stringify(o))!;
    expect(old).not.toBeNull();
    expect(old.tgt).toBeUndefined();
    act(old, { t: 'shoot' });                      // no target, no enemy: nothing happens
    expect(old.turn).toBe(0);
    // a run without a chosen object writes no extra field
    const plain = hall();
    expect('tgt' in JSON.parse(serialize(plain))).toBe(false);
  });
});

describe('targeting: melee classes', () => {
  it('the warrior cannot aim at objects; Tab only cycles enemies as before', () => {
    const r = hall('krieger'), a = mob(r, 12, 8), b = mob(r, 8, 8);
    place(r, 9, 9, T.BARREL);
    expect(aimTargets(r).map(q => q.mob)).toEqual([b.id, a.id]);
    act(r, { t: 'target', x: 9, y: 9 });
    expect(r.tgt).toBeUndefined();
    act(r, { t: 'cycle' }); expect(r.target).toBe(b.id);
    act(r, { t: 'cycle' }); expect(r.target).toBe(a.id);
    act(r, { t: 'cycle' }); expect(r.target).toBe(b.id);
    expect(r.tgt).toBeUndefined();
  });
});
