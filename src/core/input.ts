// Input buffer for turn actions (pure, no DOM): no confirmed key press is ever lost.
// - single press: run immediately if nothing is playing back; otherwise queue it (FIFO).
// - key repeat (held key): only with an empty queue and at least `gap` ms apart; never queued.
// - clear(): on every switch away from play (death, floor change, menu) so no action leaks into another screen.
export type Press = 'run' | 'queued' | 'drop';

export class InputQueue {
  private q: string[] = [];
  private last = -1e9;
  constructor(private readonly max = 8) {}

  get pending() { return this.q.length; }
  clear() { this.q.length = 0; }

  // busy: effects of the last turn are still playing; gap: minimum interval of held steps (ms)
  press(key: string, repeat: boolean, now: number, busy: boolean, gap: number): Press {
    if (repeat) {
      if (this.q.length || busy || now - this.last < gap) return 'drop';
      this.last = now;
      return 'run';
    }
    if (!this.q.length && !busy) { this.last = now; return 'run'; }
    if (this.q.length >= this.max) return 'drop';
    this.q.push(key);
    return 'queued';
  }

  // Once per frame: next queued key as soon as playback is done
  next(now: number, busy: boolean): string | null {
    if (!this.q.length || busy) return null;
    this.last = now;
    return this.q.shift()!;
  }

  // How fast the current playback should fast-forward: 1 normal, 3 with one pending key, Infinity with several
  speed(): number { return this.q.length >= 2 ? Infinity : this.q.length ? 3 : 1; }
}
