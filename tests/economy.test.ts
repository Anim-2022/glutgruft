// Wirtschaft: Schmied, neue Ware, Seltenheit
import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, genItem, FORGE_MAX } from '../src/game/run';

describe('Wirtschaft', () => {
  it('Schmied verbessert die Waffe bis +2, danach die Rüstung, und wird teurer', () => {
    const r = newRun(5, 'krieger', defaultMeta());
    const w = { slot: 0, name: 'Iron Blade', rar: 0, atk: 1, def: 0, hp: 0, crit: 0 };
    r.p.gear[0] = w; r.p.atk += 1; r.p.gold = 10000; r.mode = 'shop';
    r.shop = [{ kind: 'forge', name: 'Smith', desc: '', price: 30, sold: false, left: 9 }];
    const atk0 = r.p.atk, def0 = r.p.def;
    act(r, { t: 'buy', i: 0 }); act(r, { t: 'buy', i: 0 });
    expect(r.p.atk - atk0).toBe(FORGE_MAX);
    expect(w.atk).toBe(1 + FORGE_MAX);
    expect(w.name).toBe(`Iron Blade +${FORGE_MAX}`);
    expect(r.shop[0].price).toBeGreaterThan(30);
    const g = r.p.gold;
    act(r, { t: 'buy', i: 0 }); // keine Rüstung: nichts zu tun, kein Gold weg
    expect(r.p.gold).toBe(g);
    r.p.gear[1] = { slot: 1, name: 'Leather Armor', rar: 0, atk: 0, def: 1, hp: 0, crit: 0 }; r.p.def += 1;
    act(r, { t: 'buy', i: 0 });
    expect(r.p.def - def0).toBe(2);
  });

  it('Neue Ware ersetzt die Ausrüstung des Händlers, höchstens zweimal', () => {
    const r = newRun(6, 'magier', defaultMeta());
    r.p.gold = 10000; r.mode = 'shop';
    r.shop = [
      { kind: 'item', name: 'X', desc: '', price: 1, sold: true, item: genItem(r) },
      { kind: 'reroll', name: 'New Stock', desc: '', price: 10, sold: false, left: 2 },
    ];
    for (let k = 0; k < 4; k++) act(r, { t: 'buy', i: r.shop.findIndex(o => o.kind === 'reroll') });
    expect(r.shop.filter(o => o.kind === 'item').length).toBe(3);
    expect(r.shop.filter(o => o.kind === 'item').every(o => !o.sold)).toBe(true);
    expect(r.shop.find(o => o.kind === 'reroll')!.sold).toBe(true);
    expect(r.shop[r.shop.length - 1].kind).toBe('reroll');
  });

  it('Legendär bleibt selten, auch tief und mit Schatzsucher', () => {
    const meta = defaultMeta(); meta.upg.fund = 3;
    const r = newRun(7, 'krieger', meta);
    r.floor = 15;
    const n = [0, 0, 0, 0];
    for (let k = 0; k < 4000; k++) n[genItem(r).rar]++;
    expect(n[3] / 4000).toBeLessThan(0.06);
    expect(n[2]).toBeGreaterThan(n[3] * 3);
  });
});
