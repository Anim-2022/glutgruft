// Versteckte Bodenfallen und Mimiks (Phase 2)
import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, Run, Actor, explode, serialize, deserialize } from '../src/game/run';
import { W, H, T, computeFov, distMap } from '../src/game/dungeon';
import { MOBS, FEATURES } from '../src/game/content';

// bis Ebene n absteigen (Treppe unter den Helden legen)
function toFloor(seed: number, n: number, cls: 'krieger' | 'magier' | 'waldlaeufer' = 'krieger'): Run {
  const run = newRun(seed, cls, defaultMeta());
  while (run.floor < n) { run.mode = 'play'; run.tiles[run.p.y * W + run.p.x] = T.STAIRS; act(run, { t: 'descend' }); }
  run.mode = 'play';
  return run;
}
// leerer Gang ohne Gegner
function hall(cls: 'krieger' | 'waldlaeufer' = 'krieger'): Run {
  const r = newRun(77, cls, defaultMeta());
  r.floor = 4; r.mobs = []; r.puzzle = null; r.fire.clear(); r.traps = []; r.hazards = [];
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 5; y < 8; y++) for (let x = 2; x < 60; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 30; r.p.y = 6;
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function mob(r: Run, kind: string, x: number, y: number): Actor {
  const d = MOBS[kind];
  const m: Actor = { id: r.nextId++, kind, name: d.name, x, y, hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def, st: {}, xp: d.xp, cd: 0, awake: true };
  r.mobs.push(m);
  return m;
}

describe('Bodenfallen', () => {
  it('liegen nie auf Start, Treppe, in der Kammer oder vor Truhen; die Treppe bleibt erreichbar', () => {
    let total = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const run = toFloor(seed, 2 + (seed % 3));
      if (run.floor % 5 === 0) continue;
      const d = distMap(run.tiles, run.p.x, run.p.y), z = run.puzzle;
      for (const h of run.hazards) {
        total++;
        expect(run.tiles[h.y * W + h.x]).toBe(T.FLOOR);
        expect(Math.max(Math.abs(h.x - run.p.x), Math.abs(h.y - run.p.y))).toBeGreaterThan(1);
        if (z) expect(h.x >= z.x - 1 && h.x <= z.x + 7 && h.y >= z.y - 1 && h.y <= z.y + 8).toBe(false);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++)
          expect([T.CHEST, T.MIMIC, T.TRADER, T.STAIRS, T.CURSED]).not.toContain(run.tiles[(h.y + oy) * W + h.x + ox]);
        expect(h.seen).toBe(false);
      }
      const st = run.tiles.indexOf(T.STAIRS);
      if (st >= 0) expect(d[st]).toBeGreaterThan(0);
    }
    expect(total).toBeGreaterThan(300 * 2);
  });

  it('Ebene 1 und Boss-Ebenen haben keine Fallen', () => {
    for (let seed = 1; seed <= 30; seed++) expect(newRun(seed, 'magier', defaultMeta()).hazards).toEqual([]);
    expect(toFloor(3, 5).hazards).toEqual([]);
  });

  it('Stacheln treffen den Helden und Gegner, Fliegende schweben darüber', () => {
    const r = hall();
    r.hazards = [{ x: 31, y: 6, kind: 'stachel', seen: false }, { x: 40, y: 6, kind: 'stachel', seen: false }, { x: 44, y: 6, kind: 'stachel', seen: false }];
    const hp = r.p.hp;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.p.hp).toBeLessThan(hp);
    expect(r.hazards[0].seen).toBe(true);
    const sk = mob(r, 'skelett', 41, 6); sk.hp = sk.maxHp = 100;
    const bat = mob(r, 'fledermaus', 45, 6); bat.hp = bat.maxHp = 100;
    r.p.x = 30;
    for (let k = 0; k < 6; k++) act(r, { t: 'wait' });
    expect(sk.hp).toBeLessThan(100);
  });

  it('ein Gegner, der in einer Falle stirbt, zählt einmal (keine doppelte Beute)', () => {
    const r = hall('waldlaeufer');
    r.hazards = [{ x: 33, y: 6, kind: 'stachel', seen: true }];
    r.traps = [{ x: 33, y: 6 }];
    const m = mob(r, 'ratte', 34, 6); m.hp = 1;
    const k0 = r.kills, xp0 = r.p.exp;
    act(r, { t: 'wait' });
    expect(r.kills).toBe(k0 + 1);
    expect(r.p.exp).toBe(xp0 + m.xp);
  });

  it('Entdecken gibt keine Erfahrung; der Waldläufer sieht angrenzende Fallen sicher', () => {
    const r = hall('waldlaeufer');
    r.hazards = [{ x: 32, y: 6, kind: 'gas', seen: false }];
    const xp0 = r.p.exp;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.hazards[0].seen).toBe(true);
    expect(r.p.exp).toBe(xp0);
    expect(r.tele?.trapSpot).toBe(1);
  });

  it('Gas vergiftet ringsum und ist danach leer; Explosionen zerstören Fallen', () => {
    const r = hall();
    r.hazards = [{ x: 31, y: 6, kind: 'gas', seen: true }, { x: 50, y: 6, kind: 'pfeil', seen: false }];
    const m = mob(r, 'skelett', 32, 6); m.hp = m.maxHp = 100; m.awake = false;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.p.st.gift).toBeGreaterThan(0);
    expect(m.st.gift).toBeGreaterThan(0);
    expect(r.hazards.length).toBe(1);
    explode(r, 50, 6, 1);
    expect(r.hazards).toEqual([]);
  });

  it('Fallen überstehen Speichern und Laden', () => {
    const r = toFloor(11, 3);
    const back = deserialize(serialize(r))!;
    expect(back.hazards).toEqual(r.hazards);
  });
});

describe('Mimik', () => {
  it('kommt ab Ebene 2 vor und sieht aus wie eine Truhe', () => {
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) n += toFloor(seed, 3).tiles.filter(t => t === T.MIMIC).length;
    expect(n).toBeGreaterThan(5);
    for (let seed = 1; seed <= 50; seed++) expect(newRun(seed, 'krieger', defaultMeta()).tiles.includes(T.MIMIC)).toBe(false);
  });

  it('Anstoßen: aus der Truhe wird ein Mimik, der sofort zubeißt – aber nur einmal in diesem Zug', () => {
    const r = hall();
    r.tiles[6 * W + 31] = T.MIMIC;
    const hp = r.p.hp;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.tiles[6 * W + 31]).toBe(T.FLOOR);
    const m = r.mobs.find(o => o.kind === 'mimik')!;
    expect(m).toBeDefined();
    expect(m.awake).toBe(true);
    const lost = hp - r.p.hp;
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(m.atk); // ein Biss, nicht zwei
  });

  it('Bombe deckt ihn ohne Biss auf; besiegt gibt er Truhenbeute und Gold', () => {
    const r = hall();
    r.tiles[6 * W + 33] = T.MIMIC;
    const hp = r.p.hp;
    explode(r, 33, 6, 1);
    const m = r.mobs.find(o => o.kind === 'mimik')!;
    expect(m).toBeDefined();
    expect(m.hp).toBeLessThan(m.maxHp);
    expect(r.p.hp).toBe(hp);
    const gold = r.p.gold, bag = r.p.bag.length + r.p.gear.filter(Boolean).length, pot = r.p.potions, bombs = r.p.bombs;
    m.hp = 1; m.x = 31; m.y = 6;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.mobs.includes(m)).toBe(false);
    expect(r.tele?.mimicKilled).toBe(1);
    expect(r.p.gold).toBeGreaterThan(gold);
    const got = r.p.bag.length + r.p.gear.filter(Boolean).length - bag + r.p.potions - pot + r.p.bombs - bombs;
    expect(got + (r.p.gold - gold)).toBeGreaterThan(0);
  });
});

describe('Schalter', () => {
  it('ausgeschaltet: keine Fallen, keine Mimiks', () => {
    FEATURES.hazards = false; FEATURES.mimics = false;
    try {
      for (let seed = 1; seed <= 40; seed++) {
        const r = toFloor(seed, 3);
        expect(r.hazards).toEqual([]);
        expect(r.tiles.includes(T.MIMIC)).toBe(false);
      }
    } finally { FEATURES.hazards = true; FEATURES.mimics = true; }
  });
});
