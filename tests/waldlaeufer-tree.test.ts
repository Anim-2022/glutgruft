// Fertigkeitsbaum des Waldläufers (Schritt 2d)
import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, skillCost, maxTraps, shotRange, Run, Actor } from '../src/game/run';
import { W, H, T, computeFov } from '../src/game/dungeon';
import { MOBS, treeNodes, treePool, NODE_TEXT, NEW_SKILLS } from '../src/game/content';
const GERMAN = /[äöüÄÖÜß]/;

function arena(meta = defaultMeta()): Run {
  const r = newRun(77, 'waldlaeufer', meta);
  r.floor = 3; r.mobs = []; r.puzzle = null; r.fire.clear(); r.traps = []; r.mode = 'play';
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 3; y < 10; y++) for (let x = 2; x < 60; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 30; r.p.y = 6; r.p.res = 0; r.p.resMax = 30; r.p.dir = [-1, 0];
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function mob(r: Run, kind: string, x: number, y: number, hp?: number): Actor {
  const d = MOBS[kind];
  const m: Actor = { id: r.nextId++, kind, name: d.name, x, y, hp: hp ?? d.hp, maxHp: d.hp, atk: d.atk, def: d.def, st: {}, xp: d.xp, cd: 0, awake: true, boss: d.boss };
  r.mobs.push(m);
  return m;
}
const learn = (r: Run, ...ids: string[]) => { for (const id of ids) { if (treeNodes('waldlaeufer').find(n => n.id === id)?.bundled) { expect(r.p.tree, id).toContain(id); continue; } r.p.pts = 1; r.mode = 'tree'; if (!r.pool.includes(id)) r.pool.push(id); act(r, { t: 'learn', id }); expect(r.p.tree, id).toContain(id); } };
const allPaid = () => ({ ...defaultMeta(), tree: { magier: [], krieger: [], waldlaeufer: treeNodes('waldlaeufer').filter(n => n.cost).map(n => n.id) } });

describe('Waldläufer-Baum', () => {
  it('Aufbau: 3 Zweige × 7 Knoten, Lager 1440 Splitter', () => {
    const t = treeNodes('waldlaeufer');
    expect(t.length).toBe(21);
    expect(t.reduce((s, n) => s + n.cost, 0)).toBe(1440);
    expect(treePool('waldlaeufer', defaultMeta()).length).toBe(12);
    expect(t.filter(n => n.spell).map(n => n.spell)).toEqual(['markieren', 'fangnetz', 'rauchbombe']);
  });

  it('Markieren: +30 % Schaden, Tod gibt 2 Fokus', () => {
    const r = arena(allPaid());
    learn(r, 'n0_1', 'n0_3');
    const m = mob(r, 'golem', 34, 6); m.st.stun = 9;
    r.p.res = 2;
    act(r, { t: 'skill', i: 3 });
    expect(m.st.mark).toBeGreaterThan(0);
    expect(r.p.res).toBe(0);
    m.hp = 1; r.p.res = 0;
    act(r, { t: 'shoot' });
    expect(r.mobs).not.toContain(m);
    expect(r.p.res).toBeGreaterThanOrEqual(2);
  });

  it('Fangnetz: das Ziel bleibt stehen', () => {
    const r = arena(allPaid());
    learn(r, 'n1_1', 'n1_3');
    const m = mob(r, 'skelett', 33, 6);
    r.p.res = 3;
    act(r, { t: 'skill', i: 3 });
    expect(m.x).toBe(33);
    act(r, { t: 'wait' });
    expect(m.x).toBe(33);
  });

  it('Rauchbombe: Schützen schießen nicht in den Rauch', () => {
    const r = arena(allPaid());
    learn(r, 'n2_1', 'n2_3');
    const s = mob(r, 'schuetze', 34, 6); s.st.netz = 9; // bleibt stehen
    r.p.res = 3;
    const hp = r.p.hp;
    act(r, { t: 'skill', i: 3 });
    act(r, { t: 'wait' });
    expect(r.p.hp).toBe(hp);
  });

  it('Fallensteller: Werkzeuggürtel, Minenfeld, Stacheldraht', () => {
    const r = arena(allPaid());
    learn(r, 'n1_1');
    expect(maxTraps(r.p)).toBe(3);
    learn(r, 'n1_2b', 'n1_4a', 'n1_5');
    expect(maxTraps(r.p)).toBe(5);
    expect(skillCost(r.p, 1)).toBe(0);
    // Rolle hinterlässt eine Falle am Startfeld
    r.p.res = 5;
    act(r, { t: 'skill', i: 2 });
    expect(r.traps).toContainEqual({ x: 30, y: 6 });
    // Stacheldraht: Falle vergiftet
    const m = mob(r, 'golem', 31, 6);
    m.x = 32; act(r, { t: 'wait' });
    const m2 = mob(r, 'skelett', 31, 7);
    r.traps.push({ x: 30, y: 7 });
    act(r, { t: 'wait' });
    expect(m2.st.gift ?? m.st.gift).toBeGreaterThan(0);
  });

  it('Anlegen: Warten lädt den Schuss, Schritt setzt zurück, Reichweite +2', () => {
    const r = arena(allPaid());
    const base = shotRange(r.p);
    learn(r, 'n0_1', 'n0_2b', 'n0_4a', 'n0_5');
    expect(shotRange(r.p)).toBe(base + 2);
    mob(r, 'golem', 36, 6).st.stun = 9;
    act(r, { t: 'wait' }); act(r, { t: 'wait' });
    expect(r.p.st.aim).toBe(2);
    act(r, { t: 'move', dx: 0, dy: 1 });
    expect(r.p.st.aim).toBeUndefined();
    act(r, { t: 'wait' });
    act(r, { t: 'shoot' });
    expect(r.p.st.aim).toBeUndefined();
  });

  it('Pirscher: Rückzugsgefecht schießt beim Wegtreten, Schattenschritt und Leichtfuß', () => {
    const r = arena(allPaid());
    learn(r, 'n2_1', 'n2_2b', 'n2_4a', 'n2_5');
    const m = mob(r, 'golem', 31, 6); m.st.stun = 9;
    act(r, { t: 'move', dx: -1, dy: 0 });
    expect(m.hp).toBeLessThan(m.maxHp);
    // Rolle vom Nachbarn weg: Schattenschritt geladen, 1 Fokus zurück
    m.x = 30; r.p.dir = [-1, 0]; r.p.res = 5;
    act(r, { t: 'skill', i: 2 });
    expect(r.p.st.schatten).toBe(1);
    expect(r.p.res).toBe(5 - 2 + 1);
  });

  it('Texte: Deutsch und Englisch', () => {
    for (const [name, desc] of Object.values(NODE_TEXT.waldlaeufer!)) { expect(name).not.toMatch(GERMAN); expect(desc).not.toMatch(GERMAN); }
    for (const id of ['markieren', 'fangnetz', 'rauchbombe']) expect(NEW_SKILLS[id].desc).not.toMatch(GERMAN);
  });
});
