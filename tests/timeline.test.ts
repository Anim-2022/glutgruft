import { describe, it, expect, beforeEach } from 'vitest';
import { schedule, advance, busy, hitstop, held, resetTimeline, plannedTimes, setPlayback, stopping, BUDGET, heroSlide, SLIDE_TILE, SLIDE_BUMP } from '../src/render/timeline';
import { InputQueue } from '../src/core/input';
import type { Fx } from '../src/game/run';

const lunge = (id: number): Fx => ({ k: 'lunge', id, dx: 1, dy: 0 });
const num = (s = '3'): Fx => ({ k: 'num', x: 1, y: 1, s, col: '#fff' });
const flash = (id: number): Fx => ({ k: 'flash', id });
const beat = (id: number): Fx => ({ k: 'beat', id });
const at = (k: string, n = 0) => plannedTimes().filter(q => q.k === k)[n].at;

describe('render timeline', () => {
  beforeEach(() => resetTimeline());

  it('hero strike, then enemy replies one after another', () => {
    schedule([lunge(0), flash(5), num(), beat(5), lunge(5), flash(0), num(), beat(6), lunge(6), flash(0), num()]);
    expect(at('lunge', 0)).toBe(0);
    expect(at('num', 0)).toBeGreaterThan(0);            // number appears on impact, not on wind-up
    expect(at('lunge', 1)).toBeGreaterThan(at('num', 0) - 1e-9);
    expect(at('lunge', 2)).toBeGreaterThan(at('lunge', 1));
    expect(held(5)).toBe(true);                          // enemy 5 waits until its beat
    // a turn with one enemy plays back within 150 ms
    const end = Math.max(...plannedTimes().slice(0, 6).map(q => q.at));
    expect(end).toBeLessThanOrEqual(0.15);
  });

  it('arrow damage number appears on impact', () => {
    schedule([{ k: 'arrow', x0: 0, y0: 0, x1: 6, y1: 0, col: '#fff', heavy: false }, flash(3), num()]);
    expect(at('num')).toBeGreaterThan(0.1);
    expect(at('arrow')).toBe(0);
  });

  it('many enemies: whole turn stays within budget', () => {
    const fx: Fx[] = [lunge(0), flash(1), num()];
    for (let i = 1; i <= 10; i++) fx.push(beat(i), lunge(i), flash(0), num());
    schedule(fx);
    const end = Math.max(...plannedTimes().map(q => q.at));
    expect(end).toBeLessThanOrEqual(BUDGET + 0.06);
  });

  it('empty beats (world without effects) cost no time', () => {
    schedule([lunge(0), flash(1), num(), beat(-1), beat(-1)]);
    expect(Math.max(...plannedTimes().map(q => q.at))).toBeLessThanOrEqual(0.06);
  });

  it('playback: everything comes out exactly once, then not busy', () => {
    schedule([lunge(0), flash(5), num(), beat(5), lunge(5), flash(0), num()]);
    const got: string[] = [];
    for (let k = 0; k < 40; k++) got.push(...advance(1 / 60).out.map(f => f.k));
    expect(got).toEqual(['lunge', 'flash', 'num', 'lunge', 'flash', 'num']);
    expect(busy()).toBe(false);
    expect(held(5)).toBe(false);
  });

  it('hitstop freezes only frame time, input keeps working', () => {
    hitstop(0.07);
    expect(stopping()).toBe(true);
    expect(advance(1 / 60).sdt).toBe(0);
    // nothing queued: a press runs immediately
    expect(busy()).toBe(false);
    expect(new InputQueue().press('w', false, 0, busy(), 110)).toBe('run');
    // pending input fast-forwards and cancels the stop
    schedule([lunge(0), flash(5), num()]);
    setPlayback(3); advance(1 / 60);
    expect(stopping()).toBe(false);
  });

  it('several pending keys show everything at once', () => {
    const fx: Fx[] = [lunge(0)];
    for (let i = 1; i <= 5; i++) fx.push(beat(i), lunge(i), flash(0), num());
    schedule(fx);
    setPlayback(Infinity);
    expect(advance(1 / 60).out.length).toBe(fx.filter(f => f.k !== 'beat').length);
    expect(busy()).toBe(false);
  });

  it('ice slide plays back tile by tile at constant speed; input waits until the stop', () => {
    const path: [number, number][] = [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3]];
    schedule([{ k: 'slide', path }, beat(7), lunge(7), flash(0), num()]);
    expect(busy()).toBe(true);
    expect(heroSlide()).toMatchObject({ x: 2, y: 3, dx: 1, dy: 0, phase: 'move' });
    advance(SLIDE_TILE * 2);
    expect(heroSlide()!.x).toBeCloseTo(4, 5);
    // the enemy reply waits for the slide to end
    expect(at('lunge')).toBeGreaterThan(SLIDE_TILE * 2);
    advance(SLIDE_TILE * 2 + 0.01);
    expect(heroSlide()).toMatchObject({ x: 6, y: 3, phase: 'bump' });
    expect(busy()).toBe(true);
    for (let k = 0; k < 30; k++) advance(1 / 60);
    expect(heroSlide()).toBe(null);
    expect(busy()).toBe(false);
    expect(new InputQueue().press('w', false, 0, busy(), 110)).toBe('run');
    expect(SLIDE_BUMP).toBeLessThan(0.15);
  });

  it('pending input skips an ice slide like any other playback', () => {
    schedule([{ k: 'slide', path: [[0, 0], [0, 1], [0, 2], [0, 3]] }]);
    setPlayback(Infinity); advance(1 / 60);
    expect(heroSlide()).toBe(null);
    expect(busy()).toBe(false);
  });
});
