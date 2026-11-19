import { describe, it, expect, afterEach } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun, act, Run, serialize, deserialize } from '../src/game/run';
import { W, T, distMap } from '../src/game/dungeon';
import { FEATURES } from '../src/game/content';
import { EVENTS, EVENT_BY_ID } from '../src/game/events';
import { botAction } from './bot';

const F0 = { ...FEATURES };
afterEach(() => Object.assign(FEATURES, F0));

// Läuft mit dem Bot über mehrere Ebenen und gibt den Lauf zurück
function play(seed: number, floors: number, cls: 'krieger' | 'magier' | 'waldlaeufer' = 'krieger'): Run {
  const run = newRun(seed, cls, defaultMeta());
  run.p.hp = run.p.maxHp = 999;
  for (let i = 0; i < 8000 && run.mode !== 'dead' && run.mode !== 'win' && run.floor <= floors; i++) {
    act(run, botAction(run));
    run.p.hp = Math.max(run.p.hp, 500);
  }
  return run;
}

// Startet ein bestimmtes Ereignis auf Ebene 1 und gibt den Lauf mit laufendem Ereignis zurück
function started(id: string, from = 1): Run {
  FEATURES.eventForce = id;
  for (let seed = from; seed < from + 200; seed++) {
    const run = newRun(seed, 'krieger', defaultMeta());
    const plan = run.evQ?.[0];
    if (!plan) continue;
    run.p.hp = run.p.maxHp = 300;
    if (plan.room !== undefined) {
      const r = run.evRooms![plan.room];
      run.mobs = run.mobs.filter(m => !(m.x >= r.x - 1 && m.x <= r.x + r.w && m.y >= r.y - 1 && m.y <= r.y + r.h));
      // in die Raummitte stellen (ein freies Bodenfeld)
      let spot = -1;
      for (let y = r.y; y < r.y + r.h && spot < 0; y++) for (let x = r.x; x < r.x + r.w; x++) if (run.tiles[y * W + x] === T.FLOOR) { spot = y * W + x; break; }
      if (spot < 0) continue;
      run.p.x = spot % W; run.p.y = (spot / W) | 0;
    } else {
      run.mobs = [];
      run.evCalm = 60;
    }
    act(run, { t: 'wait' });
    if (run.ev?.id === id) return run;
  }
  throw new Error(`Ereignis ${id} startet nie`);
}

describe('Ereignisse: Planung', () => {
  it('Rate 0, 1 und 2 planen 0, 1–2 und genau 2 Ereignisse je normaler Ebene', () => {
    for (const rate of [0, 1, 2]) {
      FEATURES.eventRate = rate;
      const counts = new Set<number>();
      for (let seed = 1; seed <= 60; seed++) counts.add(newRun(seed, 'magier', defaultMeta()).evQ?.length ?? 0);
      if (rate === 0) expect([...counts]).toEqual([0]);
      if (rate === 1) expect([...counts].sort()).toEqual([1, 2]);
      if (rate === 2) expect([...counts]).toEqual([2]);
    }
  });

  it('ohne Ereignisse: kein Zustand, keine Planung', () => {
    FEATURES.events = false;
    const run = play(5, 3);
    expect(run.evQ).toBeUndefined();
    expect(run.ev).toBeUndefined();
    expect(run.tele?.evStart).toBeUndefined();
  });

  it('kein Ereignis wiederholt sich, solange das Deck reicht, und nie zwei gefährliche hintereinander', () => {
    FEATURES.eventRate = 2;
    for (let seed = 1; seed <= 12; seed++) {
      const run = play(seed * 13, 9);
      const used = run.evUsed ?? [];
      expect(used.length).toBeGreaterThan(4);
      // Wiederholung nur, wenn alle noch ungezogenen Ereignisse gefährlich und damit gerade gesperrt sind
      used.forEach((id, i) => {
        if (!used.slice(0, i).includes(id)) return;
        const rest = EVENTS.filter(d => !used.slice(0, i).includes(d.id));
        expect(rest.every(d => d.cat === 'danger') && (rest.length === 0 || EVENT_BY_ID[used[i - 1]].cat === 'danger'), `Seed ${seed}: ${used.join(',')}`).toBe(true);
      });
      for (let i = 1; i < used.length; i++) {
        expect(EVENT_BY_ID[used[i]].cat === 'danger' && EVENT_BY_ID[used[i - 1]].cat === 'danger', `Seed ${seed}: ${used.join(',')}`).toBe(false);
      }
    }
  });

  it('EVENT_FORCE übergeht Deck und Gefahrenregel', () => {
    FEATURES.eventForce = 'hinterhalt'; FEATURES.eventRate = 2;
    const run = newRun(3, 'krieger', defaultMeta());
    expect(run.evQ!.map(q => q.id)).toEqual(['hinterhalt', 'hinterhalt']);
  });

  it('Kategorien: jede Art kommt vor, alle Ereignisse haben Titel, Einleitung und Zeitgrenze', () => {
    const cats = new Set(EVENTS.map(e => e.cat));
    expect([...cats].sort()).toEqual(['challenge', 'danger', 'flavour']);
    expect(EVENTS.length).toBe(14);
    for (const e of EVENTS) { expect(e.intro.length).toBeGreaterThan(0); expect(e.limit).toBeGreaterThan(0); expect(e.limit).toBeLessThanOrEqual(150); }
  });
});

describe('Ereignisse: Ablauf', () => {
  it.each(EVENTS.map(e => e.id))('%s: startet mit Banner, endet sicher, öffnet Gitter wieder', id => {
    const run = started(id), e = run.ev!;
    expect(run.log.some(l => l.startsWith('Ereignis:'))).toBe(true);
    const sealed = (e.seal ?? []).map(([i]) => i);
    let banners = 0;
    for (let k = 0; k < 200 && run.ev; k++) {
      run.fx = [];
      if (run.mode === 'perk') act(run, { t: 'perk', i: 0 });
      else act(run, botAction(run));
      run.p.hp = Math.max(run.p.hp, 200);
      banners += run.fx.filter(f => f.k === 'banner').length;
      if (run.floor > 1) break;
    }
    expect(run.ev ?? null).toBeNull();
    if (run.floor === 1) {
      expect(banners).toBeGreaterThanOrEqual(1);
      for (const i of sealed) expect(run.tiles[i]).not.toBe(T.GATE);
      expect(run.warn ?? []).toEqual([]);
      expect(run.mobs.some(m => m.ev)).toBe(false);
      const d = distMap(run.tiles, run.p.x, run.p.y);
      expect(d[run.tiles.indexOf(T.STAIRS)]).toBeGreaterThan(0);
    }
    expect(['play', 'perk']).toContain(run.mode);
  });

  it('Fallenkammer: versiegelt, warnt rot und trifft nur gewarnte Felder', () => {
    const run = started('fallenkammer'), e = run.ev!;
    expect(e.seal!.length).toBeGreaterThan(0);
    for (const [i] of e.seal!) expect(run.tiles[i]).toBe(T.GATE);
    // auf ein ungewarntes Feld stellen und warten: kein Schaden
    let safeHits = 0;
    for (let k = 0; k < 8 && run.ev; k++) {
      const warn = new Set(run.warn ?? []);
      const pi = run.p.y * W + run.p.x;
      const hp = run.p.hp;
      if (!warn.has(pi)) { act(run, { t: 'wait' }); if (run.p.hp < hp) safeHits++; }
      else act(run, botAction(run));
    }
    expect(safeHits).toBe(0);
    expect(run.ev).toBeNull();
    for (const [i] of e.seal!) expect(run.tiles[i]).not.toBe(T.GATE);
  });

  it('Diebesratte: nimmt Gold, gibt beim Fang das Doppelte zurück', () => {
    FEATURES.eventForce = 'dieb';
    const run = started('dieb');
    const stolen = run.ev!.data.stolen;
    const gold = run.p.gold;
    const rat = run.mobs.find(m => m.kind === 'dieb')!;
    rat.hp = 1;
    run.p.x = rat.x - 1; run.p.y = rat.y;
    run.tiles[run.p.y * W + run.p.x] = T.FLOOR;
    act(run, { t: 'move', dx: 1, dy: 0 });
    for (let k = 0; k < 3 && run.ev; k++) act(run, { t: 'wait' });
    expect(run.ev).toBeNull();
    expect(run.p.gold).toBeGreaterThanOrEqual(gold + Math.max(2 * stolen, 6));
  });

  it('Ziel erreichen: Zeit reicht für den kürzesten Weg mit Puffer', () => {
    for (const id of ['geist', 'wettlauf']) {
      const run = started(id), e = run.ev!;
      const d = distMap(run.tiles, run.p.x, run.p.y)[e.mark!];
      expect(d).toBeGreaterThan(0);
      expect(e.limit - e.turns).toBeGreaterThanOrEqual(d);
    }
  });

  it('Schattenzwilling: schwächer als der Held', () => {
    const run = started('zwilling');
    const tw = run.mobs.find(m => m.kind.startsWith('schatten_'))!;
    expect(tw.maxHp).toBeLessThan(run.p.maxHp);
    expect(tw.atk).toBeLessThan(run.p.atk + 1);
  });

  it('Speichern und Laden mitten im Ereignis', () => {
    const run = started('fallenkammer');
    const back = deserialize(serialize(run))!;
    expect(back.ev!.id).toBe('fallenkammer');
    expect(back.ev!.seal).toEqual(run.ev!.seal);
    for (let k = 0; k < 20 && back.ev; k++) act(back, { t: 'wait' });
    expect(back.ev).toBeNull();
  });

  it('Reliquienwahlen aus Ereignissen sind je Lauf gedeckelt', () => {
    FEATURES.eventForce = 'zwilling'; FEATURES.eventRate = 2;
    for (let seed = 1; seed <= 6; seed++) {
      const run = play(seed * 7, 12, 'magier');
      expect(run.relicOps ?? 0).toBeLessThanOrEqual(2);
    }
  });
});
