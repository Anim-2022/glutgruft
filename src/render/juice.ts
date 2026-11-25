// Hit feedback (rendering only): damage numbers, directional shake, screen flashes, floor splatter, tints.
// Randomness via Math.random only; the run is never modified.
import { TS, glyphs } from './gfx';
import { W } from '../game/dungeon';
import type { Run } from '../game/run';
import { fxLevel, fxScale, reducedFx, shakeEnabled } from './fxopts';

// ---------- Damage numbers ----------
type NumKind = 'dmg' | 'crit' | 'dot' | 'miss' | 'heal' | 'text' | 'multi';
interface Num { x: number; y: number; s: string; col: string; t: number; kind: NumKind; size: number; vx: number; life: number; big: boolean }
const nums: Num[] = [];
const NUM_LIFE: Record<NumKind, number> = { dmg: 0.8, crit: 1.05, dot: 0.7, miss: 0.75, heal: 0.85, text: 0.95, multi: 1.1 };

// frac: share of the target's max HP (for size), 0 if unknown
export function addNum(tx: number, ty: number, s: string, col: string, dot: boolean, frac: number) {
  const kind: NumKind = s === 'missed' ? 'miss' : s.startsWith('×') ? 'multi' : s.endsWith('!') && /^\d/.test(s) ? 'crit' : dot ? 'dot'
    : s.startsWith('+') ? 'heal' : /^\d+$/.test(s) ? 'dmg' : 'text';
  const big = kind === 'crit' || kind === 'multi' || (kind === 'dmg' && frac >= 0.45);
  const size = kind === 'dot' || kind === 'miss' ? 8 : big ? 16 : 10;
  // stack numbers on the same tile shortly after each other instead of overlapping
  const stack = nums.filter(n => n.t < 0.15 && Math.abs(n.x - (tx * TS + 8)) < 10 && Math.abs(n.y - ty * TS) < 20).length;
  const vx = kind === 'miss' ? (Math.random() < 0.5 ? -26 : 26) : kind === 'dot' ? 0 : (Math.random() - 0.5) * 24;
  nums.push({ x: tx * TS + 8, y: ty * TS - stack * 9, s, col: kind === 'dot' ? dim(col) : col, t: 0, kind, size, vx, life: NUM_LIFE[kind], big });
  if (nums.length > 60) nums.shift();
}
const dim = (hex: string) => {
  const n = parseInt(hex.slice(1), 16), f = 0.78;
  return `rgb(${((n >> 16) & 255) * f | 0},${((n >> 8) & 255) * f | 0},${(n & 255) * f | 0})`;
};

// Drawn above the darkness so they always stay readable
export function drawNums(ctx: CanvasRenderingContext2D, ox: number, oy: number, dt: number) {
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i];
    n.t += dt;
    if (n.t > n.life) { nums.splice(i, 1); continue; }
    const f = n.t / n.life;
    // pop: briefly larger, then normal; rises with decreasing speed
    const pop = n.t < 0.08 ? 1.5 - (n.t / 0.08) * 0.5 : 1;
    const rise = n.kind === 'dot' ? n.t * 16 : 26 * (1 - (1 - Math.min(1, n.t / 0.6)) ** 2) + Math.max(0, n.t - 0.6) * 8;
    const x = n.x + n.vx * Math.min(n.t, 0.4) + ox, y = n.y - 6 - rise + oy;
    ctx.globalAlpha = f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1;
    const g = glyphs(n.s, n.col, n.size), sh = glyphs(n.s, '#0d0e17', n.size);
    const w = Math.round(g.width * pop), h = Math.round(g.height * pop), dx = Math.round(x - w / 2), dy = Math.round(y - (h - g.height));
    if (n.big) for (const [ax, ay] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(sh, dx + ax, dy + ay, w, h); // outline
    ctx.drawImage(sh, dx + 1, dy + 1, w, h);
    ctx.drawImage(g, dx, dy, w, h);
    // critical hit: two sparks next to the number
    if (n.kind === 'crit' && n.t < 0.35 && Math.floor(n.t * 20) % 2 === 0) {
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(dx - 4, dy + 2, 2, 2); ctx.fillRect(dx + w + 2, dy + h - 5, 2, 2);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- Shake: trauma (quadratic falloff) and a kick in hit direction ----------
let trauma = 0;
const kick = { x: 0, y: 0 };
// n: legacy shake strength in pixels (2 … 9)
export function addShake(n: number, dir: [number, number] | null = null) {
  if (!shakeEnabled() || n <= 0) return;
  trauma = Math.min(1, Math.max(trauma, Math.min(1, n / 9) * Math.min(1.2, fxScale())));
  if (dir && (dir[0] || dir[1])) { const l = Math.hypot(dir[0], dir[1]), k = Math.min(3, 1 + n / 4); kick.x += (dir[0] / l) * k; kick.y += (dir[1] / l) * k; }
}
export function stepShake(dt: number): [number, number] {
  if (!shakeEnabled()) { trauma = 0; kick.x = kick.y = 0; return [0, 0]; }
  trauma = Math.max(0, trauma - dt * 2.6);
  const d = Math.exp(-dt * 22); kick.x *= d; kick.y *= d;
  const a = trauma * trauma * 9;
  return [Math.round((Math.random() * 2 - 1) * a + kick.x), Math.round((Math.random() * 2 - 1) * a + kick.y)];
}

// ---------- Screen flashes ----------
let hurtEdge = 0;
export const hurtFlash = () => { if (fxLevel() >= 1) hurtEdge = 0.25; };
// Drawn below numbers and HUD so warnings stay readable
export function drawScreenFlash(ctx: CanvasRenderingContext2D, vw: number, vh: number, dt: number) {
  if (hurtEdge > 0) {
    // red border, open inside (dithered in steps of 2)
    const a = hurtEdge / 0.25;
    ctx.fillStyle = `rgba(177,62,83,${0.55 * a})`;
    const e = Math.round(10 * a) + 2;
    ctx.fillRect(0, 0, vw, e); ctx.fillRect(0, vh - e, vw, e); ctx.fillRect(0, e, e, vh - 2 * e); ctx.fillRect(vw - e, e, e, vh - 2 * e);
    ctx.fillStyle = `rgba(177,62,83,${0.25 * a})`;
    for (let x = e; x < vw - e; x += 2) { ctx.fillRect(x, e + ((x >> 1) & 1), 1, 1); ctx.fillRect(x, vh - e - 1 - ((x >> 1) & 1), 1, 1); }
    hurtEdge = Math.max(0, hurtEdge - dt);
  }
}

// ---------- Floor splatter (stays, fades after a while) ----------
const SPLAT: Record<string, string[]> = {
  blood: ['#b13e53', '#7d2b45', '#6b1d2a'], bone: ['#d9cfb4', '#94b0c2'], spore: ['#38b764', '#a7f070'],
  stone: ['#566c86', '#94b0c2', '#333c5c'], ember: ['#ef7d57', '#1c0f14'], ghost: ['#73eff7', '#c9d4dc'], slime: ['#9a4fc0', '#5d275d'],
};
const SPLAT_OF: Record<string, keyof typeof SPLAT> = {
  ratte: 'blood', fledermaus: 'blood', skelett: 'bone', schuetze: 'bone', sporling: 'spore', golem: 'stone', glutgeist: 'ember',
  koenig: 'bone', mutter: 'spore', fuerst: 'ember', echse: 'blood', krake: 'slime', drache: 'blood', medusa: 'blood', tod: 'ghost', mimik: 'blood',
};
interface Spot { x: number; y: number; col: string; s: number; age: number }
const spots: Spot[] = [];
let spotFloor = -1;
const SPOT_MAX = 160, SPOT_LIFE = 14;
// Splatter of one hit: a few pixels, shifted in hit direction
export function splat(kind: string, tx: number, ty: number, dir: [number, number] | null, n = 5) {
  if (reducedFx()) return;
  const cols = SPLAT[SPLAT_OF[kind] ?? 'blood'];
  const [dx, dy] = dir ?? [0, 0];
  for (let k = 0; k < Math.round(n * fxScale()); k++) {
    const r = 2 + Math.random() * 6;
    spots.push({ x: tx * TS + 8 + dx * r + (Math.random() - 0.5) * 7, y: ty * TS + 11 + dy * r * 0.6 + (Math.random() - 0.5) * 4, col: cols[k % cols.length], s: Math.random() < 0.25 ? 2 : 1, age: 0 });
  }
  if (spots.length > SPOT_MAX) spots.splice(0, spots.length - SPOT_MAX);
}
export const splatKind = (kind: string) => SPLAT_OF[kind] ?? 'blood';
export function drawSpots(ctx: CanvasRenderingContext2D, run: Run, ox: number, oy: number, dt: number) {
  if (spotFloor !== run.floor) { spots.length = 0; spotFloor = run.floor; }
  for (let i = spots.length - 1; i >= 0; i--) {
    const s = spots[i];
    s.age += dt;
    if (s.age > SPOT_LIFE) { spots.splice(i, 1); continue; }
    if (!run.seen[((s.y / TS) | 0) * W + ((s.x / TS) | 0)]) continue;
    ctx.globalAlpha = s.age > SPOT_LIFE - 3 ? (SPOT_LIFE - s.age) / 3 : 0.85;
    ctx.fillStyle = s.col; ctx.fillRect(Math.round(s.x) + ox, Math.round(s.y) + oy, s.s, s.s);
  }
  ctx.globalAlpha = 1;
}
export const spotCount = () => spots.length;

// ---------- Status tint ----------
const tintCache = new Map<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
export function tinted(mask: HTMLCanvasElement, col: string): HTMLCanvasElement {
  let m = tintCache.get(mask);
  if (!m) tintCache.set(mask, (m = new Map()));
  let c = m.get(col);
  if (!c) {
    c = document.createElement('canvas'); c.width = mask.width; c.height = mask.height;
    const g = c.getContext('2d')!;
    g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    m.set(col, c);
  }
  return c;
}

// ---------- Multi-kill ----------
let lastKill = -1, chain = 0;
// returns the number of kills in quick succession (1, 2, 3 …)
export function noteKill(now: number): number {
  chain = now - lastKill < 0.5 ? chain + 1 : 1;
  lastKill = now;
  return chain;
}

export function resetJuice() {
  nums.length = 0; spots.length = 0; spotFloor = -1; trauma = 0; kick.x = kick.y = 0; hurtEdge = 0; lastKill = -1; chain = 0;
}
