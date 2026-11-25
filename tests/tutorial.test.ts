// Lehrgang: Schritte, Karten, Speicherstand, Übersetzung
import { describe, it, expect } from 'vitest';
import { defaultMeta, parseMeta } from '../src/core/save';
import { newRun, act, serialize, Run, Actor } from '../src/game/run';
import { W, H, T, computeFov } from '../src/game/dungeon';
import { MOBS } from '../src/game/content';
import { STEPS, CARDS, snap, stepsDone, currentStep, runCard, resetMoves } from '../src/game/tutorial';
const GERMAN = /[äöüÄÖÜß]/;

function arena(): Run {
  const r = newRun(5, 'krieger', defaultMeta());
  r.mobs = []; r.puzzle = null; r.fire.clear(); r.mode = 'play';
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 3; y < 10; y++) for (let x = 2; x < 60; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 30; r.p.y = 6;
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function mob(r: Run, kind: string, x: number, y: number): Actor {
  const d = MOBS[kind];
  const m: Actor = { id: r.nextId++, kind, name: d.name, x, y, hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def, st: {}, xp: d.xp, cd: 0, awake: true, boss: d.boss };
  r.mobs.push(m); computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return m;
}
const step = (done: string[], r: Run, a: Parameters<typeof act>[1]) => { const b = snap(r); act(r, a); for (const id of stepsDone(done, r, a, b)) if (!done.includes(id)) done.push(id); };

describe('Lehrgang', () => {
  it('Bewegen ist nach drei Schritten erledigt, dann wartet der Lehrgang auf passende Lagen', () => {
    resetMoves();
    const r = arena(), done: string[] = [];
    expect(currentStep(done, r)?.id).toBe('bewegen');
    for (let k = 0; k < 3; k++) step(done, r, { t: 'move', dx: 1, dy: 0 });
    expect(done).toEqual(['bewegen']);
    expect(currentStep(done, r)).toBeNull(); // kein Gegner, keine Truhe, keine Treppe
    mob(r, 'ratte', r.p.x + 3, r.p.y);
    expect(currentStep(done, r)?.id).toBe('angriff');
  });

  it('Angriff zählt beim ersten besiegten Gegner, Fähigkeit beim Einsatz', () => {
    resetMoves();
    const r = arena(), done = ['bewegen'];
    const m = mob(r, 'ratte', r.p.x + 1, r.p.y); m.hp = 1;
    step(done, r, { t: 'move', dx: 1, dy: 0 });
    expect(done).toContain('angriff');
    const s = mob(r, 'golem', r.p.x + 1, r.p.y); s.hp = 99; r.p.res = 10;
    step(done, r, { t: 'skill', i: 0 });
    expect(done).toContain('faehigkeit');
  });

  it('[T] überspringen: übersprungene Schritte kommen nicht wieder', () => {
    const r = arena(), done = ['bewegen'];
    mob(r, 'ratte', r.p.x + 3, r.p.y);
    const s = currentStep(done, r)!;
    done.push(s.id);
    expect(currentStep(done, r)?.id).not.toBe(s.id);
  });

  it('Karten: Gabe, Reliquie, Baum, Händler, Tod – jede nur einmal', () => {
    const r = arena();
    r.mode = 'perk'; r.perkChoices = ['zaeh', 'scharf'];
    expect(runCard([], r)?.id).toBe('gabe');
    expect(runCard(['gabe'], r)).toBeNull();
    r.perkChoices = ['glutherz', 'echo'];
    expect(runCard([], r)?.id).toBe('reliquie');
    r.mode = 'tree'; expect(runCard([], r)?.id).toBe('baum');
    r.mode = 'shop'; expect(runCard([], r)?.id).toBe('haendler');
    r.mode = 'dead'; expect(runCard([], r)?.id).toBe('tod');
    r.mode = 'play'; expect(runCard([], r)).toBeNull();
  });

  it('der Lehrgang verändert den Lauf nicht (kein Zufall, kein Zustand)', () => {
    const r = arena();
    mob(r, 'ratte', r.p.x + 3, r.p.y);
    const before = serialize(r);
    for (let k = 0; k < 5; k++) { currentStep([], r); runCard([], r); stepsDone([], r, { t: 'wait' }, snap(r)); }
    expect(serialize(r)).toBe(before);
  });

  it('Speicherstand: neue Spieler bekommen den Lehrgang, erfahrene nicht ungefragt', () => {
    expect(defaultMeta().tutOff).toBe(false);
    expect(defaultMeta().tut).toEqual([]);
    expect(parseMeta(JSON.stringify({ souls: 0, best: 0 })).tutOff).toBe(false);
    expect(parseMeta(JSON.stringify({ souls: 9, best: 6 })).tutOff).toBe(true);
    expect(parseMeta(JSON.stringify({ best: 6, tutOff: false, tut: ['gabe'] })).tut).toEqual(['gabe']);
  });

  it('all texts are English', () => {
    const r = arena();
    const all = [...STEPS.map(s => s.text(r)), ...Object.values(CARDS).flatMap(c => [c.title, ...c.lines])];
    const same = all.filter(s => GERMAN.test(s));
    expect(same).toEqual([]);
  });
});
