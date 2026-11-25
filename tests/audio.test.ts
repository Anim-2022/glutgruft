import { describe, expect, it } from 'vitest';
import { VOLUMES } from '../src/core/audio';

describe('audio', () => {
  it('volume steps stay in (0, 1] and end at 100 % (the original loudness)', () => {
    expect(VOLUMES.every(v => v > 0 && v <= 1)).toBe(true);
    expect(VOLUMES[VOLUMES.length - 1]).toBe(1);
  });
});
