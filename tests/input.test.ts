import { describe, it, expect } from 'vitest';
import { InputQueue } from '../src/core/input';

// Plays a sequence: effects last `fx` ms after each action, fast-forwarded by q.speed()
function sim(events: { t: number; k: string; rep?: boolean }[], fx = 200, end = 5000) {
  const q = new InputQueue(), done: string[] = [];
  let busyUntil = 0, ei = 0;
  for (let now = 0; now <= end; now += 16) {
    const busy = now < busyUntil;
    while (ei < events.length && events[ei].t <= now) {
      const e = events[ei++];
      if (q.press(e.k, !!e.rep, now, now < busyUntil, 110) === 'run') { done.push(e.k); busyUntil = now + fx; }
    }
    if (busy) { const s = q.speed(); if (s === Infinity) busyUntil = now; else if (s > 1) busyUntil -= 16 * (s - 1); }
    const k = q.next(now, now < busyUntil);
    if (k) { done.push(k); busyUntil = now + fx; }
  }
  return done;
}

describe('input buffer', () => {
  it('fast attack/step alternation: all four in order', () => {
    expect(sim([{ t: 0, k: 'a' }, { t: 30, k: 'w' }, { t: 60, k: 'a' }, { t: 90, k: 's' }])).toEqual(['a', 'w', 'a', 's']);
  });
  it('one press – one action', () => {
    expect(sim([{ t: 0, k: 'w' }])).toEqual(['w']);
    expect(sim([{ t: 0, k: 'w' }, { t: 1000, k: 'w' }])).toEqual(['w', 'w']);
  });
  it('held key: steps at a fixed rate, nothing trails after release', () => {
    const ev = [{ t: 0, k: 'd' }];
    for (let t = 500; t <= 1500; t += 33) ev.push({ t, k: 'd', rep: true } as never);
    const done = sim(ev, 60);
    // 1 press + repeats at least 110 ms apart over 1 s
    expect(done.length).toBeGreaterThanOrEqual(8);
    expect(done.length).toBeLessThanOrEqual(11);
    // nothing after t=1500: simulating up to 5000 changes nothing
    expect(sim(ev, 60, 1600).length).toBe(done.length);
  });
  it('key repeat is never queued', () => {
    const q = new InputQueue();
    expect(q.press('d', false, 0, false, 110)).toBe('run');
    expect(q.press('d', true, 200, true, 110)).toBe('drop');
    expect(q.pending).toBe(0);
  });
  it('clear() empties the queue (menu, death, floor change)', () => {
    const q = new InputQueue();
    q.press('a', false, 0, true, 110); q.press('b', false, 1, true, 110);
    expect(q.pending).toBe(2);
    q.clear();
    expect(q.next(500, false)).toBeNull();
  });
  it('fast-forward: one pending key ×3, several instantly', () => {
    const q = new InputQueue();
    expect(q.speed()).toBe(1);
    q.press('a', false, 0, true, 110); expect(q.speed()).toBe(3);
    q.press('b', false, 0, true, 110); expect(q.speed()).toBe(Infinity);
  });
});
