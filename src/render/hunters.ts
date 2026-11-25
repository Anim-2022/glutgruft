// Jäger: Aura, Warnfelder und Angriffseffekte. Reine Darstellung – liest den Lauf nur.
import { TS } from './gfx';
import { W } from '../game/dungeon';
import { MOBS } from '../game/content';
import type { Run, Actor, Fx } from '../game/run';
import { hunterMarks } from '../game/run';
import { sfx } from '../core/audio';
import { reducedFx } from './deaths';

interface Light { x: number; y: number; r: number; col?: string; a?: number; }
type Part = { x: number; y: number; vx: number; vy: number; col: string; t: number; life: number; g: number; s: number };
type Eff = { k: string; x: number; y: number; x1: number; y1: number; dx: number; dy: number; v: number; t: number; dur: number; delay: number; seed: number };

const parts: Part[] = [];
const effs: Eff[] = [];
const leaps = new Map<number, number>();
const charges = new Map<number, number>(); // Ladeglühen je Jäger (Restzeit)
const LEAP_T = 0.34;

// Farben je Angriffsart: [Hauptfarbe, helle Farbe]
export const HUNT_COL: Record<string, [string, string]> = {
  leap: ['#a7f070', '#f4f4f4'], tail: ['#38b764', '#a7f070'], tent: ['#9a4fc0', '#d08cff'],
  breath: ['#ef7d57', '#ffcd75'], rain: ['#ef7d57', '#ffcd75'], gaze: ['#ffcd75', '#f4f4f4'], scythe: ['#9a4fc0', '#d08cff'],
};

export function resetHunterFx() { parts.length = 0; effs.length = 0; leaps.clear(); charges.clear(); }
export const isHunter = (a: Actor) => !!MOBS[a.kind]?.hunter;
export const leaping = (id: number) => leaps.has(id);
// Höhe über dem Boden während eines Sprungs (Bogen)
export function leapLift(id: number): number {
  const t = leaps.get(id);
  return t === undefined ? 0 : Math.sin(Math.min(1, t / LEAP_T) * Math.PI) * 16;
}

function burst(x: number, y: number, n: number, cols: string[], v0: number, v1: number, up = 30, g = 200, life = 0.55, s = 2) {
  if (reducedFx()) n = Math.ceil(n / 3);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = v0 + Math.random() * (v1 - v0);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, col: cols[k % cols.length], t: 0, life: life * (0.7 + Math.random() * 0.6), g, s });
  }
}
const eff = (k: string, x: number, y: number, dur: number, o: Partial<Eff> = {}) =>
  effs.push({ k, x, y, x1: x, y1: y, dx: 0, dy: 0, v: 0, t: 0, dur, delay: 0, seed: Math.random(), ...o });

// Wertet einen Effekt aus; gibt die Stärke des Wackelns zurück (oder -1, wenn er nicht hierher gehört)
export function hunterFx(f: Fx): number {
  const cx = (x: number) => x * TS + 8, cy = (y: number) => y * TS + 8;
  switch (f.k) {
    case 'charge': {
      charges.set(f.id, 0.9);
      const [c0, c1] = HUNT_COL[f.kind] ?? ['#b13e53', '#f4f4f4'];
      eff('charge', f.x, f.y, 0.5, { seed: f.kind === 'scythe' ? 1 : 0 });
      // Funken ziehen sich zur Gestalt zusammen
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, r = 18 + Math.random() * 6;
        parts.push({ x: cx(f.x) + Math.cos(a) * r, y: cy(f.y) - 4 + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.4, vy: -Math.sin(a) * r * 2.4, col: k % 2 ? c0 : c1, t: 0, life: 0.4, g: 0, s: 1 });
      }
      sfx('zap');
      return 1;
    }
    case 'leap':
      leaps.set(f.id, 0);
      eff('dust', f.x0, f.y0, 0.4);
      burst(cx(f.x0), cy(f.y0) + 5, 10, ['#8a5a3a', '#566c86', '#94b0c2'], 20, 60, 10, 120);
      sfx('hit');
      return 0;
    case 'quake':
      eff('quake', f.x, f.y, 0.5);
      burst(cx(f.x), cy(f.y) + 5, 22, ['#8a5a3a', '#5a3a28', '#94b0c2', f.col], 40, 120, 60, 260);
      sfx('boom');
      return 7;
    case 'sweep':
      eff('sweep', f.x, f.y, 0.32);
      burst(cx(f.x), cy(f.y) + 4, 14, ['#38b764', '#a7f070', '#94b0c2'], 50, 110, 20, 150);
      sfx('hit');
      return 6;
    case 'tentacle':
      eff('tent', f.x, f.y, 0.6, { delay: Math.random() * 0.08 });
      burst(cx(f.x), cy(f.y) + 4, 10, ['#5d275d', '#9a4fc0', '#5a3a28', '#333c57'], 30, 90, 70, 260);
      sfx('crack');
      return 5;
    case 'breath': {
      eff('breath', f.x, f.y, 0.55, { dx: f.dx, dy: f.dy });
      sfx('boom');
      return 6;
    }
    case 'meteor':
      eff('meteor', f.x, f.y, 0.42, { delay: Math.random() * 0.18 });
      return 0;
    case 'gaze':
      eff('gaze', f.x0, f.y0, 0.5, { x1: f.x1, y1: f.y1 });
      burst(cx(f.x0), cy(f.y0) - 6, 10, ['#ffcd75', '#f4f4f4'], 20, 60, 10, 0, 0.4, 1);
      sfx('zap');
      return 4;
    case 'roar':
      eff('roar', f.x, f.y, 0.7);
      burst(cx(f.x), cy(f.y) - 4, 24, ['#b13e53', '#ef7d57', '#6b1d2a'], 30, 100, 30, 40, 0.8);
      sfx('level');
      return 7;
    case 'blink':
      eff('blink', f.x, f.y, 0.55);
      burst(cx(f.x), cy(f.y), 18, ['#9a4fc0', '#5d275d', '#0d0e17', '#d08cff'], 10, 50, 30, -40, 0.9);
      sfx('zap');
      return 0;
    case 'reap':
      eff('reap', f.x, f.y, 0.4, { v: f.v });
      burst(cx(f.x), cy(f.y), 16, ['#d08cff', '#c9d4dc', '#9a4fc0'], 40, 120, 20, 80);
      sfx('hit');
      return 9;
    case 'die':
      if (!MOBS[f.kind]?.hunter) return -1;
      // Jägertod: Seele steigt in einer roten Säule auf
      eff('soul', f.x, f.y, 1.1);
      eff('roar', f.x, f.y, 0.6);
      burst(cx(f.x), cy(f.y), 40, ['#b13e53', '#d08cff', '#ffcd75', '#6b1d2a'], 30, 140, 50, 60, 1);
      return -1; // der normale Tod läuft trotzdem
  }
  return -1;
}

// Aura unter dem Jäger: kreisender Runenring, Rauch, rotes Licht; beim Ausholen glüht er
export function drawHunterAura(ctx: CanvasRenderingContext2D, a: Actor, q: { x: number; y: number }, bx: number, foot: number, time: number, dt: number, lights: Light[]) {
  const rage = !!a.st.rage, armed = !!a.zone || !!a.st.zt, cx = bx + 8, cy = foot - 1;
  const col = rage ? '#ef7d57' : '#b13e53', hi = rage ? '#ffcd75' : '#ef7d57';
  const n = 28, rx = 13 + (armed ? Math.sin(time * 14) : 0), ry = 4.5;
  for (let k = 0; k < n; k++) {
    if (k % 4 === 3) continue;
    const ang = (k / n) * Math.PI * 2 + time * (rage ? 3 : 1.4);
    const px = Math.round(cx + Math.cos(ang) * rx), py = Math.round(cy + Math.sin(ang) * ry);
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(time * 4 + k);
    ctx.fillStyle = k % 4 === 0 ? hi : col; ctx.fillRect(px, py, k % 4 === 0 ? 2 : 1, 1);
  }
  // innere Glyphen: vier Zacken, gegenläufig
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 - time * 0.9;
    ctx.globalAlpha = 0.5; ctx.fillStyle = col;
    ctx.fillRect(Math.round(cx + Math.cos(ang) * 7), Math.round(cy + Math.sin(ang) * 2.4), 2, 1);
  }
  ctx.globalAlpha = 1;
  if (!reducedFx() && Math.random() < dt * (rage ? 14 : 6))
    parts.push({ x: q.x * TS + 2 + Math.random() * 12, y: q.y * TS + 10 + Math.random() * 4, vx: (Math.random() - 0.5) * 6, vy: -8 - Math.random() * 10, col: rage ? (Math.random() < 0.5 ? '#b13e53' : '#ef7d57') : (Math.random() < 0.5 ? '#5d275d' : '#6b1d2a'), t: 0, life: 0.9, g: -12, s: Math.random() < 0.3 ? 2 : 1 });
  lights.push({ x: q.x, y: q.y, r: (rage ? 3 : 2.3) + (armed ? 0.6 * Math.sin(time * 12) : 0), col, a: 0.6 });
}

// Leuchten der Gestalt (Raserei rot, Ausholen in der Farbe des Angriffs)
export function hunterGlow(a: Actor, time: number): [string, number] | null {
  const c = charges.get(a.id);
  if (a.zone || a.st.zt) return [HUNT_COL[a.st.zt ? 'scythe' : a.zk ?? '']?.[1] ?? '#f4f4f4', 0.06 + 0.08 * Math.max(0, Math.sin(time * 14))];
  if (c) return ['#f4f4f4', c * 0.25];
  if (a.st.rage) return ['#b13e53', 0.12 + 0.1 * Math.sin(time * 10)];
  return null;
}

// Lebensbalken der Jäger: breit, mit Rahmen und Schädel – immer sichtbar
export function drawHunterBar(ctx: CanvasRenderingContext2D, a: Actor, bx: number, top: number, time: number) {
  const w = 26, hx = bx + 8 - w / 2 + 3, hy = top - 6;
  ctx.fillStyle = '#0d0e17'; ctx.fillRect(hx - 1, hy - 1, w + 2, 5);
  ctx.fillStyle = '#6b1d2a'; ctx.fillRect(hx, hy, w, 3);
  ctx.fillStyle = a.st.rage ? (Math.sin(time * 10) > 0 ? '#ef7d57' : '#b13e53') : '#b13e53'; ctx.fillRect(hx, hy, Math.ceil(w * Math.max(0, a.hp) / a.maxHp), 3);
  ctx.fillStyle = '#f4f4f4'; ctx.globalAlpha = 0.35; ctx.fillRect(hx, hy, Math.ceil(w * Math.max(0, a.hp) / a.maxHp), 1); ctx.globalAlpha = 1;
  // Schädel links
  const sx = hx - 7, sy = hy - 2;
  ctx.fillStyle = '#0d0e17'; ctx.fillRect(sx - 1, sy - 1, 7, 8);
  ctx.fillStyle = '#d9cfb4'; ctx.fillRect(sx, sy, 5, 4); ctx.fillRect(sx + 1, sy + 4, 3, 2);
  ctx.fillStyle = a.st.rage ? '#ef7d57' : '#b13e53'; ctx.fillRect(sx + 1, sy + 1, 1, 2); ctx.fillRect(sx + 3, sy + 1, 1, 2);
}

// Warnfelder: rote Fläche zeichnet draw.ts; hier das Bild je Angriffsart darüber
export function drawHunterMarks(ctx: CanvasRenderingContext2D, run: Run, ox: number, oy: number, time: number, lights: Light[]) {
  for (const mk of hunterMarks(run)) {
    if (!run.seen[mk.i]) continue;
    const tx = mk.i % W, ty = (mk.i / W) | 0, x = tx * TS + ox, y = ty * TS + oy;
    const [c0, c1] = HUNT_COL[mk.k] ?? ['#b13e53', '#f4f4f4'];
    const pulse = 0.5 + 0.5 * Math.sin(time * 10 + mk.i);
    ctx.globalAlpha = 0.25 + 0.2 * pulse; ctx.fillStyle = c0; ctx.fillRect(x + 2, y + 2, TS - 4, TS - 4);
    ctx.globalAlpha = 0.7 + 0.3 * pulse; ctx.fillStyle = c1;
    switch (mk.k) {
      case 'leap': // Fadenkreuz mit Krallen
        ctx.fillRect(x + 7, y + 2, 2, 4); ctx.fillRect(x + 7, y + 10, 2, 4); ctx.fillRect(x + 2, y + 7, 4, 2); ctx.fillRect(x + 10, y + 7, 4, 2);
        break;
      case 'tail': case 'sweep':
        for (let k = 0; k < 4; k++) ctx.fillRect(x + 3 + k * 3, y + 12 - k * 2, 2, 1);
        break;
      case 'tent': { // Risse und aufsteigende Blasen
        ctx.fillStyle = '#d08cff';
        ctx.fillRect(x + 4, y + 8, 3, 1); ctx.fillRect(x + 7, y + 7, 2, 1); ctx.fillRect(x + 9, y + 8, 3, 1); ctx.fillRect(x + 7, y + 9, 1, 3);
        const b = (time * 1.6 + mk.i * 0.37) % 1;
        ctx.fillRect(x + 5 + ((mk.i * 3) % 6), Math.round(y + 12 - b * 9), 1, 1);
        break;
      }
      case 'breath': case 'rain': { // flackernde Flammenzungen; Feuerregen: wachsender Schatten
        if (mk.k === 'rain') {
          const r = 3 + 3 * pulse;
          ctx.globalAlpha = 0.5; ctx.fillStyle = '#0d0e17';
          ctx.beginPath(); ctx.ellipse(x + 8, y + 9, r + 1, (r + 1) * 0.6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffcd75'; ctx.fillRect(x + 7, y + 8, 2, 2);
        } else for (let k = 0; k < 3; k++) {
          const h = 3 + Math.round(3 * Math.abs(Math.sin(time * 13 + k * 2 + mk.i)));
          ctx.fillStyle = k === 1 ? '#ffcd75' : '#ef7d57'; ctx.fillRect(x + 4 + k * 3, y + 13 - h, 2, h);
        }
        break;
      }
      case 'gaze': { // goldener Strahl durch die Feldmitte und ein Auge
        const v = mk.x0 === tx;
        if (v) ctx.fillRect(x + 7, y, 2, TS); else ctx.fillRect(x, y + 7, TS, 2);
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffcd75'; ctx.fillRect(x + 5, y + 6, 6, 4);
        ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x + 7, y + 6, 2, 4);
        break;
      }
      case 'scythe': // Sichel
        for (let k = -4; k <= 4; k++) ctx.fillRect(x + 8 + k, Math.round(y + 6 + (k * k) / 5), 1, 1);
        ctx.fillRect(x + 7, y + 10, 2, 3);
        break;
    }
    ctx.globalAlpha = 1;
    lights.push({ x: tx, y: ty, r: 1.4 + 0.3 * pulse, col: c0, a: 0.7 });
  }
}

// Effekte und Teilchen fortschreiben und zeichnen (vor dem Licht)
export function stepHunterFx(ctx: CanvasRenderingContext2D, ox: number, oy: number, dt: number, lights: Light[], time: number) {
  for (const [id, t] of leaps) { if (t + dt > LEAP_T) leaps.delete(id); else leaps.set(id, t + dt); }
  for (const [id, t] of charges) { if (t - dt <= 0) charges.delete(id); else charges.set(id, t - dt); }
  for (let i = effs.length - 1; i >= 0; i--) {
    const e = effs[i];
    if (e.delay > 0) { e.delay -= dt; continue; }
    e.t += dt;
    if (e.t > e.dur) { effs.splice(i, 1); continue; }
    const f = e.t / e.dur, cx = e.x * TS + 8 + ox, cy = e.y * TS + 8 + oy;
    switch (e.k) {
      case 'charge': { // zusammenlaufender Ring
        const r = 20 * (1 - f) + 4, steps = 26;
        ctx.globalAlpha = f; ctx.fillStyle = e.seed ? '#d08cff' : '#f4f4f4';
        for (let k = 0; k < steps; k++) { const a = (k / steps) * Math.PI * 2 + f * 3; ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy - 4 + Math.sin(a) * r), 1, 1); }
        break;
      }
      case 'dust': case 'quake': { // Staubring am Boden, beim Aufprall mit Erdspalten
        const r = (e.k === 'quake' ? 26 : 12) * Math.sqrt(f), steps = 40;
        ctx.globalAlpha = 1 - f; ctx.fillStyle = '#94b0c2';
        for (let k = 0; k < steps; k++) { const a = (k / steps) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + 5 + Math.sin(a) * r * 0.45), 2, 1); }
        if (e.k === 'quake') {
          ctx.fillStyle = '#1a1c2c';
          for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + e.seed * 6; for (let d = 3; d < 4 + f * 14; d++) ctx.fillRect(Math.round(cx + Math.cos(a) * d + Math.sin(d * 1.7 + k) ), Math.round(cy + 5 + Math.sin(a) * d * 0.45), 1, 1); }
          lights.push({ x: e.x, y: e.y, r: 3 * (1 - f) + 1, col: '#a7f070', a: 0.6 });
        }
        break;
      }
      case 'sweep': { // Schwanz zieht einen grünen Kreisbogen
        const a0 = e.seed * 6, steps = 30;
        for (let k = 0; k < steps; k++) {
          const g = k / steps; if (g > f * 1.3) break;
          const a = a0 + g * Math.PI * 2, r = 15;
          ctx.globalAlpha = (1 - f) * (0.4 + 0.6 * g); ctx.fillStyle = g > 0.8 ? '#f4f4f4' : '#a7f070';
          ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.7), 3, 2);
        }
        break;
      }
      case 'tent': { // Tentakel schießt aus dem Boden, krümmt sich und sinkt zurück
        const h = Math.round(22 * Math.sin(Math.min(1, f * 1.4) * Math.PI)), sway = Math.sin(time * 9 + e.seed * 7) * 3;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#1a1c2c'; ctx.beginPath(); ctx.ellipse(cx, cy + 5, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < h; k++) {
          const g = k / 22, w = Math.max(1, Math.round(5 * (1 - g))), xx = Math.round(cx + sway * g * g - w / 2), yy = Math.round(cy + 5 - k);
          ctx.fillStyle = '#5d275d'; ctx.fillRect(xx - 1, yy, w + 2, 1);
          ctx.fillStyle = k % 4 === 1 ? '#d08cff' : '#9a4fc0'; ctx.fillRect(xx, yy, w, 1);
        }
        if (h > 18) { ctx.fillStyle = '#d08cff'; ctx.fillRect(Math.round(cx + sway - 2), Math.round(cy + 5 - h - 1), 3, 2); }
        lights.push({ x: e.x, y: e.y, r: 1.8, col: '#9a4fc0', a: 0.7 });
        break;
      }
      case 'breath': { // Feuerkegel: Flammen strömen nach vorn
        for (let n = 0; n < 6; n++) {
          const d = Math.random() * 4.4 * Math.min(1, f * 3), spread = d >= 2.5 ? 1.4 : 0.5, s = (Math.random() - 0.5) * 2 * spread;
          const px = e.x + 0.5 + e.dx * (d + 0.4) + (e.dy ? s : 0), py = e.y + 0.5 + e.dy * (d + 0.4) + (e.dx ? s : 0);
          if (f < 0.75) parts.push({ x: px * TS, y: py * TS, vx: e.dx * 50 + (Math.random() - 0.5) * 20, vy: e.dy * 50 - 20 - Math.random() * 20, col: ['#f4f4f4', '#ffcd75', '#ef7d57', '#b13e53'][(d * 1.1) | 0] ?? '#b13e53', t: 0, life: 0.4, g: -40, s: d < 1.5 ? 3 : 2 });
        }
        for (let d = 1; d <= 4; d++) lights.push({ x: e.x + e.dx * d, y: e.y + e.dy * d, r: 2.4 * (1 - f) + 0.5, col: '#ef7d57', a: 0.8 });
        break;
      }
      case 'meteor': { // Brocken fällt schräg vom Himmel, schlägt ein
        const fall = Math.min(1, f / 0.55), hx = cx + 26 * (1 - fall), hy = cy - 70 * (1 - fall);
        if (fall < 1) {
          for (let k = 0; k < 10; k++) { ctx.globalAlpha = 1 - k / 10; ctx.fillStyle = k < 2 ? '#f4f4f4' : k < 5 ? '#ffcd75' : '#ef7d57'; ctx.fillRect(Math.round(hx + k * 1.2), Math.round(hy - k * 2.8), 3 - (k > 5 ? 1 : 0), 3 - (k > 5 ? 1 : 0)); }
          ctx.globalAlpha = 0.4 * fall; ctx.fillStyle = '#0d0e17'; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 2 + 5 * fall, (2 + 5 * fall) * 0.5, 0, 0, Math.PI * 2); ctx.fill();
          lights.push({ x: (hx - ox - 8) / TS, y: (hy - oy - 8) / TS, r: 2, col: '#ef7d57', a: 0.8 });
        } else {
          if (!e.v) { e.v = 1; burst(cx - ox, cy - oy, 16, ['#ffcd75', '#ef7d57', '#f4f4f4', '#5a3a28'], 40, 110, 50); sfx('boom'); }
          const g = (f - 0.55) / 0.45, r = 3 + g * 12;
          ctx.globalAlpha = 1 - g;
          ctx.fillStyle = g < 0.3 ? '#f4f4f4' : '#ffcd75'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ef7d57'; for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), 2, 2); }
          lights.push({ x: e.x, y: e.y, r: 4 * (1 - g) + 1, col: '#ffcd75' });
        }
        break;
      }
      case 'gaze': { // goldener Blickstrahl mit Steinsplittern
        const x1 = e.x1 * TS + 8 + ox, y1 = e.y1 * TS + 8 + oy, n = Math.max(1, Math.hypot(x1 - cx, y1 - cy)), head = Math.min(1, f * 4);
        for (let k = 0; k < n * head; k += 1) {
          const px = cx + ((x1 - cx) * k) / n, py = cy - 6 + ((y1 - cy + 6) * k) / n, w = 3 + Math.sin(k * 0.5 + time * 30);
          ctx.globalAlpha = (1 - f) * 0.9; ctx.fillStyle = '#ffcd75';
          ctx.fillRect(Math.round(px - (y1 === cy ? 0 : w / 2)), Math.round(py - (y1 === cy ? w / 2 : 0)), y1 === cy ? 1 : w, y1 === cy ? w : 1);
          ctx.fillStyle = '#f4f4f4'; ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
        }
        for (let k = 1; k <= Math.round(n / TS); k++) lights.push({ x: e.x + ((e.x1 - e.x) * k * TS) / n, y: e.y + ((e.y1 - e.y) * k * TS) / n, r: 1.8 * (1 - f) + 0.4, col: '#ffcd75', a: 0.8 });
        break;
      }
      case 'roar': { // drei rote Druckringe
        for (let k = 0; k < 3; k++) {
          const g = f * 1.4 - k * 0.2; if (g <= 0 || g >= 1) continue;
          const r = 6 + g * 34, steps = 48;
          ctx.globalAlpha = 1 - g; ctx.fillStyle = k ? '#b13e53' : '#ef7d57';
          for (let s = 0; s < steps; s++) { const a = (s / steps) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy - 4 + Math.sin(a) * r * 0.75), 2, 1); }
        }
        lights.push({ x: e.x, y: e.y, r: 4 * (1 - f) + 1, col: '#b13e53' });
        break;
      }
      case 'blink': { // Schattensäule
        const h = 28 * Math.sin(f * Math.PI);
        for (let k = 0; k < h; k += 2) { ctx.globalAlpha = (1 - k / 28) * (1 - f * 0.5); ctx.fillStyle = k % 4 ? '#5d275d' : '#9a4fc0'; const w = 10 - k / 4 + Math.sin(time * 20 + k) * 2; ctx.fillRect(Math.round(cx - w / 2), Math.round(cy + 6 - k), Math.round(w), 2); }
        lights.push({ x: e.x, y: e.y, r: 2.6 * (1 - f) + 0.5, col: '#9a4fc0' });
        break;
      }
      case 'reap': { // riesige Sichel quer über den Bogen
        const steps = 36;
        for (let k = 0; k < steps; k++) {
          const g = k / steps; if (g > f * 2) break;
          const s = (g - 0.5) * 3.4 * TS, bend = (1 - ((g - 0.5) * 2) ** 2) * 9;
          const px = e.v ? cx - bend : cx + s, py = e.v ? cy + s : cy - bend;
          ctx.globalAlpha = 1 - f; ctx.fillStyle = Math.abs(g - 0.5) < 0.3 ? '#f4f4f4' : '#d08cff';
          ctx.fillRect(Math.round(px), Math.round(py), 3, 3);
        }
        lights.push({ x: e.x, y: e.y, r: 4 * (1 - f) + 1, col: '#d08cff' });
        break;
      }
      case 'soul': { // rote Seelensäule nach dem Tod eines Jägers
        const h = 60 * Math.min(1, f * 2);
        for (let k = 0; k < h; k += 2) { ctx.globalAlpha = (1 - f) * (1 - k / 60); ctx.fillStyle = k % 6 ? '#b13e53' : '#ffcd75'; const w = 6 + Math.sin(k * 0.3 + time * 12) * 2; ctx.fillRect(Math.round(cx - w / 2), Math.round(cy + 4 - k), Math.round(w), 2); }
        lights.push({ x: e.x, y: e.y - 1, r: 5 * (1 - f) + 1, col: '#b13e53' });
        break;
      }
    }
    ctx.globalAlpha = 1;
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const b = parts[i];
    b.t += dt;
    if (b.t > b.life) { parts.splice(i, 1); continue; }
    b.vy += b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    ctx.globalAlpha = 1 - b.t / b.life;
    ctx.fillStyle = b.col; ctx.fillRect(Math.round(b.x) + ox, Math.round(b.y) + oy, b.s, b.s);
  }
  ctx.globalAlpha = 1;
}

// Versteinerter Held: grauer Überzug mit Rissen
export function stoneOverlay(ctx: CanvasRenderingContext2D, blitMask: () => void, dx: number, dy: number, w: number) {
  ctx.globalAlpha = 0.6; blitMask(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#566c86';
  const c = dx + (w >> 1);
  ctx.fillRect(c - 2, dy + 5, 1, 3); ctx.fillRect(c - 1, dy + 8, 1, 2); ctx.fillRect(c + 2, dy + 11, 1, 3); ctx.fillRect(c + 1, dy + 14, 1, 1);
}
