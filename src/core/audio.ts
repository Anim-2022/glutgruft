// Klangeffekte per WebAudio-Synthese – keine Dateien. Standardmäßig stumm.
const KEY = 'glutgruft.ton';
let ac: AudioContext | null = null;
let on = false;
try { on = localStorage.getItem(KEY) === '1'; } catch { /* kein Speicher */ }

export const soundOn = () => on;

// Muss aus einer Nutzeraktion heraus aufgerufen werden (Tastendruck).
export function wakeAudio() {
  if (!on) return;
  if (!ac) { try { ac = new AudioContext(); } catch { on = false; return; } }
  if (ac.state === 'suspended') void ac.resume();
}

export function toggleSound(): boolean {
  on = !on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* egal */ }
  wakeAudio();
  if (on) sfx('pick');
  return on;
}

// Shared output: gain and compressor so many simultaneous hits do not clip
let out: AudioNode | null = null;
function bus(): AudioNode {
  if (out || !ac) return out ?? ac!.destination;
  const comp = ac.createDynamicsCompressor(), g = ac.createGain();
  comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.12;
  g.gain.value = 0.9;
  g.connect(comp).connect(ac.destination);
  return (out = g);
}
// slight pitch variation per play (sound only, Math.random instead of game RNG)
let pitch = 1;

function tone(f0: number, f1: number, dur: number, type: OscillatorType = 'square', vol = 0.06, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus());
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.15, cutoff = 900, delay = 0) {
  if (!ac) return;
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff * pitch; g.gain.value = vol;
  src.connect(f).connect(g).connect(bus());
  src.start(ac.currentTime + delay);
}

export type Sfx = 'hit' | 'hurt' | 'kill' | 'boom' | 'zap' | 'pick' | 'level' | 'solve' | 'death' | 'crack'
  | 'miss' | 'crit' | 'step' | 'shatter' | 'crumble' | 'ignite' | 'splash' | 'heavy';

// the same sound at most twice at the same instant (otherwise volume stacks)
const recent = new Map<Sfx, { t: number; n: number }>();
const MUSICAL = new Set<Sfx>(['pick', 'level', 'solve', 'death']);

export function sfx(name: Sfx) {
  if (!on || !ac) return;
  const now = ac.currentTime, r = recent.get(name);
  if (r && now - r.t < 0.03) { if (r.n >= 2) return; r.n++; } else recent.set(name, { t: now, n: 1 });
  pitch = MUSICAL.has(name) ? 1 : 0.92 + Math.random() * 0.16;
  switch (name) {
    case 'hit': tone(240, 110, 0.07); noise(0.03, 0.06, 2400); break;
    case 'heavy': tone(150, 55, 0.12, 'square', 0.08); noise(0.08, 0.14, 900); break;
    case 'hurt': tone(150, 60, 0.16, 'sawtooth', 0.07); break;
    case 'kill': noise(0.1, 0.1, 1800); tone(330, 70, 0.14, 'square', 0.05); break;
    case 'crit': tone(1200, 600, 0.06, 'square', 0.05); tone(300, 90, 0.12, 'sawtooth', 0.07, 0.01); noise(0.06, 0.12, 3000); break;
    case 'miss': noise(0.09, 0.05, 3200); tone(700, 1100, 0.06, 'sine', 0.025); break;
    case 'step': noise(0.025, 0.025, 600); break;
    case 'boom': noise(0.45, 0.3, 500); tone(90, 30, 0.35, 'sine', 0.2); break;
    case 'crack': noise(0.18, 0.18, 1200); break;
    case 'crumble': noise(0.35, 0.22, 700); noise(0.12, 0.1, 1500, 0.12); tone(70, 40, 0.25, 'sine', 0.1); break;
    case 'shatter': noise(0.12, 0.14, 4000); tone(1500, 900, 0.05, 'triangle', 0.03); tone(1900, 1200, 0.04, 'triangle', 0.025, 0.04); break;
    case 'ignite': noise(0.3, 0.12, 1400); tone(200, 420, 0.18, 'sawtooth', 0.025); break;
    case 'splash': noise(0.16, 0.1, 2200); tone(500, 180, 0.08, 'sine', 0.04); break;
    case 'zap': tone(900, 380, 0.1, 'triangle', 0.07); break;
    case 'pick': tone(660, 660, 0.05); tone(990, 990, 0.08, 'square', 0.05, 0.06); break;
    case 'level': [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'square', 0.05, i * 0.08)); break;
    case 'solve': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.07, i * 0.09)); break;
    case 'death': [392, 330, 262, 196, 131].forEach((f, i) => tone(f, f * 0.9, 0.2, 'sawtooth', 0.06, i * 0.16)); break;
  }
  pitch = 1;
}
