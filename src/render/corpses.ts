// Corpse variants by cause of death (to-do #6). Pure rendering: the corpse is built procedurally from the
// enemy's own front sprite (lying pose, then recolour / split / flatten / overlays), with palette colours
// only and no anti-aliasing. Variation comes from a hash of the corpse position, never from Math.random,
// and every generated image is cached per (kind, cause, variant), so nothing flickers or re-bakes per frame.
import type { DeathCause } from '../game/run';
import { PAL } from './sprites';

export type Mat = 'flesh' | 'bone' | 'stone' | 'spirit' | 'slime';
export type Px = string | null;
export type Grid = Px[][];

// What the enemy is made of decides how it reacts: flesh bleeds, bones scatter, stone cracks, spirits fade
const MATS: Record<string, Mat> = {
  skelett: 'bone', schuetze: 'bone', koenig: 'bone',
  golem: 'stone', fuerst: 'stone', mimik: 'stone',
  glutgeist: 'spirit', irrlicht: 'spirit', schatten_k: 'spirit', schatten_m: 'spirit', schatten_w: 'spirit', tod: 'spirit',
  sporling: 'slime', riesenpilz: 'slime', mutter: 'slime', ei: 'slime',
};
export const materialOf = (kind: string): Mat => MATS[kind] ?? 'flesh';

// Name of the look a (kind, cause) pair gets – used by the tests and the gallery labels
const LOOK: Record<DeathCause, Record<Mat, string>> = {
  slash: { flesh: 'halves+blood', bone: 'halves+bones', stone: 'split+cracks', spirit: 'halves+fade', slime: 'halves+goo' },
  arrow: { flesh: 'arrows+blood', bone: 'arrows', stone: 'arrows+chips', spirit: 'arrows+fade', slime: 'arrows+goo' },
  fire: { flesh: 'charred+embers', bone: 'charred+embers', stone: 'charred+embers', spirit: 'ash+embers', slime: 'charred+embers' },
  frost: { flesh: 'frozen+shards', bone: 'frozen+shards', stone: 'frozen+shards', spirit: 'frozen+shards', slime: 'frozen+shards' },
  magic: { flesh: 'zapped+sparks', bone: 'zapped+sparks', stone: 'zapped+sparks', spirit: 'zapped+fade', slime: 'zapped+sparks' },
  blast: { flesh: 'parts+blood+scorch', bone: 'bones+scorch', stone: 'rubble+scorch', spirit: 'wisps+scorch', slime: 'parts+goo+scorch' },
  poison: { flesh: 'bloated+gas', bone: 'green+gas', stone: 'green+gas', spirit: 'green+fade', slime: 'bloated+gas' },
  crush: { flesh: 'flat+blood', bone: 'flat+bones', stone: 'flat+rubble', spirit: 'flat+fade', slime: 'flat+goo' },
};
export function corpseLook(kind: string, cause: DeathCause | undefined): string {
  return cause && LOOK[cause] ? LOOK[cause][materialOf(kind)] : 'default';
}

// Which of the four variants a corpse on this tile uses (stable per position and kind)
export function corpseVariant(kind: string, x: number, y: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  for (let i = 0; i < kind.length; i++) h = Math.imul(h ^ kind.charCodeAt(i), 16777619);
  return ((h ^ (h >>> 13)) >>> 0) % 4;
}

// --- colours (all from PAL) ---
const C = PAL;
const K = C.K, OUT = C.k;
const BLEED: Record<Mat, string[] | null> = {
  flesh: [C.r, C.R, C.e], slime: [C.G, C.F, C.l], bone: null, stone: null, spirit: null,
};
const CHIPS: Record<Mat, string[]> = {
  flesh: [C.r, C.R], bone: [C.w, C.u, C.S], stone: [C.d, C.g, C.D], spirit: [C.g, C.d], slime: [C.G, C.F],
};
const DARKER: Record<string, string> = {
  [C.w]: C.S, [C.S]: C.g, [C.g]: C.d, [C.d]: C.D, [C.D]: C.k, [C.u]: C.S, [C.y]: C.Y, [C.Y]: C.N, [C.o]: C.r, [C.r]: C.e,
  [C.e]: C.R, [C.l]: C.G, [C.G]: C.F, [C.s]: C.c, [C.c]: C.b, [C.b]: C.B, [C.v]: C.p, [C.P]: C.v, [C.h]: C.H, [C.H]: C.n,
  [C.n]: C.N, [C.i]: C.m, [C.T]: C.F, [C.m]: C.D,
};
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const ramp = (hex: string, r: string[], t: number[]) => { const l = lum(hex); for (let i = 0; i < t.length; i++) if (l < t[i]) return r[i]; return r[r.length - 1]; };

// --- small grid helpers ---
const blank = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<Px>(w).fill(null));
const W_ = (g: Grid) => (g[0]?.length ?? 0);
const at = (g: Grid, x: number, y: number): Px => (y >= 0 && y < g.length && x >= 0 && x < W_(g) ? g[y][x] : null);
function put(g: Grid, x: number, y: number, c: Px) { if (y >= 0 && y < g.length && x >= 0 && x < W_(g)) g[y][x] = c; }
function trim(g: Grid): Grid {
  let x0 = W_(g), x1 = -1, y0 = g.length, y1 = -1;
  g.forEach((row, y) => row.forEach((c, x) => { if (c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }));
  if (x1 < 0) return [[null]];
  return g.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1));
}
const mirror = (g: Grid): Grid => g.map(r => [...r].reverse());
const flipV = (g: Grid): Grid => [...g].reverse().map(r => [...r]);
// Head to the left, feet to the right (as the hero's own lying death frame)
function rotate(g: Grid): Grid {
  const h = g.length, w = W_(g), o = blank(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[w - 1 - x][y] = g[y][x];
  return o;
}
const isOut = (c: Px) => c === OUT || c === K;
const edgeTop = (g: Grid, x: number, y: number) => !!g[y][x] && !at(g, x, y - 1);
function cells(g: Grid, f: (c: string, x: number, y: number) => void) { g.forEach((r, y) => r.forEach((c, x) => { if (c) f(c, x, y); })); }
function recolor(g: Grid, f: (c: string, x: number, y: number) => Px): Grid { return g.map((r, y) => r.map((c, x) => (c ? f(c, x, y) : null))); }

// Deterministic little RNG (mulberry32)
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const strHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// Lying body: tall figures fall on their side, wide ones (rats, bats, lizards) roll on their back
export function lyingPose(src: Grid): Grid {
  const t = trim(src);
  return W_(t) > t.length * 1.15 ? flipV(t) : trim(rotate(t));
}

// --- the corpse builder ---
export interface CorpseOpts { reduced?: boolean; lit?: boolean }
// Returns the corpse grid; the body's bottom sits 2 px above the grid's bottom edge, centred horizontally.
export function buildCorpse(src: Grid, kind: string, cause: DeathCause, v: number, o: CorpseOpts = {}): Grid {
  const mat = materialOf(kind), rnd = seeded(strHash(`${kind}|${cause}|${v}`));
  const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  let body = lyingPose(src);
  if (v & 1) body = mirror(body);
  const bw = W_(body), bh = body.length;
  const big = Math.max(bw, bh) > 18;
  const gw = Math.max(24, bw + 10), gh = Math.max(18, bh + 9);
  const out = blank(gw, gh);
  const bx = (gw - bw) >> 1, by = gh - 2 - bh; // top-left of the body in the output
  const bleed = BLEED[mat] && o.reduced ? [C.D, C.k, C.k] : BLEED[mat];
  const chips = CHIPS[mat];
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  // floor marks go in first so the body covers them
  const spot = (x: number, y: number, c: string) => { if (!out[y]?.[x]) put(out, x, y, c); };
  const stamp = (g: Grid, dx: number, dy: number) => cells(g, (c, x, y) => put(out, x + dx, y + dy, c));
  const fade = (g: Grid, keep = 2) => recolor(g, (c, x, y) => (isOut(c) || (x + y + v) % keep === 0 ? c : null));
  const scatterChips = (n: number, cx: number, cy: number, rx: number, ry: number, cols = chips) => {
    for (let k = 0; k < n; k++) spot(cx + ri(-rx, rx), cy + ri(-ry, ry), pick(cols));
  };
  const scorch = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d > 1) continue;
      if (d < 0.45) spot(cx + x, cy + y, C.k);
      else if ((x + y) % 2 === 0) spot(cx + x, cy + y, C.D);
    }
  };
  const ccx = bx + (bw >> 1), floorY = by + bh - 1;

  switch (cause) {
    case 'slash': {
      // cut in two: the halves slide apart, the cut edge shows, blood runs out of the gap
      const cut0 = (bw >> 1) + ri(-2, 2), slant = pick([-1, 0, 1]);
      const cutAt = (y: number) => cut0 + Math.round(((y - bh / 2) * slant) / 3);
      const L = blank(bw, bh), R = blank(bw, bh);
      cells(body, (c, x, y) => { (x < cutAt(y) ? L : R)[y][x] = c; });
      const edge = mat === 'flesh' ? C.r : mat === 'stone' ? C.g : mat === 'slime' ? C.l : mat === 'bone' ? C.u : null;
      if (edge) for (let y = 0; y < bh; y++) {
        const c = cutAt(y);
        if (L[y][c - 1] && !isOut(L[y][c - 1])) L[y][c - 1] = edge;
        if (R[y][c] && !isOut(R[y][c])) R[y][c] = mat === 'flesh' ? C.e : edge;
      }
      const gx = bx + cut0;
      if (bleed) {
        // a streak along the floor away from the gap, and a pool in it
        const dir = v & 2 ? 1 : -1;
        for (let k = 0; k < 7 + (big ? 4 : 0); k++) spot(gx + dir * k, floorY + 1 + (k > 3 ? 1 : 0), k % 3 === 2 ? bleed[1] : bleed[0]);
        for (let y = floorY - 2; y <= floorY + 1; y++) { spot(gx, y, bleed[1]); spot(gx - 1, y, y & 1 ? bleed[0] : bleed[1]); }
        spot(gx - dir * 2, floorY + 1, bleed[2]);
      } else scatterChips(3, gx, floorY, 4, 1);
      const sL = mat === 'spirit' ? fade(L) : L, sR = mat === 'spirit' ? fade(R) : R;
      stamp(sL, bx - 2, by);
      stamp(sR, bx + 1, by + 1);
      if (mat === 'stone') for (let y = 2; y < bh - 1; y += 2) put(out, bx + 1 + ri(2, bw - 3), by + 1 + y, C.k); // cracks
      break;
    }
    case 'arrow': {
      const g = mat === 'spirit' ? fade(body) : body;
      if (bleed) { const ex = ccx + ri(-3, 3); spot(ex, floorY + 1, bleed[0]); spot(ex + 1, floorY + 1, bleed[1]); spot(ex - 1, floorY + 1, bleed[0]); }
      stamp(g, bx, by);
      // 1–3 arrows stuck in the upper half of the body, pointing up and away from its middle
      const n = 1 + ((v >> 1) + ri(0, 2)) % 3;
      const spots: [number, number][] = [];
      cells(body, (c, x, y) => { if (!isOut(c) && y <= bh * 0.6 && x > 1 && x < bw - 2) spots.push([x, y]); });
      const used: number[] = [];
      for (let k = 0; k < n && spots.length; k++) {
        let s = spots[Math.floor(rnd() * spots.length)], tries = 0;
        while (used.some(u => Math.abs(u - s[0]) < 3) && tries++ < 8) s = spots[Math.floor(rnd() * spots.length)];
        used.push(s[0]);
        const ex = bx + s[0], ey = by + s[1], dx = s[0] < bw / 2 ? -1 : 1, len = big ? 6 : 5;
        put(out, ex, ey, bleed ? (o.reduced ? C.k : C.R) : C.k); // the wound
        for (let j = 1; j < len; j++) put(out, ex + dx * j, ey - j, j === 1 ? C.N : C.n);
        // fletching
        const fx = ex + dx * len, fy = ey - len;
        put(out, fx, fy, C.w); put(out, fx - dx, fy, C.S); put(out, fx, fy + 1, C.S); put(out, fx - dx, fy - 1, C.w); put(out, fx + 1 * dx, fy + 1, C.w);
      }
      if (mat === 'stone') scatterChips(3, ccx, floorY + 1, bw >> 1, 0);
      break;
    }
    case 'fire': {
      // charred silhouette; a few embers glow while the corpse is fresh (lit), then turn to ash
      let g = mat === 'spirit'
        ? flatten(body, 0.5, 1)
        : body;
      g = recolor(g, c => (isOut(c) ? K : mat === 'spirit' ? ramp(c, [C.D, C.d, C.g], [0.35, 0.65]) : ramp(c, [C.k, C.D, C.N, C.d], [0.3, 0.5, 0.72])));
      const gw2 = W_(g), gh2 = g.length, gx = (gw - gw2) >> 1, gy = gh - 2 - gh2;
      for (let k = 0; k < 7; k++) spot(gx + ri(-2, gw2 + 1), gy + gh2 - 1 + ri(0, 1), (k & 1) ? C.D : C.k); // soot
      stamp(g, gx, gy);
      const tops: [number, number][] = [];
      cells(g, (_c, x, y) => { if (edgeTop(g, x, y) || (y > 0 && rnd() < 0.08)) tops.push([x, y]); });
      const n = Math.min(tops.length, (big ? 7 : 4) + (v & 1));
      for (let k = 0; k < n; k++) {
        const [x, y] = tops.splice(Math.floor(rnd() * tops.length), 1)[0];
        put(out, gx + x, gy + y, o.lit ? (k % 2 ? C.y : C.o) : (k % 2 ? C.g : C.d));
      }
      break;
    }
    case 'frost': {
      // pale blue, frozen solid, with ice shards sticking out
      const g = recolor(body, c => (isOut(c) ? C.B : ramp(c, [C.b, C.c, C.s, C.S], [0.22, 0.45, 0.7])));
      for (let k = 0; k < 6; k++) spot(bx + ri(-2, bw + 1), floorY + 1, k % 2 ? C.S : C.s); // frost on the floor
      stamp(g, bx, by);
      // glints
      cells(body, (c, x, y) => { if (!isOut(c) && (x * 7 + y * 3 + v) % 11 === 0) put(out, bx + x, by + y, C.w); });
      const tops: number[] = [];
      for (let x = 1; x < bw - 1; x++) for (let y = 0; y < bh; y++) if (body[y][x]) { tops.push(x); break; }
      const n = big ? 4 : 2 + (v & 1);
      for (let k = 0; k < n && tops.length; k++) {
        const x = tops.splice(Math.floor(rnd() * tops.length), 1)[0];
        let y = 0; while (y < bh && !body[y][x]) y++;
        const len = ri(2, big ? 5 : 4), lean = pick([-1, 0, 0, 1]);
        for (let j = 0; j <= len; j++) {
          const px = bx + x + Math.round((lean * j) / 2), py = by + y - j;
          put(out, px, py, j === len ? C.w : j === 0 ? C.c : C.s);
          if (j < len - 1 && j > 0) put(out, px + (lean >= 0 ? 1 : -1), py, C.b);
        }
      }
      // a loose shard on the floor
      const sx = bx + (v & 2 ? bw + 1 : -3), sy = floorY;
      put(out, sx, sy, C.s); put(out, sx + 1, sy, C.w); put(out, sx, sy + 1, C.c);
      break;
    }
    case 'magic': {
      // zapped: violet outline, darkened body, a crackle of arcane light and a few sparks
      let g = recolor(body, c => (isOut(c) ? C.p : DARKER[c] ?? c));
      if (mat === 'spirit') g = fade(g);
      for (let k = 0; k < 5; k++) spot(bx + ri(0, bw), floorY + 1, (k & 1) ? C.p : C.v);
      stamp(g, bx, by);
      for (let line = 0; line < (big ? 3 : 2); line++) {
        let x = ri(1, 3), y = ri(1, Math.max(1, bh - 2));
        while (x < bw - 1) {
          if (body[y]?.[x] && !isOut(body[y][x])) put(out, bx + x, by + y, (x + line) % 3 ? C.v : C.P);
          x++; y = Math.max(1, Math.min(bh - 2, y + pick([-1, 0, 1])));
        }
      }
      for (let k = 0; k < 3; k++) {
        const sx = bx + ri(-3, bw + 2), sy = by + ri(-3, 0);
        put(out, sx, sy, C.P); if (k === 0) { put(out, sx - 1, sy, C.v); put(out, sx + 1, sy, C.v); put(out, sx, sy - 1, C.v); put(out, sx, sy + 1, C.v); }
      }
      break;
    }
    case 'blast': {
      // torn into chunks that lie scattered around a scorch mark
      scorch(ccx, floorY - 1, (bw >> 1) + 3, Math.max(2, (bh >> 1) + 1));
      const cs = big ? 6 : 4, cxm = bw / 2, cym = bh / 2;
      const pieces: { g: Grid; dx: number; dy: number }[] = [];
      for (let y0 = 0; y0 < bh; y0 += cs) for (let x0 = 0; x0 < bw; x0 += cs) {
        const g = blank(bw, bh);
        let n = 0;
        for (let y = y0; y < Math.min(bh, y0 + cs); y++) for (let x = x0; x < Math.min(bw, x0 + cs); x++) if (body[y][x]) { g[y][x] = body[y][x]; n++; }
        if (n < 3) continue;
        const ax = x0 + cs / 2 - cxm, ay = y0 + cs / 2 - cym;
        pieces.push({ g, dx: Math.sign(ax || (rnd() - 0.5)) * ri(2, 4), dy: Math.sign(ay) * ri(1, 2) + (ay > 0 ? 0 : -ri(0, 1)) });
      }
      const drop = mat === 'flesh' || mat === 'slime' ? 1 : 0;
      pieces.forEach((pc, i) => {
        if (drop && pieces.length > 4 && (i + v) % 5 === 2) return; // a bit flew off-screen
        let g = recolor(pc.g, c => (isOut(c) ? c : rnd() < 0.12 ? C.k : c));
        if (mat === 'spirit') g = fade(g);
        stamp(g, bx + pc.dx, by + pc.dy);
      });
      if (bleed) scatterChips(big ? 10 : 7, ccx, floorY - 1, (bw >> 1) + 4, (bh >> 1) + 1, bleed);
      scatterChips(big ? 6 : 4, ccx, floorY - 1, (bw >> 1) + 5, (bh >> 1) + 1);
      break;
    }
    case 'poison': {
      // green and bloated, a puff of gas hanging over it
      const swell = mat === 'flesh' || mat === 'slime';
      let g = swell ? bloat(body) : body;
      g = recolor(g, c => (isOut(c) ? c : ramp(c, [C.F, C.T, C.G, C.l], [0.25, 0.42, 0.62])));
      if (mat === 'spirit') g = fade(g);
      const gw2 = W_(g), gh2 = g.length, gx = (gw - gw2) >> 1, gy = gh - 2 - gh2;
      for (let k = 0; k < 5; k++) spot(gx + ri(-1, gw2), gy + gh2, (k & 1) ? C.F : C.G); // ooze
      stamp(g, gx, gy);
      // dark blotches
      cells(g, (c, x, y) => { if (!isOut(c) && (x * 5 + y * 9 + v) % 13 === 0) put(out, gx + x, gy + y, C.F); });
      // gas puff
      const px = gx + ri(2, Math.max(2, gw2 - 4)), py = Math.max(1, gy - 2);
      const puff = ['.l.l', 'lGlG', '.G.'];
      puff.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') put(out, px + x, py + y - 1, ch === 'l' ? C.l : C.G); }));
      put(out, px + 5, py - 3, C.l);
      break;
    }
    case 'crush': {
      // flattened flat on the floor, squeezed out at the sides
      let g = flatten(body, Math.max(0.5, 4 / bh), 1.25);
      if (mat === 'spirit') g = fade(g);
      const gw2 = W_(g), gh2 = g.length, gx = (gw - gw2) >> 1, gy = gh - 2 - gh2;
      const splat = bleed ?? chips;
      for (let k = 0; k < (big ? 12 : 8); k++) {
        const side = k & 1 ? -1 : 1, x = side > 0 ? gx + gw2 + ri(0, 2) : gx - 1 - ri(0, 2);
        spot(x, gy + ri(0, gh2), pick(splat));
      }
      for (let k = 0; k < 4; k++) spot(gx + ri(0, gw2), gy + gh2, pick(splat));
      stamp(g, gx, gy);
      if (mat === 'stone') for (let x = 2; x < gw2 - 2; x += 3) put(out, gx + x, gy + 1 + ri(0, Math.max(0, gh2 - 3)), C.k);
      break;
    }
  }
  return out;
}

// Nearest-neighbour rescale (keeps the hard pixel edges)
function scale(g: Grid, sx: number, sy: number): Grid {
  const w = W_(g), h = g.length, nw = Math.max(1, Math.round(w * sx)), nh = Math.max(1, Math.round(h * sy)), o = blank(nw, nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) o[y][x] = g[Math.min(h - 1, Math.floor(((y + 0.5) * h) / nh))][Math.min(w - 1, Math.floor(((x + 0.5) * w) / nw))];
  return o;
}
// squash: outline survives at the top and bottom
function flatten(g: Grid, sy: number, sx: number): Grid {
  const s = scale(g, sx, sy), w = W_(s);
  const o = s.map(r => [...r]);
  for (let x = 0; x < w; x++) {
    let top = -1, bot = -1;
    for (let y = 0; y < o.length; y++) if (o[y][x]) { if (top < 0) top = y; bot = y; }
    if (top >= 0) { o[top][x] = OUT; o[bot][x] = OUT; }
  }
  return o;
}
// swollen: one pixel wider on every side, filled with the neighbour's colour, outlined again
function bloat(g: Grid): Grid {
  const w = W_(g), h = g.length, o = blank(w + 2, h + 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x]) o[y + 1][x + 1] = g[y][x];
  const fill = (x: number, y: number) => {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const c = at(g, x - 1 + dx, y - 1 + dy); if (c && !isOut(c)) return c; }
    return null;
  };
  // the old outline becomes body colour, the new ring becomes the outline
  const r = o.map((row, y) => row.map((c, x) => (c && isOut(c) ? fill(x, y) ?? c : c)));
  for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++) {
    if (r[y][x]) continue;
    if ([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => at(o, x + dx, y + dy))) r[y][x] = OUT;
  }
  return r;
}

// --- canvas side (browser only) ---
export function gridFromImage(data: Uint8ClampedArray, w: number, h: number): Grid {
  const g = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 128) continue;
    g[y][x] = '#' + ((1 << 24) | (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]).toString(16).slice(1);
  }
  return g;
}
export function gridToCanvas(g: Grid): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W_(g); c.height = g.length;
  const x = c.getContext('2d')!;
  cells(g, (col, px, py) => { x.fillStyle = col; x.fillRect(px, py, 1, 1); });
  return c;
}

const cache = new Map<string, HTMLCanvasElement | null>();
// Cached corpse image for (sprite, kind, cause, variant); null if the sprite is missing
export function corpseCanvas(img: HTMLCanvasElement | undefined, kind: string, cause: DeathCause, v: number, reduced: boolean, lit: boolean): HTMLCanvasElement | null {
  const key = `${kind}|${cause}|${v}|${reduced ? 1 : 0}|${lit && cause === 'fire' ? 1 : 0}`;
  let c = cache.get(key);
  if (c !== undefined) return c;
  c = null;
  if (img && img.width) {
    const src = gridFromImage(img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data, img.width, img.height);
    c = gridToCanvas(buildCorpse(src, kind, cause, v, { reduced, lit }));
  }
  cache.set(key, c);
  return c;
}
export const corpseCacheSize = () => cache.size;
