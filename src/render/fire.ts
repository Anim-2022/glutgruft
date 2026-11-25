// Feuer, Rauch und Glut (nur Darstellung).
// - Flammen: einzelne Zungen, deren Höhe mit der Restdauer des Feuers wächst und im Wind wiegt
// - Rauch: gerasterte Schwaden, die aufsteigen, wachsen und verblassen
// - Glut: frisch verbrannter Boden glimmt einige Sekunden nach
import type { Light } from './light';

const TS = 16;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const hs = (x: number, y: number, s: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0;

// Fire tile (rendering only). k: strength 0..1 from turns left; nb: burning neighbours (1 up, 2 left, 4 right, 8 down);
// kind: what burns (oil burns wide and low, grass in many thin tongues); age: seconds since this tile caught fire.
// Lifecycle: ignition flare (tall, white core) → full burn → dying (low, red, sparse); neighbours share one ember bed.
export type FireKind = 'plain' | 'grass' | 'oil';
type Pal = [string, string, string, string]; // rim, body, core, foot
const PAL_FULL: Pal = ['#b13e53', '#ef7d57', '#ffcd75', '#fff3c4'];
const PAL_FLARE: Pal = ['#ef7d57', '#ffcd75', '#fff3c4', '#f4f4f4'];
const PAL_DYING: Pal = ['#7d2b45', '#b13e53', '#ef7d57', '#ffcd75'];
const PAL_OIL: Pal = ['#7d2b45', '#b13e53', '#ef7d57', '#ffcd75'];

function flame(ctx: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number, ph: number, time: number, lean: number, pal: Pal) {
  for (let r = 0; r < h; r++) {
    const f = r / h, hw = Math.max(0.5, (w / 2) * Math.pow(1 - f, 0.75) * (0.85 + 0.15 * Math.sin(time * 13 + ph + r)));
    const sx = (Math.sin(time * 6 + ph + f * 2.5) * 2.4 + lean) * f, x0 = Math.round(cx + sx - hw), x1 = Math.round(cx + sx + hw), yy = base - r;
    for (let x = x0; x < Math.max(x0 + 1, x1); x++) {
      const e = Math.abs(x + 0.5 - (cx + sx)) / Math.max(1, hw);
      ctx.fillStyle = e > 0.7 || f > 0.85 ? pal[0] : e > 0.35 || f > 0.6 ? pal[1] : f < 0.2 ? pal[3] : pal[2];
      ctx.fillRect(x, yy, 1, 1);
    }
    // the tip breaks into a loose pixel now and then
    if (r === h - 1 && Math.sin(time * 17 + ph) > 0.6) { ctx.fillStyle = pal[0]; ctx.fillRect(Math.round(cx + sx), yy - 2, 1, 1); }
  }
}
const beds = new Map<number, HTMLCanvasElement>();
function bedTile(nb: number, lvl: number, dying: boolean, v: number): HTMLCanvasElement {
  const key = ((nb * 4 + lvl) * 2 + (dying ? 1 : 0)) * 2 + v;
  let c = beds.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = TS;
  const g = c.getContext('2d')!, dens0 = (lvl + 1) / 6;
  for (let yy = 0; yy < TS; yy++) for (let xx = 0; xx < TS; xx++) {
    const ex = xx < 3 && !(nb & 2) ? (3 - xx) / 3 : xx > 12 && !(nb & 4) ? (xx - 12) / 3 : 0;
    const ey = yy < 6 && !(nb & 1) ? (6 - yy) / 6 : yy > 13 && !(nb & 8) ? (yy - 13) / 2 : 0;
    if (BAYER[(yy & 3) * 4 + (xx & 3)] > dens0 - Math.max(ex, ey) * 0.5) continue;
    const hot = hs(xx + v * 16, yy, 5) % 7;
    g.fillStyle = hot === 0 && !dying ? '#ef7d57' : hot < 3 ? '#b13e53' : '#7d2b45';
    g.fillRect(xx, yy, 1, 1);
  }
  beds.set(key, c);
  return c;
}
// shared wind: all flames sway together, slowly changing direction
const wind = (time: number) => Math.sin(time * 0.6) * 1.2 + Math.sin(time * 1.7) * 0.4;

export function drawFlames(ctx: CanvasRenderingContext2D, dx: number, dy: number, x: number, y: number, k: number, time: number,
  nb = 0, kind: FireKind = 'plain', age = 9, shimmer = false) {
  const h0 = hs(x, y, 3), ph = (h0 % 628) / 100, base = dy + 11 + (h0 % 4); // staggered so a field has no rows
  const flare = age < 0.25 ? 1 - age / 0.25 : 0, dying = k <= 0.34;
  const pal = flare > 0.3 ? PAL_FLARE : kind === 'oil' ? PAL_OIL : dying ? PAL_DYING : PAL_FULL;
  // ember bed: dithered, reaches into burning neighbours so a fire field reads as one
  // the bed spans the tile; toward burning neighbours it stays dense, toward cold floor it frays (cached)
  const lvl = Math.min(3, Math.max(0, Math.round((0.5 + 0.2 * Math.sin(time * 4 + ph)) * (0.55 + 0.45 * k) * 6) - 1));
  ctx.drawImage(bedTile(nb, lvl, dying, h0 & 1), dx, dy);
  const flick = (p: number) => 0.7 + 0.3 * Math.abs(Math.sin(time * 8 + p));
  // lean into the wind and toward burning neighbours (flames of a field merge)
  const lean = wind(time) + (nb & 4 ? 0.8 : 0) - (nb & 2 ? 0.8 : 0);
  const grow = 1 + flare * 0.7, low = kind === 'oil' ? 0.6 : 1;
  if (kind === 'grass') {
    // many thin tongues
    for (let j = 0; j < (dying ? 2 : 4); j++) {
      const hj = hs(x, y, 31 + j), pj = (hj % 628) / 100;
      flame(ctx, dx + 2 + (hj % 12), base, 2 + k, Math.max(2, Math.round((3 + 6 * k) * flick(pj) * grow)), pj, time, lean, pal);
    }
  } else {
    const mw = kind === 'oil' ? 7 + 3 * k : 4 + 3 * k;
    flame(ctx, dx + 7 + (h0 % 3) - 1, base, mw, Math.max(3, Math.round((4 + 8 * k) * flick(ph) * grow * low)), ph, time, lean, pal);
    const side = dying ? 1 : k > 0.5 || kind === 'oil' ? 2 : 1;
    for (let j = 0; j < side; j++) {
      const hj = hs(x, y, 11 + j), pj = (hj % 628) / 100, sxj = dx + 2 + (hj % 12);
      flame(ctx, sxj, base, (2 + 2 * k) * (kind === 'oil' ? 1.4 : 1), Math.max(2, Math.round((2 + 5 * k) * flick(pj) * grow * low)), pj, time, lean, pal);
    }
  }
  // heat shimmer: the air above strong fire wobbles by a pixel (copies the frame onto itself)
  if (shimmer && k > 0.6 && !dying) {
    const off = Math.round(Math.sin(time * 11 + ph) * 1), cvs = ctx.canvas;
    if (off) {
      const sx = Math.max(0, dx), sy = Math.max(0, dy - 10);
      if (sx + TS <= cvs.width && sy + 8 <= cvs.height) { ctx.globalAlpha = 0.35; ctx.drawImage(cvs, sx, sy, TS, 8, sx + off, sy, TS, 8); ctx.globalAlpha = 1; }
    }
  }
}

// When each fire tile caught fire (for the ignition flare); keyed by tile index
const litAt = new Map<number, number>();
export function fireAge(i: number, time: number): number {
  let t0 = litAt.get(i);
  if (t0 === undefined) litAt.set(i, (t0 = time));
  return time - t0;
}
// forget tiles that no longer burn
export function pruneFire(fire: Map<number, number>) { for (const i of litAt.keys()) if (!fire.has(i)) litAt.delete(i); }

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
export function resetFire() { puffs.length = 0; burnAt.clear(); prevKey = ''; litAt.clear(); }
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
