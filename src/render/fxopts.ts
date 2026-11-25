// Effect intensity (rendering only): 0 minimum, 1 normal, 2 strong; screen shake can be turned off separately.
// Minimum keeps all game information (warning tiles, numbers, statuses) and only removes decoration.
const KEY = 'glutgruft.fx', SHAKE = 'glutgruft.shake';
let level = 1, shakeOn = true;
try {
  const v = localStorage.getItem(KEY);
  level = v === null ? (localStorage.getItem('glutgruft.wenigfx') === '1' ? 0 : 1) : Math.max(0, Math.min(2, +v | 0));
  shakeOn = localStorage.getItem(SHAKE) !== '0';
} catch { /* kein Speicher */ }
const store = () => { try { localStorage.setItem(KEY, String(level)); localStorage.setItem(SHAKE, shakeOn ? '1' : '0'); } catch { /* egal */ } };
const subs: (() => void)[] = [];
export const onFxChange = (f: () => void) => { subs.push(f); };

export const fxLevel = () => level;
export const reducedFx = () => level === 0;
// Factor for particle counts, shake and hitstop
export const fxScale = () => [0, 1, 1.4][level];
export const shakeEnabled = () => shakeOn && level > 0;
export function setFxLevel(n: number) { level = ((n % 3) + 3) % 3; store(); subs.forEach(f => f()); }
export function toggleShake() { shakeOn = !shakeOn; store(); return shakeOn; }
