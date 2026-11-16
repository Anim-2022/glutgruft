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

function tone(f0: number, f1: number, dur: number, type: OscillatorType = 'square', vol = 0.06, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.15, cutoff = 900) {
  if (!ac) return;
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
  src.connect(f).connect(g).connect(ac.destination);
  src.start();
}

export type Sfx = 'hit' | 'hurt' | 'kill' | 'boom' | 'zap' | 'pick' | 'level' | 'solve' | 'death' | 'crack';

export function sfx(name: Sfx) {
  if (!on || !ac) return;
  switch (name) {
    case 'hit': tone(240, 110, 0.07); break;
    case 'hurt': tone(150, 60, 0.16, 'sawtooth', 0.07); break;
    case 'kill': noise(0.1, 0.1, 1800); tone(330, 70, 0.14, 'square', 0.05); break;
    case 'boom': noise(0.45, 0.3, 500); tone(90, 30, 0.35, 'sine', 0.2); break;
    case 'crack': noise(0.18, 0.18, 1200); break;
    case 'zap': tone(900, 380, 0.1, 'triangle', 0.07); break;
    case 'pick': tone(660, 660, 0.05); tone(990, 990, 0.08, 'square', 0.05, 0.06); break;
    case 'level': [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'square', 0.05, i * 0.08)); break;
    case 'solve': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.07, i * 0.09)); break;
    case 'death': [392, 330, 262, 196, 131].forEach((f, i) => tone(f, f * 0.9, 0.2, 'sawtooth', 0.06, i * 0.16)); break;
  }
}
