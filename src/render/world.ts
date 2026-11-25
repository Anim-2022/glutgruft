// Destructible world (rendering only): oil and water puddles, cobwebs, poison clouds, debris per material.
// Palette colours only; randomness via Math.random or fixed hashes; never writes to the run.
import { TS } from './gfx';
import { W, T } from '../game/dungeon';
import type { Run, Mat } from '../game/run';
import { softEdged } from './tiles';

const mk = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas'); c.width = c.height = TS;
  return [c, c.getContext('2d')!];
};
const hh = (x: number, y: number, s: number) => ((Math.imul(x + 11, 73856093) ^ Math.imul(y + 5, 19349663) ^ Math.imul(s, 83492791)) >>> 0);

// ---------- puddles ----------
let oilT: HTMLCanvasElement[] | null = null, waterT: HTMLCanvasElement[] | null = null;
function puddle(base: string, mid: string, hi: string, alpha: number, v: number): HTMLCanvasElement {
  const [c, g] = mk();
  g.globalAlpha = alpha;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const h = hh(x, y, v) % 100;
    g.fillStyle = h < 18 ? mid : base;
    g.fillRect(x, y, 1, 1);
  }
  g.globalAlpha = 1;
  g.fillStyle = hi;
  for (let k = 0; k < 3; k++) { const h = hh(k, v, 77); g.fillRect(2 + (h % 11), 3 + ((h >>> 5) % 10), 2 + (k & 1), 1); }
  return c;
}
const oilTiles = () => (oilT ??= [0, 1, 2].map(v => puddle('#1a1c2c', '#333c57', '#566c86', 0.86, v)));
const waterTiles = () => (waterT ??= [0, 1, 2].map(v => puddle('#29366f', '#3b5dc9', '#73eff7', 0.7, v + 10)));

// ---------- cobwebs: strands from the corner between two walls ----------
let webT: HTMLCanvasElement[] | null = null;
function webTiles(): HTMLCanvasElement[] {
  if (webT) return webT;
  const [c, g] = mk();
  g.fillStyle = '#c9d4dc';
  // radial threads from the top-left corner
  for (const [ex, ey] of [[15, 2], [13, 8], [9, 13], [2, 15], [15, 11]]) {
    const n = Math.max(ex, ey);
    for (let k = 0; k <= n; k += 1) g.fillRect(Math.round((ex * k) / n), Math.round((ey * k) / n), 1, 1);
  }
  // rings across the threads
  g.globalAlpha = 0.7;
  for (const r of [4, 8, 12]) for (let a = 0; a <= 90; a += 6) {
    const rad = (a * Math.PI) / 180;
    g.fillRect(Math.round(Math.cos(rad) * r), Math.round(Math.sin(rad) * r), 1, 1);
  }
  g.globalAlpha = 1;
  const flip = (sx: number, sy: number) => { const [d, dg] = mk(); dg.translate(sx < 0 ? TS : 0, sy < 0 ? TS : 0); dg.scale(sx, sy); dg.drawImage(c, 0, 0); return d; };
  return (webT = [c, flip(-1, 1), flip(1, -1), flip(-1, -1)]);
}

// edge bits as in draw.ts: open sides blend into the floor
function edgeOf(run: Run, i: number, k: number) {
  let e = 0;
  [[0, -1, 1], [-1, 0, 2], [1, 0, 4], [0, 1, 8]].forEach(([ex, ey, bit]) => { const n = run.tiles[i + ey * W + ex]; if (n !== k && n !== T.WALL && n !== T.CRACKED) e |= bit; });
  return e;
}

// Called in the floor pass for walkable world tiles
export function drawWorldTile(ctx: CanvasRenderingContext2D, run: Run, t: number, i: number, x: number, y: number, dx: number, dy: number, time: number) {
  if (t === T.OIL) {
    const v = hh(x, y, 3) % 3;
    ctx.drawImage(softEdged(oilTiles()[v], edgeOf(run, i, T.OIL)), dx, dy);
    // oily sheen drifting across
    const ph = (time * 0.7 + (x + y) * 0.21) % 1;
    if (ph < 0.25) { ctx.fillStyle = '#9a4fc0'; ctx.fillRect(dx + 3 + Math.round(ph * 36), dy + 6 + (v * 3), 2, 1); ctx.fillStyle = '#41a6f6'; ctx.fillRect(dx + 5 + Math.round(ph * 36), dy + 6 + (v * 3), 1, 1); }
  } else if (t === T.WATER) {
    const v = hh(x, y, 4) % 3;
    ctx.drawImage(softEdged(waterTiles()[v], edgeOf(run, i, T.WATER)), dx, dy);
    // ripples
    const ph = (time * 1.3 + hh(x, y, 9) % 7) % 3;
    if (ph < 1) {
      const r = 1 + Math.round(ph * 4);
      ctx.globalAlpha = 1 - ph; ctx.fillStyle = '#73eff7';
      ctx.fillRect(dx + 8 - r, dy + 9, 1, 1); ctx.fillRect(dx + 8 + r, dy + 9, 1, 1); ctx.fillRect(dx + 8, dy + 9 - r, 1, 1); ctx.fillRect(dx + 8, dy + 9 + r, 1, 1);
      ctx.globalAlpha = 1;
    }
  } else if (t === T.WEB) {
    // hang from the corner that touches two walls
    const wl = run.tiles[i - 1] === T.WALL, wr = run.tiles[i + 1] === T.WALL, wu = run.tiles[i - W] === T.WALL, wd = run.tiles[i + W] === T.WALL;
    const k = (wr && !wl ? 1 : 0) + (wd && !wu ? 2 : 0);
    ctx.globalAlpha = 0.8; ctx.drawImage(webTiles()[k], dx, dy); ctx.globalAlpha = 1;
  }
}

// ---------- poison cloud (below actors' warnings; at most 45 % cover) ----------
export function drawGas(ctx: CanvasRenderingContext2D, run: Run, ox: number, oy: number, time: number) {
  if (!run.gas?.size) return;
  for (const [i, turns] of run.gas) {
    if (!run.seen[i]) continue;
    const x = i % W, y = (i / W) | 0, dx = x * TS + ox, dy = y * TS + oy;
    ctx.globalAlpha = Math.min(0.42, 0.22 + 0.1 * turns);
    ctx.fillStyle = '#38b764';
    for (let py = 0; py < TS; py += 2) for (let px = (py >> 1) & 1; px < TS; px += 2) {
      const h = hh(x * TS + px, y * TS + py, Math.floor(time * 4));
      if (h % 3) ctx.fillRect(dx + px, dy + py, 1, 1);
    }
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#a7f070';
    for (let k = 0; k < 2; k++) {
      const ph = (time * 0.5 + k * 0.5 + (hh(x, y, k) % 100) / 100) % 1;
      ctx.fillRect(dx + 3 + ((hh(x, y, 20 + k) % 10)), dy + 13 - Math.round(ph * 12), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- debris per material ----------
export const MAT_COLS: Record<Mat, string[]> = {
  wood: ['#8a5a3a', '#5a3a28', '#c98a3a'], stone: ['#94b0c2', '#566c86', '#333c57'], clay: ['#e8b796', '#c48a6a', '#8a5a3a'],
  fungus: ['#9a4fc0', '#5d275d', '#a7f070'], web: ['#c9d4dc', '#94b0c2'], ice: ['#73eff7', '#c9d4dc', '#f4f4f4'],
  metal: ['#8b8f9c', '#4a4d58', '#ffcd75'], oil: ['#ef7d57', '#ffcd75', '#1a1c2c'],
};
export const MAT_SOUND: Record<Mat, 'shatter' | 'crumble' | 'ignite' | 'crack' | 'splash'> = {
  wood: 'crack', stone: 'crumble', clay: 'shatter', fungus: 'splash', web: 'crack', ice: 'shatter', metal: 'crumble', oil: 'ignite',
};
