// Rucksack und Ausrüstung: Anlegen, Tauschen, Ablegen – atomar, ohne Verlust und ohne Verdopplung
import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, serialize, deserialize, Run, BAG_MAX } from '../src/game/run';
import type { Item } from '../src/game/content';

const mk = (slot: number, name: string, o: Partial<Item> = {}): Item =>
  ({ slot, name, rar: 1, atk: slot === 0 ? 2 : 0, def: slot === 1 ? 1 : 0, hp: 0, crit: 0, ...o });

function fresh(): Run {
  const run = newRun(5, 'krieger', defaultMeta());
  run.mobs = [];
  for (const it of run.p.gear) if (it) act(run, { t: 'unequip', slot: it.slot });
  run.p.bag = [];
  return run;
}
const all = (run: Run) => [...run.p.gear.filter(Boolean), ...run.p.bag] as Item[];
const stats = (run: Run) => [run.p.atk, run.p.def, run.p.maxHp, run.p.crit].join(',');

describe('Ausrüstung', () => {
  it('legt in einen leeren Platz an', () => {
    const run = fresh(), A = mk(0, 'A');
    run.p.bag = [A];
    const atk = run.p.atk;
    act(run, { t: 'equip', i: 0 });
    expect(run.p.gear[0]).toBe(A);
    expect(run.p.bag).toEqual([]);
    expect(run.p.atk).toBe(atk + 2);
    expect(run.invFocus).toEqual({ col: 0, row: 0 });
  });

  it('tauscht atomar: neues Stück angelegt, altes im Rucksack', () => {
    const run = fresh(), A = mk(0, 'A', { atk: 1 }), B = mk(0, 'B', { atk: 5 });
    run.p.bag = [A]; act(run, { t: 'equip', i: 0 });
    const base = run.p.atk - 1;
    run.p.bag = Array.from({ length: BAG_MAX - 1 }, (_, k) => mk(3, `R${k}`));
    run.p.bag.push(B); // Rucksack voll: der Tausch braucht trotzdem keinen freien Platz
    act(run, { t: 'equip', i: run.p.bag.indexOf(B) });
    expect(run.p.gear[0]).toBe(B);
    expect(run.p.bag).toContain(A);
    expect(run.p.bag).not.toContain(B);
    expect(run.p.bag.length).toBe(BAG_MAX);
    expect(run.p.atk).toBe(base + 5);
  });

  it('legt ab in einen freien Platz', () => {
    const run = fresh(), A = mk(1, 'A'), X = mk(3, 'X');
    run.p.bag = [A]; act(run, { t: 'equip', i: 0 });
    run.p.bag.push(X);
    const before = stats(run);
    act(run, { t: 'unequip', slot: 1 });
    expect(run.p.gear[1]).toBeNull();
    expect(run.p.bag).toContain(A);
    expect(run.invFocus).toEqual({ col: 1, row: run.p.bag.indexOf(A) });
    expect(stats(run)).not.toBe(before);
  });

  it('volle Tasche: Ablegen ändert nichts und sagt warum', () => {
    const run = fresh(), A = mk(1, 'A', { hp: 6 });
    run.p.bag = [A]; act(run, { t: 'equip', i: 0 });
    run.p.bag = Array.from({ length: BAG_MAX }, (_, k) => mk(3, `R${k}`));
    const before = stats(run), bag = [...run.p.bag];
    act(run, { t: 'unequip', slot: 1 });
    expect(run.p.gear[1]).toBe(A);
    expect(run.p.bag).toEqual(bag);
    expect(stats(run)).toBe(before);
    expect(run.invNote).toBe('No room in the backpack.');
  });

  it('verfluchtes Stück bleibt bis zur nächsten Ebene, dann lässt es sich tauschen', () => {
    const run = fresh(), C = mk(0, 'C', { cursed: true, hp: -6 }), B = mk(0, 'B');
    run.p.bag = [C, B];
    act(run, { t: 'equip', i: 0 });
    expect(run.p.gear[0]).toBe(C);
    act(run, { t: 'equip', i: run.p.bag.indexOf(B) });
    expect(run.p.gear[0]).toBe(C);
    expect(run.p.bag).toEqual([B]);
    act(run, { t: 'unequip', slot: 0 });
    expect(run.p.gear[0]).toBe(C);
    expect(run.invNote).toMatch(/curse/);
    run.floor++;
    act(run, { t: 'equip', i: 0 });
    expect(run.p.gear[0]).toBe(B);
    expect(run.p.bag).toEqual([C]);
  });

  it('Ebenenwechsel stört Anlegen und Ablegen nicht', () => {
    const run = fresh(), A = mk(0, 'A'), B = mk(0, 'B', { atk: 4 });
    run.p.bag = [A, B];
    act(run, { t: 'equip', i: 0 });
    run.tiles[run.p.y * 64 + run.p.x] = 2; act(run, { t: 'descend' });
    expect(run.floor).toBe(2);
    act(run, { t: 'equip', i: run.p.bag.indexOf(B) });
    expect(run.p.gear[0]).toBe(B);
    act(run, { t: 'unequip', slot: 0 });
    expect(run.p.gear[0]).toBeNull();
    expect(run.p.bag.map(i => i.name).sort()).toEqual(['A', 'B']);
  });

  it('Speichern und Laden ohne Verlust und ohne Doppel', () => {
    const run = fresh(), A = mk(0, 'A'), B = mk(0, 'B'), R = mk(3, 'R');
    run.p.bag = [A, B, R];
    act(run, { t: 'equip', i: 0 }); act(run, { t: 'equip', i: run.p.bag.indexOf(R) });
    const back = deserialize(serialize(run))!;
    expect(back.p.gear.map(g => g?.name ?? null)).toEqual(run.p.gear.map(g => g?.name ?? null));
    expect(back.p.bag.map(i => i.name)).toEqual(run.p.bag.map(i => i.name));
    expect(stats(back)).toBe(stats(run));
    expect(back.invFocus).toBeUndefined();
    // nach dem Laden funktioniert der Tausch weiter
    act(back, { t: 'equip', i: back.p.bag.findIndex(i => i.name === 'B') });
    expect(back.p.gear[0]!.name).toBe('B');
    expect(all(back).map(i => i.name).sort()).toEqual(['A', 'B', 'R']);
  });

  it('schnelles Hin und Her: keine Verdopplung, kein Verlust, keine Heilung', () => {
    const run = fresh(), items = [mk(0, 'A', { atk: 1 }), mk(0, 'B', { atk: 3 }), mk(1, 'C', { hp: 10 }), mk(1, 'D', { hp: 4 }), mk(2, 'E', { hp: 6 })];
    run.p.bag = [...items];
    run.p.hp = 10;
    const hp0 = run.p.hp, s0 = stats(run);
    for (let k = 0; k < 50; k++) {
      act(run, { t: 'equip', i: k % run.p.bag.length });
      act(run, { t: 'equip', i: (k * 7) % run.p.bag.length });
      act(run, { t: 'unequip', slot: k % 3 });
      expect(run.p.hp).toBeLessThanOrEqual(run.p.maxHp);
      const names = all(run).map(i => i.name).sort();
      expect(names).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(new Set(all(run)).size).toBe(5);
    }
    for (const it of [...run.p.gear]) if (it) act(run, { t: 'unequip', slot: it.slot });
    expect(stats(run)).toBe(s0);
    expect(run.p.hp).toBeLessThanOrEqual(hp0);
  });

  it('Leben bleibt anteilig erhalten: 20/40 → 25/50 → 20/40', () => {
    const run = fresh(), A = mk(1, 'A', { hp: 10, def: 0 });
    run.p.maxHp = 40; run.p.hp = 20;
    run.p.bag = [A];
    act(run, { t: 'equip', i: 0 });
    expect([run.p.hp, run.p.maxHp]).toEqual([25, 50]);
    act(run, { t: 'unequip', slot: 1 });
    expect([run.p.hp, run.p.maxHp]).toEqual([20, 40]);
  });
});
