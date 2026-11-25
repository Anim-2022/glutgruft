// Sound effects via WebAudio synthesis - no files. Muted by default.
// Soft by design: rounded waveforms through a lowpass, short attack/release envelopes,
// quiet master bus with compressor + limiter, slight pitch variation, rate limit per sound.
const KEY = 'glutgruft.ton', VOL_KEY = 'glutgruft.vol';
export const VOLUMES = [0.2, 0.4, 0.6, 0.8, 1];
let ac: AudioContext | null = null;
let on = false, vol = 0.6;
try {
  on = localStorage.getItem(KEY) === '1';
  const v = parseFloat(localStorage.getItem(VOL_KEY) ?? '');
  if (v > 0 && v <= 1) vol = v;
} catch { /* no storage */ }

export const soundOn = () => on;
export const volume = () => vol;

// Must be called from a user action (key press).
export function wakeAudio() {
  if (!on) return;
  if (!ac) { try { ac = new AudioContext(); } catch { on = false; return; } }
  if (ac.state === 'suspended') void ac.resume();
}

export function toggleSound(): boolean {
  on = !on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  wakeAudio();
  if (on) sfx('pick');
  return on;
}

// Next volume step (wraps around); plays a sample so the player hears the new level
export function cycleVolume(): number {
  const i = VOLUMES.findIndex(v => v >= vol - 0.001);
  setVol(VOLUMES[(i + 1) % VOLUMES.length]);
  if (on) sfx('pick');
  return vol;
}

// Title menu entry: OFF -> current volume -> ... -> 100% -> OFF (next time starting at the lowest step)
export function cycleSound() {
  if (!on) toggleSound();
  else if (vol >= 1) { setVol(VOLUMES[0]); toggleSound(); }
  else cycleVolume();
}
function setVol(v: number) {
  vol = v;
  try { localStorage.setItem(VOL_KEY, String(vol)); } catch { /* ignore */ }
  if (master && ac) master.gain.setTargetAtTime(MASTER * vol, ac.currentTime, 0.02);
}

// Master bus: gain (volume) -> gentle lowpass -> compressor -> limiter -> output
const MASTER = 0.45;
let out: AudioNode | null = null, master: GainNode | null = null;
function bus(): AudioNode {
  if (out || !ac) return out ?? ac!.destination;
  const g = ac.createGain(), lp = ac.createBiquadFilter(), comp = ac.createDynamicsCompressor(), lim = ac.createDynamicsCompressor();
  g.gain.value = MASTER * vol;
  lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.5;
  comp.threshold.value = -24; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
  lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
  g.connect(lp).connect(comp).connect(lim).connect(ac.destination);
  master = g;
  return (out = g);
}
// slight pitch variation per play (sound only, Math.random instead of game RNG)
let pitch = 1;

const ATK = 0.006;
// Envelope: short linear attack, exponential release (no clicks at start or end)
function env(g: GainNode, t: number, peak: number, dur: number, atk = ATK) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(atk + 0.01, dur));
}

// Tone through its own lowpass so even triangle waves stay round
function tone(f0: number, f1: number, dur: number, type: OscillatorType = 'triangle', v = 0.05, delay = 0, atk = ATK) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), t + dur);
  f.type = 'lowpass'; f.frequency.value = Math.min(6000, Math.max(f0, f1) * pitch * 3); f.Q.value = 0.3;
  env(g, t, v, dur, atk);
  o.connect(f).connect(g).connect(bus());
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur: number, v = 0.1, cutoff = 900, delay = 0, atk = 0.004) {
  if (!ac) return;
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const t = ac.currentTime + delay, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff * pitch; f.Q.value = 0.4;
  env(g, t, v, dur, atk);
  src.connect(f).connect(g).connect(bus());
  src.start(t); src.stop(t + dur + 0.02);
}

export type Sfx = 'hit' | 'hurt' | 'kill' | 'boom' | 'zap' | 'pick' | 'level' | 'solve' | 'death' | 'crack'
  | 'miss' | 'crit' | 'step' | 'shatter' | 'crumble' | 'ignite' | 'splash' | 'heavy' | 'scrape';

// Rate limit: the same sound at most twice within a short window (otherwise volume stacks),
// and frequent sounds not more often than their minimum gap.
const recent = new Map<Sfx, { t: number; n: number }>();
const WINDOW = 0.06;
const GAP: Partial<Record<Sfx, number>> = { step: 0.08, hit: 0.035, miss: 0.04, zap: 0.04, pick: 0.05 };
const MUSICAL = new Set<Sfx>(['pick', 'level', 'solve', 'death']);

// pure helper (exported for tests): may this sound play now?
export function allow(map: Map<string, { t: number; n: number }>, name: string, now: number, gap = 0): boolean {
  const r = map.get(name);
  if (r && now - r.t < Math.max(gap, WINDOW)) {
    if (now - r.t < gap || r.n >= 2) return false;
    r.n++; return true;
  }
  map.set(name, { t: now, n: 1 });
  return true;
}

export function sfx(name: Sfx) {
  if (!on || !ac) return;
  if (!allow(recent, name, ac.currentTime, GAP[name])) return;
  pitch = MUSICAL.has(name) ? 1 : 0.94 + Math.random() * 0.12;
  switch (name) {
    case 'hit': tone(220, 120, 0.09, 'triangle', 0.07); noise(0.04, 0.045, 1600); break;
    case 'heavy': tone(140, 60, 0.16, 'triangle', 0.09); noise(0.1, 0.08, 700); break;
    case 'hurt': tone(200, 110, 0.18, 'sine', 0.08, 0, 0.01); tone(150, 85, 0.16, 'triangle', 0.035, 0.015); break;
    case 'kill': noise(0.12, 0.06, 1200); tone(300, 90, 0.18, 'triangle', 0.05); break;
    case 'crit': tone(880, 660, 0.12, 'sine', 0.035); tone(260, 110, 0.14, 'triangle', 0.07, 0.01); noise(0.06, 0.06, 2200); break;
    case 'miss': noise(0.1, 0.035, 2400, 0, 0.02); tone(600, 900, 0.07, 'sine', 0.015); break;
    case 'step': noise(0.03, 0.018, 500); break;
    // ice slide: a soft, high hiss with a faint whistle (quiet; it plays under the whole slide)
    case 'scrape': noise(0.28, 0.025, 3000, 0, 0.03); noise(0.18, 0.015, 1600, 0.08); tone(1600, 1250, 0.22, 'sine', 0.006, 0, 0.02); break;
    case 'boom': noise(0.5, 0.16, 420, 0, 0.01); tone(85, 32, 0.4, 'sine', 0.14); break;
    case 'crack': noise(0.18, 0.1, 1000); break;
    case 'crumble': noise(0.35, 0.12, 600, 0, 0.01); noise(0.14, 0.06, 1200, 0.12); tone(70, 40, 0.28, 'sine', 0.08); break;
    case 'shatter': noise(0.14, 0.07, 3200); tone(1400, 900, 0.08, 'sine', 0.025); tone(1800, 1200, 0.07, 'sine', 0.02, 0.04); break;
    case 'ignite': noise(0.3, 0.07, 1100, 0, 0.04); tone(200, 380, 0.2, 'triangle', 0.02, 0, 0.03); break;
    case 'splash': noise(0.18, 0.06, 1800); tone(480, 190, 0.1, 'sine', 0.035); break;
    case 'zap': tone(820, 400, 0.12, 'sine', 0.05); tone(1230, 600, 0.08, 'triangle', 0.015); break;
    case 'pick': tone(660, 660, 0.08, 'sine', 0.05); tone(990, 990, 0.12, 'sine', 0.04, 0.06); break;
    case 'level': [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 'sine', 0.045, i * 0.09, 0.01)); break;
    case 'solve': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.2, 'sine', 0.045, i * 0.09, 0.01)); break;
    case 'death': [392, 330, 262, 196, 131].forEach((f, i) => tone(f, f * 0.94, 0.32, 'triangle', 0.045, i * 0.17, 0.02)); break;
  }
  pitch = 1;
}
