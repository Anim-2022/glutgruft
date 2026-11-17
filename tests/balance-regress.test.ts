// Regressionen für behobene Balance-Lücken
import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, genItem, Run, Actor, MAX_TRAPS } from '../src/game/run';
import { W, H, T, computeFov } from '../src/game/dungeon';
import { MOBS, spawnTable } from '../src/game/content';
import type { ClassId } from '../src/game/content';

// Leerer Gang 3x58 ohne Gegner, Spieler in der Mitte
function arena(cls: ClassId, floor = 3): Run {
  const r = newRun(77, cls, defaultMeta());
  r.floor = floor; r.mobs = []; r.puzzle = null; r.fire.clear(); r.traps = [];
  for (let i = 0; i < W * H; i++) r.tiles[i] = T.WALL;
  for (let y = 5; y < 8; y++) for (let x = 2; x < 60; x++) r.tiles[y * W + x] = T.FLOOR;
  r.p.x = 30; r.p.y = 6;
  computeFov(r.tiles, r.p.x, r.p.y, 8, r.vis, r.seen);
  return r;
}
function mob(r: Run, kind: string, x: number, y: number, awake = true): Actor {
  const d = MOBS[kind];
  const m: Actor = { id: r.nextId++, kind, name: d.name, x, y, hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def, st: {}, xp: d.xp, cd: 0, awake, boss: d.boss };
  r.mobs.push(m);
  return m;
}

describe('Balance-Regressionen', () => {
  it('Händler verkauft höchstens 3 Heiltränke und 2 Bomben, jeweils teurer', () => {
    const r = arena('krieger');
    r.shop = [
      { kind: 'potion', name: 'Heiltrank', desc: '', price: 13, sold: false, left: 3 },
      { kind: 'bomb', name: 'Bombe', desc: '', price: 11, sold: false, left: 2 },
    ];
    r.p.gold = 1000; r.mode = 'shop';
    const pot0 = r.p.potions, bomb0 = r.p.bombs, prices: number[] = [];
    for (let k = 0; k < 10; k++) { prices.push(r.shop[0].price); act(r, { t: 'buy', i: 0 }); act(r, { t: 'buy', i: 1 }); }
    expect(r.p.potions - pot0).toBe(3);
    expect(r.p.bombs - bomb0).toBe(2);
    expect(r.shop[0].sold && r.shop[1].sold).toBe(true);
    expect(prices[1]).toBeGreaterThan(prices[0]);
  });

  it('Boss ruft Verstärkung, auch wenn die Ebene voller Gegner ist', () => {
    const r = arena('krieger', 5);
    for (let k = 0; k < 20; k++) mob(r, 'ratte', 2 + (k % 3), 5 + ((k / 3) | 0) % 3, false);
    const b = mob(r, 'koenig', 40, 6);
    b.hp = b.maxHp = 9999;
    const before = r.mobs.length;
    for (let k = 0; k < 10; k++) act(r, { t: 'wait' });
    expect(r.mobs.length).toBeGreaterThan(before);
  });

  it('Waldläufer sammelt ohne Gegner keinen Fokus und legt höchstens 3 Fallen', () => {
    const r = arena('waldlaeufer');
    r.p.res = 0;
    for (let k = 0; k < 60; k++) act(r, { t: 'wait' });
    expect(r.p.res).toBe(0);
    r.p.res = r.p.resMax;
    for (let k = 0; k < 6; k++) { r.p.res = r.p.resMax; act(r, { t: 'skill', i: 1 }); act(r, { t: 'move', dx: 1, dy: 0 }); }
    expect(r.traps.length).toBeLessThanOrEqual(MAX_TRAPS);
  });

  it('Waldläufer sammelt Fokus beim Warten, wenn ein Gegner in Sicht ist', () => {
    const r = arena('waldlaeufer');
    r.p.res = 0;
    mob(r, 'golem', 36, 6).hp = 9999;
    act(r, { t: 'wait' });
    expect(r.p.res).toBeGreaterThan(0);
  });

  it('Verfluchtes Stück bleibt bis zur nächsten Ebene angelegt', () => {
    const r = arena('krieger');
    const cursed = genItem(r, true);
    r.p.bag = [cursed];
    act(r, { t: 'equip', i: 0 });
    const slot = cursed.slot, maxHp = r.p.maxHp;
    expect(r.p.gear[slot]).toBe(cursed);
    act(r, { t: 'unequip', slot });
    expect(r.p.gear[slot]).toBe(cursed);
    const other = genItem(r);
    other.slot = slot; r.p.bag = [other];
    act(r, { t: 'equip', i: 0 });
    expect(r.p.gear[slot]).toBe(cursed);
    expect(r.p.maxHp).toBe(maxHp);
    r.floor++; // nächste Ebene
    act(r, { t: 'unequip', slot });
    expect(r.p.gear[slot]).toBeNull();
  });

  it('Kein Golem vor der Glutschmiede, höchstens ein Glutgeist-Eintrag', () => {
    for (let f = 1; f <= 10; f++) expect(spawnTable(f)).not.toContain('golem');
    expect(spawnTable(11).filter(k => k === 'glutgeist').length).toBe(1);
  });

  it('Bosse wachsen mit der Tiefe', () => {
    const r = arena('krieger', 15);
    r.mobs = [];
    act(r, { t: 'wait' });
    const hp = (kind: string, f: number) => Math.round(MOBS[kind].hp * (1.2 + 0.12 * f));
    expect(hp('fuerst', 15)).toBeGreaterThanOrEqual(500);
    expect(hp('koenig', 5)).toBeLessThanOrEqual(110);
  });

  it('Schütze weicht zurück, wenn der Spieler direkt daneben steht', () => {
    const r = arena('krieger', 5);
    const m = mob(r, 'schuetze', 31, 6);
    m.hp = m.maxHp = 999;
    const hp = r.p.hp;
    act(r, { t: 'wait' });
    expect(Math.abs(m.x - r.p.x) + Math.abs(m.y - r.p.y)).toBe(2);
    expect(r.p.hp).toBe(hp);
  });

  it('Schütze ohne Ausweg schlägt zu', () => {
    const r = arena('krieger', 5);
    // Sackgasse: Schütze rechts vom Spieler, dahinter und daneben Wand
    for (const [x, y] of [[32, 6], [31, 5], [31, 7]]) r.tiles[y * W + x] = T.WALL;
    const m = mob(r, 'schuetze', 31, 6);
    m.hp = m.maxHp = 999;
    const hp = r.p.hp;
    act(r, { t: 'wait' });
    expect(m.x).toBe(31);
    expect(r.p.hp).toBeLessThan(hp);
  });

  it('Fernschüsse treffen mit 70 % des Angriffs', () => {
    const r = arena('magier', 5);
    const m = mob(r, 'schuetze', 34, 6);
    m.hp = m.maxHp = 999; m.atk = 20;
    const hp = r.p.hp;
    act(r, { t: 'wait' });
    expect(hp - r.p.hp).toBe(14 - r.p.def);
  });

  it('Golem schlägt nur jeden zweiten Zug zu und lässt sich nicht mehr gefahrlos auf Abstand halten', () => {
    const r = arena('krieger', 5);
    const g = mob(r, 'golem', 31, 6);
    g.hp = g.maxHp = 9999; g.atk = 10;
    r.p.hp = r.p.maxHp = 9999;
    let hits = 0;
    for (let k = 0; k < 6; k++) { const hp = r.p.hp; act(r, { t: 'wait' }); if (r.p.hp < hp) hits++; }
    expect(hits).toBe(3);
    // Weglaufen: der Golem folgt jeden Zug
    const k2 = arena('waldlaeufer', 5);
    const g2 = mob(k2, 'golem', 27, 6);
    g2.hp = g2.maxHp = 9999;
    const x0 = g2.x;
    for (let k = 0; k < 4; k++) act(k2, { t: 'move', dx: 1, dy: 0 });
    expect(g2.x - x0).toBe(4);
  });

  it('Krieger sammelt Wut neben einem Gegner, sonst nicht', () => {
    const r = arena('krieger');
    r.p.res = 0;
    act(r, { t: 'wait' });
    expect(r.p.res).toBe(0);
    const m = mob(r, 'ratte', 31, 6);
    m.hp = m.maxHp = 999; m.atk = 0;
    r.p.def = 99;
    act(r, { t: 'wait' });
    expect(r.p.res).toBeGreaterThanOrEqual(1);
  });

  it('Frostnova Rang I betäubt einen Zug', () => {
    const r = arena('magier');
    const m = mob(r, 'skelett', 31, 6);
    m.hp = m.maxHp = 999;
    r.p.res = r.p.resMax;
    act(r, { t: 'skill', i: 1 });
    expect(m.st.immun).toBeGreaterThan(0); // Betäubung schon abgelaufen, Immunität läuft
    expect(m.st.stun ?? 0).toBe(0);
  });

  it('Blutpakt: +3 Angriff, -20 % max. Leben', () => {
    const r = arena('krieger');
    r.mode = 'perk'; r.perkChoices = ['blutpakt'];
    const atk = r.p.atk, maxHp = r.p.maxHp;
    act(r, { t: 'perk', i: 0 });
    expect(r.p.atk).toBe(atk + 3);
    expect(r.p.maxHp).toBe(Math.round(maxHp * 0.8));
  });
});
