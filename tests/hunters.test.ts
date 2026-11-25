import { describe, it, expect, afterEach } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, Run, Actor, serialize, deserialize, hunterWarn, inVault } from '../src/game/run';
import { W, H, T, computeFov, distMap } from '../src/game/dungeon';
import { FEATURES, HUNTER, MOBS } from '../src/game/content';

const F0 = { ...FEATURES };
afterEach(() => Object.assign(FEATURES, F0));

// Leerer Gang 3x58, Held in der Mitte, Ebene 5 Felder lang erkundet
function arena(floor = 4): Run {
  FEATURES.events = false;
  const r = newRun(77, 'krieger', defaultMeta());
  r.floor = floor; r.mobs = []; r.puzzle = null; r.fire.clear(); r.traps = []; r.hazards = []; r.evQ = []; r.ev = null;
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 5; y < 8; y++) for (let x = 2; x < 60; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 30; r.p.y = 6; r.p.hp = r.p.maxHp = 200;
  r.entry = [3, 6];
  r.hunt = { next: HUNTER.first, n: 0 }; r.floorTurns = 0;
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function put(r: Run, kind: string, x: number, y: number): Actor {
  const d = MOBS[kind];
  const m: Actor = { id: r.nextId++, kind, name: d.name, x, y, hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def, st: {}, xp: d.xp, cd: 0, awake: true };
  r.mobs.push(m);
  return m;
}
const hunters = (r: Run) => r.mobs.filter(m => MOBS[m.kind].hunter);

describe('Jäger', () => {
  it('ohne Jäger: kein Zähler, keine Jäger', () => {
    FEATURES.hunters = false;
    const r = newRun(5, 'magier', defaultMeta());
    for (let i = 0; i < 50; i++) act(r, { t: 'wait' });
    expect(r.floorTurns).toBeUndefined();
    expect(r.hunt).toBeUndefined();
  });

  it('der erste Jäger kommt genau nach HUNTER.first Zügen, am Eingang, erreichbar, nicht direkt neben dem Helden', () => {
    const r = arena();
    r.floorTurns = HUNTER.first - 2;
    act(r, { t: 'wait' });
    expect(hunters(r).length).toBe(0);
    r.fx = [];
    act(r, { t: 'wait' });
    const h = hunters(r);
    expect(h.length).toBe(1);
    expect(Math.max(Math.abs(h[0].x - r.p.x), Math.abs(h[0].y - r.p.y))).toBeGreaterThanOrEqual(4);
    expect(distMap(r.tiles, r.p.x, r.p.y)[h[0].y * W + h[0].x]).toBeGreaterThan(0);
    expect(r.fx.some(f => f.k === 'banner')).toBe(true);
    expect(r.hunt!.next).toBe(HUNTER.first + HUNTER.respawn); // with hunt pressure: re-armed each turn while it lives
  });

  it('nie mehr als HUNTER.cap zugleich; der Rest wartet, statt zu verfallen', () => {
    FEATURES.huntPressure = false; // legacy rules; with pressure Death ignores the cap (hunt-pressure.test.ts)
    const r = arena();
    FEATURES.hunterForce = 'echse';
    r.hunt!.next = 1;
    r.p.hp = r.p.maxHp = 100000;
    for (let i = 0; i < 400; i++) { act(r, { t: 'wait' }); for (const m of hunters(r)) { m.x = 2 + (m.id % 3); m.y = 5 + (m.id % 3); m.st.stun = 5; } }
    expect(hunters(r).length).toBeLessThanOrEqual(HUNTER.cap);
  });

  it('gefährliche Jäger erst in der Tiefe, darüber schwächer', () => {
    for (const [kind, from] of [['drache', 6], ['tod', 11], ['medusa', 4]] as [string, number][]) {
      FEATURES.hunterForce = kind;
      const r = arena(from - 1);
      r.floorTurns = HUNTER.first;
      act(r, { t: 'wait' });
      expect(hunters(r).length, kind).toBe(0);
      const r2 = arena(from);
      r2.floorTurns = HUNTER.first;
      act(r2, { t: 'wait' });
      expect(hunters(r2).length, kind).toBe(1);
    }
    FEATURES.hunterForce = 'echse';
    const lo = arena(2); lo.floorTurns = HUNTER.first; act(lo, { t: 'wait' });
    const hi = arena(6); hi.floorTurns = HUNTER.first; act(hi, { t: 'wait' });
    const a = hunters(lo)[0], b = hunters(hi)[0];
    expect(a.maxHp / (1 + 0.3 * 1)).toBeLessThan(b.maxHp / (1 + 0.3 * 5));
  });

  it('Jäger an oder aus: Ereignisse werden trotzdem geplant, auf Bossebenen keine', () => {
    for (const on of [false, true]) {
      FEATURES.hunters = on;
      const r = newRun(9, 'krieger', defaultMeta());
      expect(r.evQ!.length, `hunters ${on}`).toBeGreaterThan(0);
      while (r.floor < 5) { r.tiles[r.p.y * W + r.p.x] = T.STAIRS; r.mode = 'play'; act(r, { t: 'descend' }); }
      expect(r.evQ ?? [], `Boss, hunters ${on}`).toEqual([]);
    }
  });

  it('wer bleibt, wird härter gejagt: jeder weitere Jäger stärker, Abstände 30, 25, 20, 15, 15', () => {
    FEATURES.huntPressure = false; // legacy rules; pairs and Death are covered in hunt-pressure.test.ts
    FEATURES.hunterForce = 'echse';
    const r = arena(7);
    r.p.hp = r.p.maxHp = 100000;
    r.floorTurns = HUNTER.first - 1;
    const spawns: { t: number; hp: number; atk: number }[] = [];
    for (let i = 0; i < 140 && spawns.length < 5; i++) {
      const before = new Set(r.mobs.map(m => m.id));
      act(r, { t: 'wait' });
      for (const m of hunters(r)) if (!before.has(m.id)) spawns.push({ t: r.floorTurns!, hp: m.maxHp, atk: m.atk });
      // Jäger festhalten und vor der Obergrenze wegnehmen, damit nur der Takt gemessen wird
      for (const m of hunters(r)) { m.x = 2 + (m.id % 3); m.y = 5 + (m.id % 3); m.st.stun = 9; }
      if (hunters(r).length >= HUNTER.cap) r.mobs = r.mobs.filter(m => !MOBS[m.kind].hunter);
    }
    expect(spawns.length).toBe(5);
    const gaps = spawns.slice(1).map((s, i) => s.t - spawns[i].t);
    expect(gaps).toEqual([30, 25, 20, 15]);
    for (let i = 1; i < spawns.length; i++) {
      expect(spawns[i].hp).toBeGreaterThan(spawns[i - 1].hp);
      expect(spawns[i].atk).toBeGreaterThanOrEqual(spawns[i - 1].atk); // Angriff steigt jede zweite Stufe
    }
    expect(spawns[4].atk).toBeGreaterThan(spawns[2].atk);
    expect(spawns[2].atk).toBeGreaterThan(spawns[0].atk);
    expect(r.log.some(l => l.includes('stage 3'))).toBe(true);
  });

  it('neue Ebene: die Jagd beginnt wieder bei Stufe 1', () => {
    FEATURES.events = false;
    const r = newRun(4, 'krieger', defaultMeta());
    r.hunt!.n = 3;
    r.tiles[r.p.y * W + r.p.x] = T.STAIRS; act(r, { t: 'descend' });
    expect(r.hunt!.n).toBe(0);
    expect(r.hunt!.next).toBe(HUNTER.first);
  });

  it('keine Jäger auf Bossebenen', () => {
    FEATURES.events = false;
    const r = newRun(9, 'krieger', defaultMeta());
    while (r.floor < 5) { r.tiles[r.p.y * W + r.p.x] = T.STAIRS; r.mode = 'play'; act(r, { t: 'descend' }); }
    expect(r.hunt).toBeNull();
  });

  it('aufgeschoben in der Rätselkammer', () => {
    FEATURES.events = false;
    for (let seed = 1; seed < 400; seed++) {
      const r = newRun(seed, 'krieger', defaultMeta());
      const z = r.puzzle;
      if (!z || z.kind !== 'crates') continue;
      r.mobs = [];
      r.p.x = z.x + 3; r.p.y = z.y + 5;
      expect(inVault(r, r.p.x, r.p.y)).toBe(true);
      r.floorTurns = HUNTER.first + 5;
      act(r, { t: 'wait' });
      expect(hunters(r).length).toBe(0);
      return;
    }
    throw new Error('keine Crate chamber');
  });

  it('Riesenechse: in einem Zug laufen ODER beißen, nie beides', () => {
    const r = arena(), e = put(r, 'echse', 33, 6);
    e.cd = 99; // ohne Sprung
    const hp = r.p.hp;
    act(r, { t: 'wait' });
    expect(Math.abs(e.x - r.p.x) + Math.abs(e.y - r.p.y)).toBe(1); // zwei Schritte heran
    expect(r.p.hp).toBe(hp);                                         // aber noch kein Biss
    act(r, { t: 'wait' });
    expect(r.p.hp).toBeLessThan(hp);
  });

  it('Landkrake: Tentakel wird angekündigt, ein Schritt zur Seite weicht aus', () => {
    const r = arena(), k = put(r, 'krake', 33, 6);
    const hp = r.p.hp;
    act(r, { t: 'wait' });
    expect(hunterWarn(r)).toContain(r.p.y * W + r.p.x);
    expect(r.p.hp).toBe(hp);
    act(r, { t: 'move', dx: -1, dy: 0 }); // die Tentakelwand steht quer – zurück weicht aus
    expect(r.p.hp).toBe(hp);
    void k;
  });

  it('Drache: Feueratem nur nach Ankündigung', () => {
    const r = arena(), d = put(r, 'drache', 33, 6);
    const hp = r.p.hp;
    act(r, { t: 'wait' });
    expect(r.p.hp).toBe(hp);
    expect(hunterWarn(r)).toContain(r.p.y * W + r.p.x);
    act(r, { t: 'wait' });
    expect(r.p.hp).toBeLessThan(hp);
    void d;
  });

  it('Riesenechse: Sprung wird angekündigt; wer bleibt, wird getroffen und weggestoßen, zur Seite weicht aus', () => {
    let r = arena(), e = put(r, 'echse', 33, 6);
    const hp = r.p.hp;
    act(r, { t: 'wait' });
    expect(e.zk).toBe('leap');
    expect(hunterWarn(r)).toContain(r.p.y * W + r.p.x);
    act(r, { t: 'wait' });
    expect(r.p.hp).toBeLessThan(hp);
    expect(Math.abs(e.x - 30)).toBeLessThanOrEqual(1);
    r = arena(); e = put(r, 'echse', 33, 6);
    act(r, { t: 'wait' });
    act(r, { t: 'move', dx: 0, dy: 1 });
    expect(r.p.hp).toBe(hp);
  });

  it('Landkrake: Tentakeltreffer zieht heran und hält fest', () => {
    const r = arena(), k = put(r, 'krake', 34, 6);
    act(r, { t: 'wait' });
    expect(k.zk).toBe('tent');
    act(r, { t: 'wait' });
    expect(Math.abs(r.p.x - k.x) + Math.abs(r.p.y - k.y)).toBe(1);
    expect(r.p.st.netz).toBeGreaterThan(0);
  });

  it('Medusa: Blick entlang der Reihe versteinert, ein Schritt zur Seite rettet', () => {
    let r = arena(), m = put(r, 'medusa', 34, 6);
    act(r, { t: 'wait' });
    expect(m.zk).toBe('gaze');
    act(r, { t: 'wait' });
    expect(r.p.st.stein).toBeGreaterThan(0);
    expect(r.p.st.netz).toBeGreaterThan(0);
    r = arena(); m = put(r, 'medusa', 34, 6);
    act(r, { t: 'wait' });
    act(r, { t: 'move', dx: 0, dy: 1 });
    expect(r.p.st.stein).toBeUndefined();
  });

  it('Drache: Feuerregen auf Abstand, Kreuzform, orthogonal ausweichbar', () => {
    const r = arena(), d = put(r, 'drache', 36, 6);
    const hp = r.p.hp;
    act(r, { t: 'wait' });
    expect(d.zk).toBe('rain');
    act(r, { t: 'move', dx: 0, dy: 1 });
    expect(r.p.hp).toBe(hp);
  });

  it('Der Tod: Schattenschritt aus der Ferne direkt hinter den Helden', () => {
    const r = arena(), t = put(r, 'tod', 40, 6);
    act(r, { t: 'wait' });
    expect(Math.abs(t.x - r.p.x) + Math.abs(t.y - r.p.y)).toBe(1);
  });

  it('Raserei unter 40 % Leben: einmalig mehr Angriff', () => {
    const r = arena(), e = put(r, 'echse', 31, 6);
    e.cd = 99; const atk = e.atk;
    e.hp = Math.floor(e.maxHp * 0.3);
    act(r, { t: 'wait' });
    expect(e.st.rage).toBe(1);
    expect(e.atk).toBe(atk + HUNTER.rageAtk);
    act(r, { t: 'wait' });
    expect(e.atk).toBe(atk + HUNTER.rageAtk);
  });

  it('Medusa: höchstens eine Schlange je Zug und vier zugleich', () => {
    const r = arena(), m = put(r, 'medusa', 31, 6);
    m.hp = m.maxHp = 10000; m.atk = 0;
    for (let k = 0; k < 10; k++) { act(r, { t: 'move', dx: 1, dy: 0 }); expect(r.mobs.filter(o => o.kind === 'schlange').length).toBeLessThanOrEqual(Math.min(4, k + 1)); for (const s of r.mobs) if (s.kind === 'schlange') s.st.stun = 9; }
    expect(r.mobs.filter(o => o.kind === 'schlange').length).toBe(4);
  });

  describe('Der Tod', () => {
    const tod = () => { const r = arena(), t = put(r, 'tod', 32, 6); t.atk = 0; return { r, t }; };
    it('holt nicht im Zug seines Erscheinens aus', () => {
      const { r, t } = tod();
      t.st.born = r.turn + 1; // erscheint in diesem Zug
      act(r, { t: 'wait' });
      expect(t.st.zt).toBeUndefined();
    });
    it('wer aus dem roten Feld tritt, überlebt; wer bleibt, stirbt', () => {
      let { r } = tod();
      act(r, { t: 'wait' });
      expect(hunterWarn(r)).toContain(r.p.y * W + r.p.x);
      act(r, { t: 'move', dx: 1, dy: 0 });
      expect(r.mode).toBe('play');
      ({ r } = tod());
      act(r, { t: 'wait' });
      act(r, { t: 'wait' });
      expect(r.mode).toBe('dead');
    });
    it('Rüstung und Schild retten nicht, Eisenwille schon', () => {
      let { r } = tod();
      r.p.def = 99; r.p.shield = 999;
      act(r, { t: 'wait' }); act(r, { t: 'wait' });
      expect(r.mode).toBe('dead');
      ({ r } = tod());
      r.p.relics.push('eisenwille');
      act(r, { t: 'wait' }); act(r, { t: 'wait' });
      expect(r.mode).toBe('play');
      expect(r.p.hp).toBe(1);
    });
    it('Betäubung bricht die Sense ab', () => {
      const { r, t } = tod();
      t.x = 31; // direkt daneben, damit der Schildstoß trifft
      act(r, { t: 'wait' });
      expect(t.st.zt).toBe(1);
      // Schildstoß des Kriegers betäubt den Tod direkt daneben
      r.p.res = 99;
      act(r, { t: 'skill', i: 0 });
      expect(t.st.zt).toBeUndefined();
      act(r, { t: 'wait' });
      expect(r.mode).toBe('play');
    });
  });

  it('Speichern und Laden mitten in der Jagd', () => {
    const r = arena();
    r.floorTurns = HUNTER.first - 1;
    act(r, { t: 'wait' });
    const b = deserialize(serialize(r))!;
    expect(b.floorTurns).toBe(r.floorTurns);
    expect(b.hunt).toEqual(r.hunt);
    expect(b.mobs.filter(m => MOBS[m.kind].hunter).length).toBe(1);
  });
});
void H;
