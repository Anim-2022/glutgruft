// Feuer, Rauch und Glut (nur Darstellung).
// - Flammen: einzelne Zungen, deren Höhe mit der Restdauer des Feuers wächst und im Wind wiegt
// - Rauch: gerasterte Schwaden, die aufsteigen, wachsen und verblassen
// - Glut: frisch verbrannter Boden glimmt einige Sekunden nach
import type { Light } from './light';

const TS = 16;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const hs = (x: number, y: number, s: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0;

// k: Stärke 0..1 (aus der Restdauer). Zeichnet in das Feld (dx, dy):
// eine Hauptflamme in Tropfenform (dunkelroter Saum, orange, gelber Kern, heller Fuß) und
// ein bis zwei kleine Nebenzungen an festen, je Feld verschiedenen Stellen; alles wiegt und flackert.
function flame(ctx: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number, ph: number, time: number) {
  for (let r = 0; r < h; r++) {
    const f = r / h, hw = Math.max(0.5, (w / 2) * Math.pow(1 - f, 0.75) * (0.85 + 0.15 * Math.sin(time * 13 + ph + r)));
    const sx = Math.sin(time * 6 + ph + f * 2.5) * f * 2.4, x0 = Math.round(cx + sx - hw), x1 = Math.round(cx + sx + hw), yy = base - r;
    for (let x = x0; x < Math.max(x0 + 1, x1); x++) {
      const e = Math.abs(x + 0.5 - (cx + sx)) / Math.max(1, hw);
      ctx.fillStyle = e > 0.7 || f > 0.85 ? '#b13e53' : e > 0.35 || f > 0.6 ? '#ef7d57' : f < 0.2 ? '#fff3c4' : '#ffcd75';
      ctx.fillRect(x, yy, 1, 1);
    }
  }
}
export function drawFlames(ctx: CanvasRenderingContext2D, dx: number, dy: number, x: number, y: number, k: number, time: number) {
  const base = dy + 14, h0 = hs(x, y, 3);
  // Glutbett
  ctx.fillStyle = '#7d2b45'; ctx.fillRect(dx + 3, base + 1, 10, 1);
  ctx.fillStyle = '#b13e53'; ctx.fillRect(dx + 4, base, 8, 1);
  const flick = (ph: number) => 0.7 + 0.3 * Math.abs(Math.sin(time * 8 + ph));
  const ph = (h0 % 628) / 100;
  flame(ctx, dx + 7 + (h0 % 3) - 1, base, 4 + 3 * k, Math.max(3, Math.round((4 + 8 * k) * flick(ph))), ph, time);
  const side = k > 0.5 ? 2 : 1;
  for (let j = 0; j < side; j++) {
    const hj = hs(x, y, 11 + j), pj = (hj % 628) / 100, sxj = dx + 2 + (hj % 12);
    flame(ctx, sxj, base, 2 + 2 * k, Math.max(2, Math.round((2 + 5 * k) * flick(pj))), pj, time);
  }
}

// ---- Rauch ----
interface Puff { x: number; y: number; vx: number; vy: number; t: number; life: number; s: number; dark: boolean; }
const puffs: Puff[] = [];
export function smoke(x: number, y: number, n = 1, strong = false) {
  for (let i = 0; i < n && puffs.length < 160; i++) puffs.push({
    x: x + (Math.random() - 0.5) * (strong ? 18 : 6), y: y + (Math.random() - 0.5) * (strong ? 12 : 4),
    vx: (Math.random() - 0.5) * (strong ? 14 : 4), vy: -6 - Math.random() * (strong ? 14 : 8),
    t: 0, life: 1.2 + Math.random() * (strong ? 1.6 : 1), s: 1.5 + Math.random() * (strong ? 2 : 1), dark: Math.random() < 0.6,
  });
}
export function resetFire() { puffs.length = 0; burnAt.clear(); prevKey = ''; }
export function drawSmoke(ctx: CanvasRenderingContext2D, ox: number, oy: number, dt: number) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.t += dt;
    if (p.t > p.life) { puffs.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 0.8; p.vy *= 1 - dt * 0.3;
    const f = p.t / p.life, r = p.s + f * 4, a = (1 - f) * 0.75;
    const cx = Math.round(p.x + ox), cy = Math.round(p.y + oy), R = Math.ceil(r);
    ctx.fillStyle = p.dark ? '#333c57' : '#566c86';
    for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
      const d = (xx * xx + yy * yy) / (r * r);
      if (d <= 1 && BAYER[((cy + yy) & 3) * 4 + ((cx + xx) & 3)] < a * (1 - d * 0.6)) ctx.fillRect(cx + xx, cy + yy, 1, 1);
    }
  }
}

// ---- Glut auf frisch verbranntem Boden ----
// Zustand der Karte vom letzten Bild; was seitdem zu Brandfläche wurde, glimmt GLOW_T Sekunden
const GLOW_T = 9;
const burnAt = new Map<number, number>();
let prev: Uint8Array | null = null, prevKey = '';
export function trackBurns(tiles: Uint8Array, key: string, burnt: number, time: number) {
  if (prevKey !== key || !prev) { prev = tiles.slice(); prevKey = key; burnAt.clear(); return; }
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === burnt && prev[i] !== burnt) burnAt.set(i, time);
  for (const [i, t0] of burnAt) if (time - t0 > GLOW_T || tiles[i] !== burnt) burnAt.delete(i);
  prev.set(tiles);
}
export function drawEmbers(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, dx: number, dy: number, time: number, lights: Light[]) {
  const t0 = burnAt.get(i);
  if (t0 === undefined) return;
  const f = 1 - (time - t0) / GLOW_T;
  if (f <= 0) return;
  const h = hs(x, y, 7), n = 2 + (h % 3);
  for (let k = 0; k < n; k++) {
    const ex = dx + 2 + ((h >>> (k * 4)) % 12), ey = dy + 3 + ((h >>> (k * 4 + 2)) % 11);
    const on = Math.sin(time * (5 + k) + k * 2 + x) > 0.5 - f;
    ctx.fillStyle = on ? (f > 0.5 ? '#ffcd75' : '#ef7d57') : '#b13e53';
    ctx.fillRect(ex, ey, 1, 1);
  }
  lights.push({ x, y, r: 0.8 + 0.8 * f, col: '#ef7d57', a: 0.55 * f });
}
