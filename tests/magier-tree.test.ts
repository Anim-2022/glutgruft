// Fertigkeitsbaum des Magiers (Schritt 2b)
import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, availableNodes, Run, Actor, skillCost } from '../src/game/run';
import { W, H, T, computeFov } from '../src/game/dungeon';
import { MOBS, treeNodes, treePool, NODE_TEXT, NEW_SKILLS, TUNE } from '../src/game/content';
import { tr, setLang } from '../src/core/i18n';

function arena(meta = defaultMeta()): Run {
  const r = newRun(77, 'magier', meta);
  r.floor = 3; r.mobs = []; r.puzzle = null; r.fire.clear(); r.traps = []; r.mode = 'play';
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 3; y < 10; y++) for (let x = 2; x < 60; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 30; r.p.y = 6; r.p.res = r.p.resMax = 30;
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function mob(r: Run, kind: string, x: number, y: number): Actor {
  const d = MOBS[kind];
  const m: Actor = { id: r.nextId++, kind, name: d.name, x, y, hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def, st: {}, xp: d.xp, cd: 0, awake: true, boss: d.boss };
  r.mobs.push(m);
  return m;
}
const learn = (r: Run, ...ids: string[]) => { for (const id of ids) { if (treeNodes('magier').find(n => n.id === id)?.bundled) { expect(r.p.tree, id).toContain(id); continue; } r.p.pts = 1; r.mode = 'tree'; if (!r.pool.includes(id)) r.pool.push(id); act(r, { t: 'learn', id }); expect(r.p.tree, id).toContain(id); } };
const allPaid = () => ({ ...defaultMeta(), tree: { krieger: [], waldlaeufer: [], magier: treeNodes('magier').filter(n => n.cost).map(n => n.id) } });

describe('Magier-Baum', () => {
  it('Aufbau: 3 Zweige × 7 Knoten, frei T1/T2a/T4a/T4b, Lager 720 Splitter', () => {
    const t = treeNodes('magier');
    expect(t.length).toBe(21);
    expect(t.filter(n => !n.cost).map(n => n.tier).sort()).toEqual(['1', '1', '1', '2a', '2a', '2a', '4a', '4a', '4a', '4b', '4b', '4b']);
    expect(t.reduce((s, n) => s + n.cost, 0)).toBe(720);
    expect(treePool('magier', defaultMeta()).length).toBe(12);
    expect(treePool('magier', allPaid()).length).toBe(21);
    // Krieger voll (2c), Waldläufer unverändert
    expect(treeNodes('krieger').length).toBe(21);
    expect(treeNodes('waldlaeufer').length).toBe(9);
  });

  it('T1 bringt T2a mit; Rang III braucht 2 Knoten im Zweig, der Schlüsselknoten Rang III und 4', () => {
    const r = arena(allPaid());
    expect(availableNodes(r)).not.toContain('n0_2a');
    r.p.pts = 1; r.mode = 'tree';
    act(r, { t: 'learn', id: 'n0_1' });
    expect(r.p.tree).toEqual(['n0_1', 'n0_2a']);
    expect(r.p.pts).toBe(0);
    expect(availableNodes(r)).not.toContain('n0_2a');
    expect(availableNodes(r)).toContain('n0_4a');
    learn(r, 'n0_2b');
    expect(availableNodes(r)).not.toContain('n0_5'); // noch kein Rang III
    learn(r, 'n0_4a');
    expect(availableNodes(r)).toContain('n0_5');
  });

  it('Flammenwand liegt auf Platz 4 und setzt drei Felder in Brand', () => {
    const r = arena(allPaid());
    learn(r, 'n0_1', 'n0_3');
    expect(r.p.spells).toEqual(['flammenwand']);
    mob(r, 'skelett', 35, 6);
    const res = r.p.res;
    act(r, { t: 'skill', i: 3 });
    expect(r.p.res).toBeLessThanOrEqual(res - NEW_SKILLS.flammenwand.cost + 1);
    expect([...r.fire.keys()].filter(i => (i % W) === 32).length).toBe(3);
  });

  it('Eislanze durchbohrt und trifft Betäubte doppelt, die Betäubung endet', () => {
    const a = arena(allPaid()); learn(a, 'n1_1', 'n1_3');
    const g1 = mob(a, 'golem', 33, 6); g1.hp = g1.maxHp = 200;
    act(a, { t: 'skill', i: 3 });
    const plain = 200 - g1.hp;
    const b = arena(allPaid()); learn(b, 'n1_1', 'n1_3');
    const g2 = mob(b, 'golem', 33, 6); g2.hp = g2.maxHp = 200; g2.st.stun = 3;
    const behind = mob(b, 'golem', 35, 6); behind.hp = behind.maxHp = 200;
    act(b, { t: 'skill', i: 3 });
    expect(200 - g2.hp).toBeGreaterThan(plain * 1.5);
    expect(g2.st.stun).toBeUndefined();
    expect(behind.hp).toBeLessThan(200);
  });

  it('Arkanschild fängt Schaden ab', () => {
    const r = arena(allPaid()); learn(r, 'n2_1', 'n2_3');
    act(r, { t: 'skill', i: 3 });
    expect(r.p.shield).toBe(8 + r.p.lvl);
    const hp = r.p.hp;
    const s = mob(r, 'skelett', 31, 6);
    for (let k = 0; k < 2; k++) act(r, { t: 'wait' });
    expect(r.p.hp).toBe(hp);
    expect(r.p.shield).toBeLessThan(8 + r.p.lvl);
    void s;
  });

  it('Kryomant: langsamere Mana-Erholung, Mana je Treffer gegen Bosse und Betäubte', () => {
    const r = arena(allPaid()); learn(r, 'n1_1', 'n1_2a', 'n1_4a', 'n1_2b', 'n1_5');
    r.p.res = 5;
    const t0 = r.turn;
    for (let k = 0; k < 30; k++) act(r, { t: 'wait' });
    const per = Math.round(3 / TUNE.kryoRegen), gained = Math.floor((r.turn) / per) - Math.floor(t0 / per);
    expect(r.p.res).toBe(5 + gained);
    expect(gained).toBeLessThan(10); // weniger als die üblichen 10 in 30 Zügen
    r.p.res = 5;
    const b = mob(r, 'koenig', 33, 6); b.hp = b.maxHp = 999;
    act(r, { t: 'shoot' });
    expect(r.p.res).toBe(5 + TUNE.kryoMana);
  });

  it('Zeitriss: Blinzeln kostet keinen Zug, nie zwei Aktionen hintereinander ohne Gegnerzug', () => {
    const r = arena(allPaid()); learn(r, 'n2_1', 'n2_2a', 'n2_4b', 'n2_2b', 'n2_5');
    mob(r, 'skelett', 31, 6); mob(r, 'ratte', 40, 6);
    let freeStreak = 0, maxStreak = 0;
    for (let k = 0; k < 60 && r.mode === 'play'; k++) {
      const t0 = r.turn, pos = `${r.p.x},${r.p.y}`, res = r.p.res;
      r.p.hp = r.p.maxHp;
      act(r, k % 2 ? { t: 'skill', i: 2 } : { t: 'shoot' });
      const acted = `${r.p.x},${r.p.y}` !== pos || r.p.res !== res;
      if (acted && r.turn === t0) maxStreak = Math.max(maxStreak, ++freeStreak);
      else if (r.turn > t0) freeStreak = 0;
    }
    expect(maxStreak).toBe(1);
    const t0 = r.turn;
    r.p.st.riss = 0; r.p.res = 30;
    act(r, { t: 'skill', i: 2 });
    expect(r.turn).toBe(t0);
    expect(r.p.st.riss).toBe(3);
  });

  it('Flächenbrand: brennender Gegner explodiert und steckt den Nachbarn an', () => {
    const r = arena(allPaid()); learn(r, 'n0_1', 'n0_2a', 'n0_4a', 'n0_2b', 'n0_5');
    const a = mob(r, 'ratte', 33, 6), b = mob(r, 'golem', 34, 6);
    b.hp = b.maxHp = 200; a.hp = 1; a.st.brand = 2;
    act(r, { t: 'shoot' });
    expect(r.mobs.includes(a)).toBe(false);
    expect(b.hp).toBeLessThan(200);
    expect(b.st.brand).toBeGreaterThan(0);
  });

  it('Schutzrune: einmal je Ebene unter 30 % Leben weg', () => {
    const r = arena(allPaid()); learn(r, 'n2_1', 'n2_2b');
    const s = mob(r, 'golem', 31, 6); s.atk = 1;
    r.p.hp = Math.floor(r.p.maxHp * 0.3) + 1;
    act(r, { t: 'wait' }); act(r, { t: 'wait' });
    expect(r.runeUsed).toBe(true);
    expect(Math.max(Math.abs(r.p.x - s.x), Math.abs(r.p.y - s.y))).toBeGreaterThan(1);
  });

  it('Nachhall, Raureif, Eisrüstung, Schwelbrand', () => {
    const r = arena(allPaid()); learn(r, 'n2_1', 'n2_2a');
    mob(r, 'golem', 31, 6).hp = 999;
    const full = skillCost(r.p, 0);
    act(r, { t: 'skill', i: 2 });
    expect(skillCost(r.p, 0)).toBe(full - 2);
    const e = arena(allPaid()); learn(e, 'n1_1', 'n1_2b');
    mob(e, 'golem', 31, 6).hp = 999;
    act(e, { t: 'skill', i: 1 });
    expect(e.p.st.eis).toBeGreaterThan(0);
    const f = arena(allPaid()); learn(f, 'n0_1', 'n0_2b');
    const g = mob(f, 'golem', 34, 6); g.hp = 999;
    act(f, { t: 'skill', i: 0 });
    expect(g.st.brand).toBeGreaterThanOrEqual(2); // 3 gesetzt, 1 schon abgebrannt
    const rr = (stunned: boolean, rime: boolean) => {
      const z = arena(allPaid()); if (rime) learn(z, 'n1_1', 'n1_2a');
      const m = mob(z, 'golem', 33, 6); m.hp = m.maxHp = 999; m.def = 0; if (stunned) m.st.stun = 5;
      z.p.crit = 0; act(z, { t: 'shoot' }); return 999 - m.hp;
    };
    expect(rr(true, true)).toBeGreaterThan(rr(true, false));
  });

  it('alle neuen Texte haben eine englische Fassung', () => {
    setLang('en');
    const all = [...Object.values(NODE_TEXT.magier!).flat(), ...Object.values(NEW_SKILLS).flatMap(s => [s.name, s.desc])];
    const same = all.filter(s => tr(s) === s);
    setLang('de');
    expect(same).toEqual([]);
  });
});
