// Fertigkeitsbaum des Kriegers (Schritt 2c)
import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, availableNodes, skillReady, Run, Actor } from '../src/game/run';
import { W, H, T, computeFov } from '../src/game/dungeon';
import { MOBS, treeNodes, treePool, NODE_TEXT, NEW_SKILLS } from '../src/game/content';
import { tr, setLang } from '../src/core/i18n';

function arena(meta = defaultMeta()): Run {
  const r = newRun(77, 'krieger', meta);
  r.floor = 3; r.mobs = []; r.puzzle = null; r.fire.clear(); r.traps = []; r.mode = 'play';
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 3; y < 10; y++) for (let x = 2; x < 60; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 30; r.p.y = 6; r.p.res = 0; r.p.resMax = 30;
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function mob(r: Run, kind: string, x: number, y: number, hp?: number): Actor {
  const d = MOBS[kind];
  const m: Actor = { id: r.nextId++, kind, name: d.name, x, y, hp: hp ?? d.hp, maxHp: d.hp, atk: d.atk, def: d.def, st: {}, xp: d.xp, cd: 0, awake: true, boss: d.boss };
  r.mobs.push(m);
  return m;
}
const learn = (r: Run, ...ids: string[]) => { for (const id of ids) { if (treeNodes('krieger').find(n => n.id === id)?.bundled) { expect(r.p.tree, id).toContain(id); continue; } r.p.pts = 1; r.mode = 'tree'; if (!r.pool.includes(id)) r.pool.push(id); act(r, { t: 'learn', id }); expect(r.p.tree, id).toContain(id); } };
const allPaid = () => ({ ...defaultMeta(), tree: { magier: [], waldlaeufer: [], krieger: treeNodes('krieger').filter(n => n.cost).map(n => n.id) } });

describe('Krieger-Baum', () => {
  it('Aufbau: 3 Zweige × 7 Knoten, frei T1/T2a/T4a/T4b, Lager 720 Splitter', () => {
    const t = treeNodes('krieger');
    expect(t.length).toBe(21);
    expect(t.reduce((s, n) => s + n.cost, 0)).toBe(720);
    expect(treePool('krieger', defaultMeta()).length).toBe(12);
    expect(treePool('krieger', allPaid()).length).toBe(21);
    expect(t.filter(n => n.spell).map(n => n.spell)).toEqual(['schildwurf', 'sturmangriff', 'herausforderung']);
    const r = arena(allPaid());
    learn(r, 'n0_1');
    expect(r.p.tree).toEqual(['n0_1', 'n0_2a']);
    expect(availableNodes(r)).not.toContain('n0_5');
  });

  it('Schildwurf trifft auf 3 Felder', () => {
    const r = arena(allPaid());
    learn(r, 'n0_1', 'n0_3');
    expect(r.p.spells).toEqual(['schildwurf']);
    const m = mob(r, 'golem', 33, 6);
    r.p.res = 9;
    act(r, { t: 'skill', i: 3 });
    expect(r.p.res).toBe(2);
    expect(m.hp).toBeLessThan(m.maxHp);
  });

  it('Sturmangriff: bis neben das Ziel und Schlag; ohne Weg kein Sturm', () => {
    const r = arena(allPaid());
    learn(r, 'n1_1', 'n1_3');
    const m = mob(r, 'golem', 34, 6);
    r.p.res = 9;
    act(r, { t: 'skill', i: 3 });
    expect([r.p.x, r.p.y]).toEqual([33, 6]);
    expect(m.hp).toBeLessThan(m.maxHp);
    expect(r.p.res).toBe(2 + 1 + 1);  // + 1 Wut für den Nachbarn, + 1 für seinen Treffer
    // Weg versperrt: nichts passiert
    const r2 = arena(allPaid());
    learn(r2, 'n1_1', 'n1_3');
    mob(r2, 'golem', 34, 6); mob(r2, 'golem', 31, 6);
    r2.mobs[1].st.stun = 5; r2.target = r2.mobs[0].id;
    r2.p.res = 9;
    const t0 = r2.turn;
    act(r2, { t: 'skill', i: 3 });
    expect(r2.turn).toBe(t0);
    expect(r2.p.res).toBe(9);
  });

  it('Herausforderung: Schützen schießen nicht und kommen heran', () => {
    const r = arena(allPaid());
    learn(r, 'n2_1', 'n2_3');
    const s = mob(r, 'schuetze', 34, 6);
    r.p.res = 6;
    const hp = r.p.hp;
    act(r, { t: 'skill', i: 3 });
    expect(r.p.hp).toBe(hp);
    expect(s.x).toBe(33);
    expect(s.st.taunt).toBe(1);
    act(r, { t: 'wait' });
    expect(s.st.taunt ?? 0).toBe(0);
  });

  it('Schildwall: Warten im Kampf gibt Wut und Schutz', () => {
    const r = arena();
    learn(r, 'n0_1');
    mob(r, 'golem', 35, 6);
    act(r, { t: 'wait' });
    expect(r.p.res).toBeGreaterThanOrEqual(1);
  });

  it('Vergelter: keine Wut aus eigenen Schlägen, doppelt aus erlittenen; Schildstoß betäubt alle Nachbarn', () => {
    const r = arena(allPaid());
    learn(r, 'n0_1', 'n0_2b', 'n0_4a', 'n0_5');
    const a = mob(r, 'golem', 31, 6), b = mob(r, 'golem', 29, 6), c = mob(r, 'golem', 30, 5);
    r.p.res = 5; r.target = a.id;
    act(r, { t: 'skill', i: 0 });
    expect(a.st.stun).toBeGreaterThan(0);
    expect(b.st.stun).toBeGreaterThan(0);
    expect(c.st.stun).toBeGreaterThan(0);
    // eigener Schlag: keine Wut (nur +1 je Zug für Nachbarn)
    const r2 = arena(allPaid());
    learn(r2, 'n0_1', 'n0_2b', 'n0_4a', 'n0_5');
    const m = mob(r2, 'golem', 31, 6); m.st.stun = 5;
    act(r2, { t: 'move', dx: 1, dy: 0 });
    expect(r2.p.res).toBe(1);
  });

  it('Klingenrausch: ein Sieg gibt einen freien Zug, nicht zweimal hintereinander', () => {
    const r = arena(allPaid());
    learn(r, 'n1_1', 'n1_2b', 'n1_4a', 'n1_5');
    mob(r, 'ratte', 31, 6, 1); mob(r, 'ratte', 31, 7, 1); mob(r, 'golem', 40, 6);
    const t0 = r.turn;
    act(r, { t: 'move', dx: 1, dy: 0 });
    expect(r.turn).toBe(t0);
    act(r, { t: 'move', dx: 1, dy: 1 });
    expect(r.turn).toBe(t0 + 1);
  });

  it('Schwungkraft und Gezackte Klinge', () => {
    const r = arena(allPaid());
    learn(r, 'n1_1', 'n1_2b');
    const a = mob(r, 'golem', 31, 6), b = mob(r, 'golem', 29, 6);
    a.st.stun = b.st.stun = 5;
    r.p.res = 5;
    act(r, { t: 'skill', i: 1 });
    expect(r.p.res).toBe(2 + 1); // 5 − 5 + 2 Getroffene + 1 für Nachbarn am Zugende
    expect(a.st.gift).toBeGreaterThan(0);
  });

  it('Einschüchterung und Schmerzensgeld', () => {
    const r = arena(allPaid());
    learn(r, 'n2_1', 'n2_2b');
    const m = mob(r, 'skelett', 31, 6);
    r.p.res = 4;
    const hp = r.p.hp;
    act(r, { t: 'skill', i: 2 });
    expect(m.st.schwach).toBeGreaterThan(0);
    // Skelett (4 Angriff) − 1 Einschüchterung − 2 Verteidigung → 1
    expect(hp - r.p.hp).toBe(1);
    // Schmerzensgeld: Treffer + 1 Wut zusätzlich, plus 1 für den Nachbarn am Zugende
    expect(r.p.res).toBe(2 + 1);
  });

  it('Blutzorn: fehlende Wut kostet Leben, aber nie das letzte', () => {
    const r = arena(allPaid());
    learn(r, 'n2_1', 'n2_2b', 'n2_4b', 'n2_5');
    r.p.res = 1; r.p.hp = 30;
    expect(skillReady(r.p, 2)).toBe(true);
    act(r, { t: 'skill', i: 2 });
    expect(r.p.hp).toBe(24);
    expect(r.p.res).toBe(0);
    r.p.hp = 8; r.p.st = {};
    expect(skillReady(r.p, 2)).toBe(false);
  });

  it('Texte: Deutsch und Englisch', () => {
    setLang('en');
    for (const [name, desc] of Object.values(NODE_TEXT.krieger!)) { expect(tr(name), name).not.toBe(name); expect(tr(desc), desc).not.toBe(desc); }
    for (const id of ['schildwurf', 'sturmangriff', 'herausforderung']) expect(tr(NEW_SKILLS[id].desc)).not.toBe(NEW_SKILLS[id].desc);
    setLang('de');
  });
});
