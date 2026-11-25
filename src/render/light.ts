// Licht mit Verdeckung. Jede Lichtquelle sieht nur die Felder, zu denen sie freie Sicht hat
// (dieselbe Sichtlinie wie das Sichtfeld des Helden). Die Helligkeit wird in einem Raster aus
// CELL×CELL-Pixelzellen berechnet, in wenigen Stufen mit Bayer-Muster gerastert und dann als
// Dunkelheit und farbiges Glühen über die Szene gelegt – so bleibt der Lichtrand pixelig.
import { W, H, opaque, wallLike, los } from '../game/dungeon';

export interface Light { x: number; y: number; r: number; col?: string; a?: number; }
export interface Ambient { col: [number, number, number]; dark: number; memory: number; }

// je Biom eigene Luft: kalte Gruft, feuchte Höhle, glühende Schmiede
export const AMBIENTS: Ambient[] = [
  { col: [8, 9, 24], dark: 0.82, memory: 0.6 },
  { col: [3, 16, 18], dark: 0.82, memory: 0.6 },
  { col: [20, 7, 9], dark: 0.8, memory: 0.6 },
];

const TS = 16;
export const CELL = 2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const LEVELS = 10;
const WALL_MIN = 0.42; // Wände im Sichtfeld bleiben auch fern vom Licht erkennbar
const GLOW_MAX = 72; // Obergrenze des Farblichts je Kanal: dicht an der Flamme brennt nichts aus
const GLOW_K = 0.2, GLOW_K_SOFT = 0.13, BLOOM = 0.3; // Stärke des Farblichts (kräftige / schwache Quellen) und des Nachglühens

// ---- Sichtbarkeit je Lichtquelle (rein, testbar) ----

// Maske (2R+1)² um das Ursprungsfeld: 1 = das Licht erreicht dieses Feld.
// Sitzt die Quelle selbst in einer Wand (Lava in der Mauerkrone), leuchtet sie nur aus ihren
// offenen Nachbarfeldern heraus – sonst schiene sie in den Fels dahinter.
export function lightMask(tiles: Uint8Array, ox: number, oy: number, R: number): Uint8Array {
  const n = 2 * R + 1, m = new Uint8Array(n * n);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const from: [number, number][] = !opaque(tiles[oy * W + ox]) ? [[ox, oy]]
    : ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([a, b]) => [ox + a, oy + b] as [number, number]).filter(([x, y]) => inside(x, y) && !opaque(tiles[y * W + x]));
  m[R * n + R] = 1;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = ox + dx, y = oy + dy;
    if (!inside(x, y) || dx * dx + dy * dy > (R + 0.5) ** 2) continue;
    if (from.some(([fx, fy]) => (fx === x && fy === y) || los(tiles, fx, fy, x, y))) m[(dy + R) * n + dx + R] = 1;
  }
  return m;
}

// Halbschatten: verdeckter Boden direkt neben beleuchtetem Boden bekommt einen Teil des Lichts,
// damit Schattenkanten an Wandecken weich auslaufen statt am Feldraster abzubrechen.
// Nie durch Wände: nur über offene Nachbarn, diagonal nur, wenn eine der beiden Ecken offen ist.
export function softMask(tiles: Uint8Array, m: Uint8Array, ox: number, oy: number, R: number): { v: Float32Array; op: Uint8Array } {
  const n = 2 * R + 1, v = new Float32Array(n * n), op = new Uint8Array(n * n);
  const T = (gx: number, gy: number) => { const x = ox + gx, y = oy + gy; return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x; };
  const lit = (gx: number, gy: number) => gx >= -R && gy >= -R && gx <= R && gy <= R && m[(gy + R) * n + gx + R] === 1 && T(gx, gy) >= 0 && !opaque(tiles[T(gx, gy)]);
  const open = (gx: number, gy: number) => T(gx, gy) >= 0 && !opaque(tiles[T(gx, gy)]);
  for (let gy = -R; gy <= R; gy++) for (let gx = -R; gx <= R; gx++) {
    const k = (gy + R) * n + gx + R, t = T(gx, gy);
    op[k] = t < 0 || opaque(tiles[t]) ? 1 : 0;
    if (m[k]) { v[k] = 1; continue; }
    if (op[k]) continue;
    if (lit(gx + 1, gy) || lit(gx - 1, gy) || lit(gx, gy + 1) || lit(gx, gy - 1)) v[k] = 0.55;
    else for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (lit(gx + a, gy + b) && (open(gx + a, gy) || open(gx, gy + b))) { v[k] = 0.3; break; }
  }
  return { v, op };
}

// Masken werden je Ebene zwischengespeichert; ändert sich die Karte (Wand gesprengt, Fass weg), verfallen sie
const masks = new Map<number, Uint8Array>();
const softs = new Map<number, { v: Float32Array; op: Uint8Array }>();
function softFor(tiles: Uint8Array, ox: number, oy: number, R: number) {
  const key = (oy * W + ox) * 16 + R;
  let s = softs.get(key);
  if (!s) { s = softMask(tiles, maskFor(tiles, ox, oy, R), ox, oy, R); softs.set(key, s); }
  return s;
}
let snapshot = new Uint8Array(0);
export function maskFor(tiles: Uint8Array, ox: number, oy: number, R: number): Uint8Array {
  const key = (oy * W + ox) * 16 + R;
  let m = masks.get(key);
  if (!m) { m = lightMask(tiles, ox, oy, R); masks.set(key, m); }
  return m;
}
export function syncTiles(tiles: Uint8Array): boolean {
  let same = snapshot.length === tiles.length;
  if (same) for (let i = 0; i < tiles.length; i++) if ((opaque(tiles[i]) ? 1 : 0) !== snapshot[i]) { same = false; break; }
  if (same) return false;
  snapshot = Uint8Array.from(tiles, t => (opaque(t) ? 1 : 0));
  masks.clear(); softs.clear();
  return true;
}

// Abfall der Helligkeit über den Radius (wie zuvor der Verlauf: Kern, Schulter, Rand)
const fall = (d: number) => (d < 0.2 ? 1 : d < 0.6 ? 1 - ((d - 0.2) / 0.4) * 0.45 : d < 1 ? 0.55 * (1 - (d - 0.6) / 0.4) : 0);

// ---- Rasterung ----

export interface LightView { tiles: Uint8Array; vis: Uint8Array; seen: Uint8Array; }

let lw = 0, lh = 0;
let lum = new Float32Array(0), glow = new Float32Array(0);
let dark: HTMLCanvasElement | null = null, glowCv: HTMLCanvasElement | null = null, bloomCv: HTMLCanvasElement | null = null;
let darkImg: ImageData, glowImg: ImageData;

const hexRgb = (c: string): [number, number, number] => { const n = parseInt(c.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgbCache = new Map<string, [number, number, number]>();
const rgbOf = (c: string) => { let v = rgbCache.get(c); if (!v) { v = hexRgb(c); rgbCache.set(c, v); } return v; };

function ensure(vw: number, vh: number) {
  const w = Math.ceil(vw / CELL), h = Math.ceil(vh / CELL);
  if (w === lw && h === lh && dark) return;
  lw = w; lh = h;
  lum = new Float32Array(w * h); glow = new Float32Array(w * h * 3);
  const mk = (cw: number, ch: number) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
  dark = mk(w, h); glowCv = mk(w, h); bloomCv = mk(Math.ceil(w / 4), Math.ceil(h / 4));
  darkImg = dark.getContext('2d')!.createImageData(w, h);
  glowImg = glowCv.getContext('2d')!.createImageData(w, h);
}

// Lichtstärke einer Quelle an der Pixelzelle: Feldwerte (1 beleuchtet, Halbschatten, 0) werden
// zwischen den Feldmitten bilinear verblendet – aber nur zwischen Feldern derselben Art
// (Boden mit Boden, Wand mit Wand), sonst schiene Licht über die Wandkante hinweg.
function addLight(L: Light, sm: { v: Float32Array; op: Uint8Array }, R: number, tx: number, ty: number, ox: number, oy: number, bright: boolean) {
  const n = 2 * R + 1, { v, op } = sm;
  const cx = L.x * TS + 8 + ox, cy = L.y * TS + 8 + oy, rad = L.r * TS, a = L.a ?? 1;
  const c0 = Math.max(0, Math.floor((cx - rad) / CELL)), c1 = Math.min(lw - 1, Math.ceil((cx + rad) / CELL));
  const r0 = Math.max(0, Math.floor((cy - rad) / CELL)), r1 = Math.min(lh - 1, Math.ceil((cy + rad) / CELL));
  const col = L.col ? rgbOf(L.col) : null, gk = bright ? GLOW_K : GLOW_K_SOFT;
  const idx = (gx: number, gy: number) => (gx < -R || gy < -R || gx > R || gy > R ? -1 : (gy + R) * n + gx + R);
  for (let cy2 = r0; cy2 <= r1; cy2++) {
    const py = cy2 * CELL + CELL / 2, wy = py - oy, uy = wy / TS - 0.5 - ty, j0 = Math.floor(uy), fy = uy - j0;
    for (let cx2 = c0; cx2 <= c1; cx2++) {
      const px = cx2 * CELL + CELL / 2, d = Math.hypot(px - cx, py - cy) / rad;
      if (d >= 1) continue;
      const wx = px - ox, ux = wx / TS - 0.5 - tx, i0 = Math.floor(ux), fx = ux - i0;
      const own = idx(Math.floor(wx / TS) - tx, Math.floor(wy / TS) - ty);
      if (own < 0) continue;
      const ov = v[own], oop = op[own];
      const s = (gx: number, gy: number) => { const k = idx(gx, gy); return k < 0 || op[k] !== oop ? ov : v[k]; };
      const soft = (s(i0, j0) * (1 - fx) + s(i0 + 1, j0) * fx) * (1 - fy) + (s(i0, j0 + 1) * (1 - fx) + s(i0 + 1, j0 + 1) * fx) * fy;
      if (soft <= 0.01) continue;
      const f = fall(d) * a * soft, i = cy2 * lw + cx2;
      lum[i] = 1 - (1 - lum[i]) * (1 - Math.min(1, f));
      if (col) { const g = fall(Math.min(1, d / 0.8)) * gk * soft; glow[i * 3] += col[0] * g; glow[i * 3 + 1] += col[1] * g; glow[i * 3 + 2] += col[2] * g; }
    }
  }
}

export function applyLight(ctx: CanvasRenderingContext2D, view: LightView, lights: Light[], ox: number, oy: number, amb: Ambient, vw: number, vh: number, bloom = true) {
  ensure(vw, vh);
  syncTiles(view.tiles);
  lum.fill(0); glow.fill(0);
  for (const L of lights) {
    const R = Math.ceil(L.r), tx = Math.round(L.x), ty = Math.round(L.y);
    const cx = L.x * TS + 8 + ox, cy = L.y * TS + 8 + oy, rad = L.r * TS;
    if (cx + rad < 0 || cy + rad < 0 || cx - rad > vw || cy - rad > vh || tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
    addLight(L, softFor(view.tiles, tx, ty, R), R, tx, ty, ox, oy, !!L.col && (L.a ?? 1) >= 0.9);
  }
  // Dunkelheit und Glühen in Stufen rastern
  const d = darkImg.data, gd = glowImg.data, [ar, ag, ab] = amb.col;
  for (let y = 0; y < lh; y++) {
    const wy = y * CELL + CELL / 2 - oy, ty = Math.floor(wy / TS);
    for (let x = 0; x < lw; x++) {
      const i = y * lw + x, wx = x * CELL + CELL / 2 - ox, tx = Math.floor(wx / TS);
      const b = BAYER[(y & 3) * 4 + (x & 3)];
      const ti = tx >= 0 && ty >= 0 && tx < W && ty < H ? ty * W + tx : -1;
      let alpha: number;
      // darkness of a tile that is only remembered (or never seen)
      const memA = (t: number) => (t >= 0 && view.seen[t] ? amb.memory : amb.dark);
      // the edge of sight is blended between tile centres (bilinear, then dithered) instead of stepping a whole tile
      const ux = wx / TS - 0.5, uy = wy / TS - 0.5, i0 = Math.floor(ux), j0 = Math.floor(uy), fx = ux - i0, fy = uy - j0;
      const at = (gx: number, gy: number) => (gx >= 0 && gy >= 0 && gx < W && gy < H ? gy * W + gx : -1);
      const q = [at(i0, j0), at(i0 + 1, j0), at(i0, j0 + 1), at(i0 + 1, j0 + 1)], wq = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      let vw = 0, mem = 0;
      for (let k = 0; k < 4; k++) { const t = q[k]; if (t >= 0 && view.vis[t] && !opaque(view.tiles[t])) vw += wq[k]; else mem += wq[k] * memA(t); }
      const own = ti >= 0 && view.vis[ti];
      if (own) {
        let l = lum[i];
        if (wallLike(view.tiles[ti])) l = 1 - (1 - l) * (1 - WALL_MIN);
        const lit = amb.dark * (1 - l);
        // walls keep their own lighting; floor fades into memory toward unseen neighbours
        const mix = opaque(view.tiles[ti]) || vw >= 0.999 ? lit : lit * vw + mem;
        alpha = amb.dark * Math.floor((mix / amb.dark) * LEVELS + b) / LEVELS;
      } else {
        const lit = vw > 0 ? amb.dark * (1 - Math.min(1, lum[i] * 0.6)) : 0;
        const mix = vw > 0 && !opaque(view.tiles[ti] ?? 0) ? lit * vw * 0.5 + memA(ti) * (1 - vw * 0.5) : memA(ti);
        alpha = amb.dark * Math.floor((mix / amb.dark) * LEVELS + b) / LEVELS;
      }
      d[i * 4] = ar; d[i * 4 + 1] = ag; d[i * 4 + 2] = ab; d[i * 4 + 3] = Math.max(0, alpha) * 255;
      const vis = ti >= 0 && view.vis[ti];
      for (let k = 0; k < 3; k++) gd[i * 4 + k] = vis ? Math.floor((Math.min(GLOW_MAX, glow[i * 3 + k]) / 255) * 12 + b) * (255 / 12) : 0;
      gd[i * 4 + 3] = 255;
    }
  }
  dark!.getContext('2d')!.putImageData(darkImg, 0, 0);
  glowCv!.getContext('2d')!.putImageData(glowImg, 0, 0);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(dark!, 0, 0, lw * CELL, lh * CELL);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glowCv!, 0, 0, lw * CELL, lh * CELL);
  // Bloom: Glühen verkleinert und weich vergrößert, damit helle Quellen strahlen (bei niedriger Grafik aus)
  if (!bloom) { ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = smooth; return; }
  const bg = bloomCv!.getContext('2d')!;
  bg.imageSmoothingEnabled = true;
  bg.clearRect(0, 0, bloomCv!.width, bloomCv!.height);
  bg.drawImage(glowCv!, 0, 0, bloomCv!.width, bloomCv!.height);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = BLOOM;
  ctx.drawImage(bloomCv!, 0, 0, bloomCv!.width * 4 * CELL, bloomCv!.height * 4 * CELL);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = smooth;
}
