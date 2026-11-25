import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { defaultMeta } from '../src/core/save';
import { W, H, T, genDungeon, distMap, center, los, walkable } from '../src/game/dungeon';
import { newRun, act, serialize, deserialize, Action } from '../src/game/run';
import { CLASS_ORDER } from '../src/game/content';

describe('rng', () => {
  it('ist deterministisch', () => {
    const a = new RNG(42), b = new RNG(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
});

describe('dungeon', () => {
  it('alle Räume sind vom Start erreichbar', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { tiles, rooms } = genDungeon(new RNG(seed), seed % 3);
      expect(rooms.length).toBeGreaterThanOrEqual(6);
      const [sx, sy] = center(rooms[0]);
      const d = distMap(tiles, sx, sy);
      for (const r of rooms) { const [x, y] = center(r); expect(d[y * W + x]).toBeGreaterThanOrEqual(0); }
    }
  });
  it('Wände blockieren die Sicht', () => {
    const tiles = new Uint8Array(W * H).fill(T.FLOOR);
    tiles[5 * W + 5] = T.WALL;
    expect(los(tiles, 3, 5, 7, 5)).toBe(false);
    expect(los(tiles, 3, 4, 7, 4)).toBe(true);
    expect(los(tiles, 3, 5, 5, 5)).toBe(true);
  });
});

describe('run', () => {
  it('Truhen und Altäre versperren nie den Weg zur Treppe', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const run = newRun(seed, 'krieger', defaultMeta());
      const d = distMap(run.tiles, run.p.x, run.p.y);
      const stairs = run.tiles.indexOf(T.STAIRS);
      expect(stairs).toBeGreaterThanOrEqual(0);
      expect(d[stairs]).toBeGreaterThan(0);
      for (const m of run.mobs) expect(d[m.y * W + m.x]).toBeGreaterThanOrEqual(0);
    }
  });

  it('Objekte stehen nie in einem Durchgang', () => {
    const block = new Set<number>([T.CHEST, T.CURSED, T.ALTAR, T.BARREL, T.PILLAR, T.TRADER, T.FOUNTAIN, T.TABLET]);
    for (let seed = 1; seed <= 120; seed++) {
      const run = newRun(seed, 'krieger', defaultMeta());
      if (seed % 3) { run.floor = 5 + (seed % 9); run.tiles[run.p.y * W + run.p.x] = T.STAIRS; act(run, { t: 'descend' }); }
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (!block.has(run.tiles[y * W + x])) continue;
        const open = (ox: number, oy: number) => walkable(run.tiles[(y + oy) * W + x + ox]);
        // weder waagrecht noch senkrecht zwischen zwei Wänden eingeklemmt, wenn es dort durchgeht
        const wall = (ox: number, oy: number) => run.tiles[(y + oy) * W + x + ox] === T.WALL;
        const corridorH = open(-1, 0) && open(1, 0) && wall(0, -1) && wall(0, 1);
        const corridorV = open(0, -1) && open(0, 1) && wall(-1, 0) && wall(1, 0);
        // Kammern hinter Gitter/Riss sind absichtlich eng; dort stehen Truhen an der Wand, nie im Gang
        expect(corridorH || corridorV, `Seed ${seed} Feld ${x},${y} Typ ${run.tiles[y * W + x]}`).toBe(false);
      }
    }
  });

  it('gleicher Seed ergibt gleichen Verlauf', () => {
    const play = () => {
      const run = newRun(7, 'magier', defaultMeta());
      const r = new RNG(1);
      for (let i = 0; i < 300; i++) act(run, randomAction(r));
      return [run.p.x, run.p.y, run.p.hp, run.floor, run.kills, run.turn];
    };
    expect(play()).toEqual(play());
  });

  it('ein gespeicherter Lauf geht exakt gleich weiter', () => {
    const a = newRun(11, 'waldlaeufer', defaultMeta());
    const r1 = new RNG(3);
    for (let i = 0; i < 200; i++) act(a, randomAction(r1));
    const b = deserialize(serialize(a))!;
    expect(b).not.toBeNull();
    const r2 = new RNG(9), r3 = new RNG(9);
    for (let i = 0; i < 300; i++) { act(a, randomAction(r2)); act(b, randomAction(r3)); }
    a.fx = []; b.fx = [];
    expect(serialize(b)).toBe(serialize(a));
  });

  it('zufällige Aktionen brechen keine Invarianten', () => {
    for (const cls of CLASS_ORDER) for (let seed = 1; seed <= 8; seed++) {
      const run = newRun(seed, cls, defaultMeta());
      const r = new RNG(seed * 31);
      for (let i = 0; i < 1500 && run.mode !== 'dead' && run.mode !== 'win'; i++) {
        act(run, randomAction(r));
        const p = run.p;
        expect(p.hp).toBeLessThanOrEqual(p.maxHp);
        expect(p.res).toBeGreaterThanOrEqual(0);
        expect(p.res).toBeLessThanOrEqual(p.resMax);
        expect(walkable(run.tiles[p.y * W + p.x]) || run.tiles[p.y * W + p.x] === T.ICE).toBe(true);
        const seen = new Set<number>([p.y * W + p.x]);
        for (const m of run.mobs) {
          expect(m.hp).toBeGreaterThan(0);
          expect(walkable(run.tiles[m.y * W + m.x])).toBe(true);
          const k = m.y * W + m.x;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      }
    }
  });
});

function randomAction(r: RNG): Action {
  const n = r.int(0, 20);
  if (n < 8) { const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][n % 4]; return { t: 'move', dx: d[0], dy: d[1] }; }
  if (n === 8) return { t: 'wait' };
  if (n === 9) return { t: 'shoot' };
  if (n === 10) return { t: 'potion' };
  if (n === 11) return { t: 'descend' };
  if (n === 12) return { t: 'skill', i: r.int(0, 2) };
  if (n === 13) return r.chance(0.3) ? { t: 'ult' } : { t: 'bomb' };
  if (n === 14) return { t: 'buy', i: r.int(0, 3) };
  if (n === 17) return { t: 'equip', i: r.int(0, 5) };
  if (n === 18) return { t: 'unequip', slot: r.int(0, 3) };
  if (n === 19) return { t: 'sell', i: r.int(0, 3) };
  if (n === 15) return [{ t: 'leave' } as Action, { t: 'use', id: ['karte', 'sprung', 'kraft', 'quell'][r.int(0, 3)] } as Action, { t: 'drop', i: r.int(0, 3) } as Action, { t: 'sort' } as Action][r.int(0, 3)];
  if (n === 16) return { t: 'target', x: r.int(0, W - 1), y: r.int(0, H - 1) };
  return { t: 'perk', i: r.int(0, 2) };
}

import { SPR, PAL } from '../src/render/sprites';

describe('sprites', () => {
  it('sind rechteckig, quadratisch und nutzen nur Palettenfarben', () => {
    for (const [name, rows] of Object.entries(SPR)) {
      for (const [i, row] of rows.entries()) {
        expect(row.length, `${name} Zeile ${i}`).toBe(rows[0].length);
        for (const ch of row) expect(ch === '.' || ch in PAL, `${name} Zeichen ${ch}`).toBe(true);
      }
    }
  });
});

import { VIEWS } from '../src/render/sprites';

describe('Blickrichtungen', () => {
  it('haben dieselbe Größe wie die Vorderansicht', () => {
    for (const [name, v] of Object.entries(VIEWS)) {
      for (const [key, rows] of Object.entries(v)) {
        expect(rows.length, `${name}.${key}`).toBe(SPR[name].length);
        rows.forEach((r, i) => {
          expect(r.length, `${name}.${key} Zeile ${i}`).toBe(SPR[name][0].length);
          for (const ch of r) expect(ch === '.' || ch in PAL, `${name}.${key} Zeichen ${ch}`).toBe(true);
        });
      }
    }
  });
});

import { PERKS, RELICS, UPGRADES, CONSUMABLES, UNIQUES, ULT, SKILL_UP, SYNERGIES, AFFIX } from '../src/game/content';
import { WEAPON_ART } from '../src/render/sprites';
import { genItem, itemLines } from '../src/game/run';
const GERMAN = /[äöüÄÖÜß]/;

describe('Gegenstände und Ausbau', () => {
  it('Anlegen und Ablegen lässt die Werte unverändert zurück', () => {
    for (const cls of CLASS_ORDER) {
      const run = newRun(3, cls, defaultMeta());
      const p = run.p, snap = () => JSON.stringify([p.atk, p.def, p.maxHp, Math.round(p.crit * 1000), p.vamp, p.thorns, p.resMax, Math.round(p.pow * 1000), Object.entries(p.aff).filter(([, v]) => Math.abs(v) > 1e-9).sort()]);
      const before = snap();
      for (let k = 0; k < 300; k++) {
        run.floor = 1 + (k % 15);
        const it = genItem(run, k % 9 === 0);
        expect(itemLines(it).length, it.name).toBeGreaterThan(0);
        for (const [id] of it.aff ?? []) expect(AFFIX[id], id).toBeTypeOf('function');
        p.bag = [it];
        act(run, { t: 'equip', i: 0 });
        expect(p.gear[it.slot]).toBe(it);
        if (it.cursed) run.floor++; // der Fluch löst sich erst auf der nächsten Ebene
        act(run, { t: 'unequip', slot: it.slot });
        p.bag = [];
        p.hp = p.maxHp;
      }
      expect(snap()).toBe(before);
    }
  });

  it('all new texts are English', () => {
    const all: string[] = [];
    for (const t of [PERKS, RELICS, CONSUMABLES, ULT]) for (const d of Object.values(t)) all.push(d.name, d.desc);
    for (const u of UPGRADES) all.push(u.name, u.desc);
    for (const u of UNIQUES) all.push(u.name);
    for (const v of Object.values(SKILL_UP)) all.push(v.r2, ...v.a, ...v.b);
    for (const v of SYNERGIES) all.push(v.name, v.desc);
    for (const f of Object.values(AFFIX)) all.push(f(7));
    const same = all.filter(s => GERMAN.test(s));
    expect(same).toEqual([]);
  });
});

describe('Ausprägungen und Synergien', () => {
  it('eine Synergie wirkt genau einmal und übersteht das Speichern', () => {
    const run = newRun(5, 'krieger', defaultMeta());
    const take = (id: string) => { run.perkChoices = [id]; run.mode = 'perk'; act(run, { t: 'perk', i: 0 }); };
    const vamp = run.p.vamp;
    take('vampir'); take('henker'); take('henker');
    expect(run.p.syn).toEqual(['rausch']);
    expect(run.p.vamp).toBe(vamp + 2 + 3);
    const back = deserialize(serialize(run))!;
    expect(back.p.syn).toEqual(['rausch']);
    expect(back.p.vamp).toBe(run.p.vamp);
  });

  it('Rang III verlangt die Wahl einer Ausprägung', () => {
    const run = newRun(5, 'magier', defaultMeta());
    const take = (id: string) => { run.perkChoices = [id]; run.mode = 'perk'; act(run, { t: 'perk', i: 0 }); };
    take('skill0');
    expect(run.p.skillLvl[0]).toBe(1);
    expect(run.p.skillMod[0]).toBe(0);
    take('skill0b');
    expect(run.p.skillLvl[0]).toBe(2);
    expect(run.p.skillMod[0]).toBe(2);
  });

  it('Waffenbilder bleiben im Raster und in der Palette', () => {
    for (const [cls, art] of Object.entries(WEAPON_ART)) {
      const views: Record<string, string[]> = { f: SPR[cls], b: VIEWS[cls].b, s: VIEWS[cls].s };
      for (const kind of art.kinds) for (const [v, patches] of Object.entries(kind ?? {})) for (const [y, x, str] of patches) {
        expect(y >= 0 && y < views[v].length && x >= 0 && x + str.length <= views[v][0].length, `${cls} ${v} ${y},${x}`).toBe(true);
        for (const ch of str) expect(ch in PAL, `${cls} ${ch}`).toBe(true);
      }
    }
  });
});
