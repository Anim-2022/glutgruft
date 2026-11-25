import { describe, it, expect } from 'vitest';
import { newRun, act, serialize } from '../src/game/run';
import type { Run } from '../src/game/run';
import { defaultMeta } from '../src/core/save';
import { CLASS_ORDER, PERKS, RELICS, SYNERGIES, AFFIX } from '../src/game/content';
import { ICONS } from '../src/render/sprites';
import { statusList, groupPassives, STATUS_KEYS, STATUS_HELPERS, type StatusEntry } from '../src/render/status';

import RUN_SRC from '../src/game/run.ts?raw';

const UMLAUT = /[äöüÄÖÜß]/;
const calm = (run: Run) => { run.mobs = []; run.hazards = []; run.ev = null; run.evQ = []; run.hunt = null; return run; };
const byId = (run: Run, id: string) => statusList(run).find(e => e.id === id);
const texts = (list: StatusEntry[]) => list.flatMap(e => [e.name, e.desc, ...(e.items ?? []).flatMap(i => [i.name, i.desc])]);

describe('status HUD list', () => {
  it('works for every class at the start and only uses existing icons', () => {
    for (const cls of CLASS_ORDER) {
      const run = newRun(77, cls, defaultMeta());
      const list = statusList(run);
      expect(Array.isArray(list)).toBe(true);
      expect(list.filter(e => e.kind !== 'passive')).toEqual([]);
      for (const e of list) expect(ICONS[e.icon[0]], e.icon[0]).toBeDefined();
    }
  });

  it('shows poison with its remaining turns and drops it when it wears off', () => {
    const run = calm(newRun(5, 'krieger', defaultMeta()));
    run.p.st.gift = 4;
    const e = byId(run, 'gift')!;
    expect(e).toBeDefined();
    expect(e.name).toBe('Poison');
    expect(e.kind).toBe('bad');
    expect(e.turns).toBe(4);
    act(run, { t: 'wait' });
    expect(byId(run, 'gift')?.turns).toBe(run.p.st.gift);
    expect(run.p.st.gift).toBeLessThan(4);
    for (let i = 0; i < 6; i++) act(run, { t: 'wait' });
    expect(byId(run, 'gift')).toBeUndefined();
  });

  it('a buff appears with its duration and disappears when it ends', () => {
    const run = calm(newRun(9, 'magier', defaultMeta()));
    run.p.bag.push({ slot: 4, name: 'Might Potion', rar: 0, atk: 0, def: 0, hp: 0, crit: 0, use: 'kraft' });
    act(run, { t: 'use', id: 'kraft' });
    const e = byId(run, 'stark')!;
    expect(e.kind).toBe('good');
    expect(e.name).toBe('Might Potion');
    expect(e.turns).toBe(run.p.st.stark);
    for (let i = 0; i < 12; i++) act(run, { t: 'wait' });
    expect(byId(run, 'stark')).toBeUndefined();
  });

  it('the warrior sees War Cry, Bulwark and the hunted debuff', () => {
    const run = calm(newRun(11, 'krieger', defaultMeta()));
    run.p.st.stark = 6; run.p.st.wall = 6;
    expect(byId(run, 'stark')!.name).toBe('War Cry');
    expect(byId(run, 'wall')!.name).toBe('Bulwark');
    // bad effects come before good ones
    run.p.st.brand = 2;
    const ids = statusList(run).map(e => e.id);
    expect(ids.indexOf('brand')).toBeLessThan(ids.indexOf('stark'));
  });

  it('every status key the game sets on the hero has an entry', () => {
    const set = new Set([...(RUN_SRC as string).matchAll(/\bp\.st\.(\w+)\s*=(?!=)/g)].map(m => m[1]));
    set.add('stein'); set.add('netz'); // also set through helpers
    for (const k of set) expect([...STATUS_KEYS, ...STATUS_HELPERS], k).toContain(k);
    for (const k of STATUS_KEYS) {
      const run = calm(newRun(3, k === 'riss' || k === 'eis' || k === 'nachhall' || k === 'schild' ? 'magier' : k === 'aim' || k === 'schatten' || k === 'rauch' ? 'waldlaeufer' : 'krieger', defaultMeta()));
      run.p.st[k] = 2;
      if (k === 'rauch') { run.p.st.rx = run.p.x; run.p.st.ry = run.p.y; }
      expect(byId(run, k), k).toBeDefined();
    }
  });

  it('passives: boons are counted, relics, synergies and equipment effects appear', () => {
    const run = calm(newRun(21, 'waldlaeufer', defaultMeta()));
    const p = run.p;
    p.perks.push('vampir', 'vampir', 'dornen');
    p.relics.push('steinhaut');
    p.syn.push('stachel');
    p.gear[3] = { slot: 3, name: 'Blood Ring', rar: 3, atk: 0, def: 0, hp: 0, crit: 0, aff: [['vamp', 3], ['boss', 30]] };
    const v = byId(run, 'vampir')!;
    expect(v.kind).toBe('passive');
    expect(v.count).toBe(2);
    expect(v.desc).toContain(PERKS.vampir.desc);
    expect(byId(run, 'steinhaut')!.desc).toContain(RELICS.steinhaut.desc);
    expect(byId(run, 'syn:stachel')!.name).toBe('Spiked Plate');
    expect(byId(run, 'aff:vamp')!.name).toBe(AFFIX.vamp(3));
    expect(byId(run, 'aff:vamp')!.desc).toContain('Blood Ring');
  });

  it('many passives collapse into one group icon with a count', () => {
    const run = calm(newRun(21, 'krieger', defaultMeta()));
    run.p.perks.push(...Object.keys(PERKS));
    run.p.relics.push(...Object.keys(RELICS));
    const pass = statusList(run).filter(e => e.kind === 'passive');
    expect(pass.length).toBeGreaterThan(16);
    const row = groupPassives(pass, 16);
    expect(row.length).toBe(16);
    const g = row[15];
    expect(g.src).toBe('group');
    expect(g.count).toBe(pass.length - 15);
    expect(g.items!.length).toBe(g.count);
    expect(groupPassives(pass.slice(0, 5), 16)).toHaveLength(5);
  });

  it('all texts are English and reading the list changes nothing', () => {
    for (const cls of CLASS_ORDER) {
      const run = calm(newRun(31, cls, defaultMeta()));
      const p = run.p;
      for (const k of STATUS_KEYS) p.st[k] = 3;
      p.st.rx = p.x; p.st.ry = p.y;
      p.perks.push(...Object.keys(PERKS));
      p.relics.push(...Object.keys(RELICS));
      p.syn.push(...SYNERGIES.map(s => s.id));
      p.gear[2] = { slot: 2, name: 'Test Amulet', rar: 3, atk: 0, def: 0, hp: 0, crit: 0, cursed: true, lock: run.floor, aff: Object.keys(AFFIX).map(id => [id, 10] as [string, number]) };
      p.tree.push('n2_5'); p.hp = 1; p.shield = 5;
      run.ev = { id: 'nebel', data: { fog: 1 } } as any;
      const before = serialize(run);
      const list = statusList(run);
      expect(serialize(run)).toBe(before);
      expect(list.length).toBeGreaterThan(40);
      for (const s of texts([...list, ...groupPassives(list.filter(e => e.kind === 'passive'), 16)])) {
        expect(s, s).not.toMatch(UMLAUT);
        expect(s.length).toBeGreaterThan(0);
      }
      for (const e of list) expect(ICONS[e.icon[0]], e.icon[0]).toBeDefined();
    }
  });
});
