import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, explode, serialize, Run, Actor, Fx, DeathCause, DEATH_CAUSES } from '../src/game/run';
import { W, H, T, computeFov } from '../src/game/dungeon';
import { MOBS } from '../src/game/content';
import { buildCorpse, corpseLook, corpseVariant, materialOf, lyingPose, cutGrid, VARIANTS, Grid } from '../src/render/corpses';
import { corpseRoom, fitSpan } from '../src/render/deaths';
import { PAL } from '../src/render/sprites';

// An empty hall 20×9 without enemies, hero on the left
function hall(cls: 'krieger' | 'magier' | 'waldlaeufer'): Run {
  const r = newRun(91, cls, defaultMeta());
  r.floor = 3; r.mobs = []; r.puzzle = null; r.fire.clear(); r.fuses.clear(); r.traps = []; r.hazards = []; r.mode = 'play';
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 4; y <= 12; y++) for (let x = 4; x <= 24; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 6; r.p.y = 8; r.p.hp = r.p.maxHp = 999;
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function mob(r: Run, x: number, y: number, hp = 1, kind = 'ratte'): Actor {
  const d = MOBS[kind];
  const m: Actor = { id: r.nextId++, kind, name: d.name, x, y, hp, maxHp: hp, atk: 0, def: 0, st: {}, xp: 0, cd: 0, awake: false };
  r.mobs.push(m);
  return m;
}
const deaths = (r: Run) => r.fx.filter((f): f is Extract<Fx, { k: 'die' }> => f.k === 'die');

describe('death cause on the die fx', () => {
  it('warrior melee kill → slash', () => {
    const r = hall('krieger');
    mob(r, 7, 8);
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(deaths(r).map(f => f.cause)).toEqual(['slash']);
  });

  it('ranger shot → arrow', () => {
    const r = hall('waldlaeufer');
    mob(r, 10, 8);
    act(r, { t: 'shoot' });
    expect(deaths(r).map(f => f.cause)).toEqual(['arrow']);
  });

  it('mage fireball → fire, burning → fire, mage spark → magic', () => {
    const r = hall('magier');
    mob(r, 10, 8);
    act(r, { t: 'skill', i: 0 });
    expect(deaths(r).map(f => f.cause)).toEqual(['fire']);
    const b = hall('magier');
    const m = mob(b, 14, 8, 2);
    m.st.brand = 3;
    act(b, { t: 'wait' });
    expect(deaths(b).map(f => f.cause)).toEqual(['fire']);
    const s = hall('magier');
    mob(s, 8, 8);
    act(s, { t: 'shoot' });
    expect(deaths(s).map(f => f.cause)).toEqual(['magic']);
  });

  it('frost nova → frost, poison tick → poison', () => {
    const r = hall('magier');
    mob(r, 7, 8);
    act(r, { t: 'skill', i: 1 });
    expect(deaths(r).map(f => f.cause)).toEqual(['frost']);
    const g = hall('krieger');
    const m = mob(g, 14, 8, 1);
    m.st.gift = 3;
    act(g, { t: 'wait' });
    expect(deaths(g).map(f => f.cause)).toEqual(['poison']);
  });

  it('barrel / bomb blast → blast', () => {
    const r = hall('krieger');
    mob(r, 11, 8); mob(r, 12, 9);
    explode(r, 11, 8, 1);
    expect(deaths(r).map(f => f.cause)).toEqual(['blast', 'blast']);
    const b = hall('krieger');
    b.tiles[8 * W + 15] = T.BARREL;
    mob(b, 14, 8);
    b.fuses.set(8 * W + 15, 1);
    act(b, { t: 'wait' });
    expect(deaths(b).map(f => f.cause)).toEqual(['blast']);
  });

  it('the cause never reaches the saved state', () => {
    const r = hall('krieger');
    mob(r, 7, 8);
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(serialize(r)).not.toContain('slash');
  });
});

// Minimal stand-in sprite: an outlined 8×14 figure with skin, cloth and a pale highlight
function figure(): Grid {
  const g: Grid = Array.from({ length: 16 }, () => Array(16).fill(null));
  for (let y = 1; y < 15; y++) for (let x = 4; x < 12; x++) g[y][x] = y === 1 || y === 14 || x === 4 || x === 11 ? PAL.k : y < 5 ? PAL.h : y < 10 ? PAL.b : PAL.n;
  g[3][6] = PAL.w;
  return g;
}
const palette = new Set(Object.values(PAL));

describe('corpse variants (render helpers)', () => {
  it('maps kind and cause to a look by material', () => {
    expect(materialOf('ratte')).toBe('flesh');
    expect(materialOf('skelett')).toBe('bone');
    expect(materialOf('golem')).toBe('stone');
    expect(materialOf('glutgeist')).toBe('spirit');
    expect(materialOf('sporling')).toBe('slime');
    expect(corpseLook('ratte', 'slash')).toBe('halves+blood');
    expect(corpseLook('skelett', 'slash')).toBe('halves+bones');
    expect(corpseLook('ratte', 'arrow')).toBe('arrows+blood');
    expect(corpseLook('glutgeist', 'fire')).toBe('ash+embers');
    expect(corpseLook('golem', 'blast')).toBe('rubble+scorch');
    expect(corpseLook('ratte', undefined)).toBe('default');
    // no blood for things that do not bleed
    for (const k of ['skelett', 'golem', 'glutgeist']) for (const c of DEATH_CAUSES) expect(corpseLook(k, c)).not.toContain('blood');
  });

  it('variant is stable per tile and spread over all eight', () => {
    expect(corpseVariant('ratte', 10, 7)).toBe(corpseVariant('ratte', 10, 7));
    const seen = new Set<number>();
    for (let x = 0; x < 60; x++) seen.add(corpseVariant('skelett', x, 3));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('the eight variants of one corpse look different', () => {
    for (const cause of DEATH_CAUSES) {
      const looks = new Set<string>();
      for (let v = 0; v < VARIANTS; v++) looks.add(JSON.stringify(buildCorpse(figure(), 'ratte', cause, v)));
      expect(looks.size).toBe(VARIANTS);
    }
  });

  it('a corpse stays small: about one tile, a boss about a tile and a half', () => {
    const tall = (w: number, h: number): Grid => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#1a1c2c' : '#94b0c2')));
    for (const [src, max] of [[tall(10, 16), 18], [tall(30, 32), 30]] as [Grid, number][]) for (const cause of DEATH_CAUSES) for (let v = 0; v < VARIANTS; v++) {
      const { g } = cutGrid(buildCorpse(src, 'ratte', cause, v));
      expect(g[0].length).toBeLessThanOrEqual(max);
      expect(g.length).toBeLessThanOrEqual(max);
    }
  });

  it('corpses lie on the floor: shifted off walls, along narrow corridors', () => {
    const r = newRun(5, 'krieger', defaultMeta());
    r.tiles.fill(T.WALL);
    // a corridor one tile wide running north-south at x = 10, a room east of x = 20
    for (let y = 2; y < 12; y++) r.tiles[y * W + 10] = T.FLOOR;
    for (let y = 2; y < 12; y++) for (let x = 20; x < 30; x++) r.tiles[y * W + x] = T.FLOOR;
    const room = corpseRoom(r, 10, 5);
    expect([room.x0, room.x1]).toEqual([160, 176]); // the corridor's own tile only
    const big = corpseRoom(r, 20, 2); // north-west corner of the room
    expect([big.x0, big.y0, big.x1, big.y1]).toEqual([320, 32, 352, 64]);
    expect(fitSpan(150, 20, 160, 176)).toBe(158); // too wide: centred, the rest is clipped
    expect(fitSpan(300, 12, 320, 352)).toBe(320);  // pushed away from the wall
    expect(fitSpan(330, 12, 320, 352)).toBe(330);  // fits: unchanged
  });

  it('lying pose turns tall figures on their side', () => {
    const lie = lyingPose(figure());
    expect(lie[0].length).toBe(14);
    expect(lie.length).toBe(8);
  });

  it('every cause builds a deterministic, palette-only corpse that differs from the others', () => {
    const outs = new Map<DeathCause, string>();
    for (const kind of ['ratte', 'skelett', 'golem', 'glutgeist', 'sporling']) for (const cause of DEATH_CAUSES) for (let v = 0; v < 4; v++) {
      const a = buildCorpse(figure(), kind, cause, v, { lit: true });
      const b = buildCorpse(figure(), kind, cause, v, { lit: true });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      let n = 0;
      for (const row of a) for (const c of row) if (c) { n++; expect(palette.has(c)).toBe(true); }
      expect(n).toBeGreaterThan(30);
      if (kind === 'ratte' && v === 0) outs.set(cause, JSON.stringify(a));
    }
    expect(new Set(outs.values()).size).toBe(DEATH_CAUSES.length);
  });

  it('slash leaves red blood on flesh only; reduced effects darken it', () => {
    const count = (g: Grid, col: string) => g.flat().filter(c => c === col).length;
    const flesh = buildCorpse(figure(), 'ratte', 'slash', 0);
    const bone = buildCorpse(figure(), 'skelett', 'slash', 0);
    const calm = buildCorpse(figure(), 'ratte', 'slash', 0, { reduced: true });
    expect(count(flesh, PAL.r) + count(flesh, PAL.R)).toBeGreaterThan(5);
    expect(count(bone, PAL.r) + count(bone, PAL.R)).toBe(0);
    expect(count(calm, PAL.R)).toBe(0);
  });

  it('fire embers glow only while lit', () => {
    const lit = buildCorpse(figure(), 'ratte', 'fire', 1, { lit: true }).flat();
    const cold = buildCorpse(figure(), 'ratte', 'fire', 1, { lit: false }).flat();
    expect(lit.some(c => c === PAL.o || c === PAL.y)).toBe(true);
    expect(cold.some(c => c === PAL.o || c === PAL.y)).toBe(false);
  });
});
