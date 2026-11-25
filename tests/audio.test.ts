import { describe, expect, it } from 'vitest';
import { allow, VOLUMES } from '../src/core/audio';

describe('audio rate limit', () => {
  it('allows at most two identical sounds in the window', () => {
    const m = new Map();
    expect(allow(m, 'kill', 0)).toBe(true);
    expect(allow(m, 'kill', 0.01)).toBe(true);
    expect(allow(m, 'kill', 0.02)).toBe(false);
    expect(allow(m, 'kill', 0.2)).toBe(true);
  });
  it('respects the minimum gap of frequent sounds', () => {
    const m = new Map();
    expect(allow(m, 'step', 0, 0.08)).toBe(true);
    expect(allow(m, 'step', 0.05, 0.08)).toBe(false);
    expect(allow(m, 'step', 0.09, 0.08)).toBe(true);
  });
  it('volume steps stay in (0, 1]', () => {
    expect(VOLUMES.every(v => v > 0 && v <= 1)).toBe(true);
  });
});
