// Phase 4: Dekor je Biom – nur Darstellung, fest am Feld (Hash), ändert weder Karte noch Logik.
// Drei Arten, damit nichts wie ein Hindernis aussieht:
//  - an der Wandfront (Ketten, Spinnweben, Banner, Wurzeln, Tropfsteine, Lüftungsgitter)
//  - am Fuß einer Wand auf dem Boden (Kerzen, Knochen, Kristalle, Leuchtpilze, Barren, Kohle)
//  - flach im Boden mitten im Raum (Grabplatte, Pfütze, Glutrost)
import { W, H, T, wallLike, opaque } from '../game/dungeon';
import type { Light } from './light';

const TS = 16;
type Paint = (g: CanvasRenderingContext2D, f: number) => void;
const mk = (): [HTMLCanvasElement, CanvasRenderingContext2D] => { const c = document.createElement('canvas'); c.width = TS; c.height = TS; return [c, c.getContext('2d')!]; };
const px = (g: CanvasRenderingContext2D, col: string, x: number, y: number, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

// dunkler Umriss um alles Gezeichnete (wie bei den Figuren), damit kleine Dinge auf dem Boden lesbar sind
function outline(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!, d = g.getImageData(0, 0, TS, TS), src = new Uint8ClampedArray(d.data);
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < TS && y < TS && src[(y * TS + x) * 4 + 3] > 0;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (op(x, y) || !(op(x + 1, y) || op(x - 1, y) || op(x, y + 1) || op(x, y - 1))) continue;
    const i = (y * TS + x) * 4; d.data[i] = 26; d.data[i + 1] = 28; d.data[i + 2] = 44; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
}

interface Prop { frames: HTMLCanvasElement[]; light?: (f: number) => Omit<Light, 'x' | 'y'>; ly?: number; }
const bake = (paint: Paint, n = 1, line = false, light?: Prop['light'], ly = 0.4): Prop => {
  const frames = Array.from({ length: n }, (_, f) => { const [c, g] = mk(); paint(g, f); if (line) outline(c); return c; });
  return { frames, light, ly };
};

// ---- Wandfront ----
const chains: Paint = g => {
  for (const x of [4, 11]) { for (let y = 0; y < 9; y++) { px(g, '#1a1c2c', x + 1, y); px(g, y % 2 ? '#c9d4dc' : '#8b8f9c', x, y); } }
  px(g, '#8b8f9c', 10, 9, 3, 1); px(g, '#8b8f9c', 10, 10, 1, 2); px(g, '#8b8f9c', 12, 10, 1, 2); px(g, '#c9d4dc', 10, 12, 3, 1); px(g, '#1a1c2c', 10, 13, 3, 1);
};
const cobweb: Paint = g => {
  g.globalAlpha = 0.6;
  for (let k = 0; k < 7; k++) { px(g, '#c9d4dc', k, 0); px(g, '#c9d4dc', 0, k); }
  for (let k = 0; k < 6; k++) px(g, '#c9d4dc', k, k);
  for (const r of [3, 5]) for (let k = 0; k <= r; k++) px(g, '#94b0c2', k, r - k);
  g.globalAlpha = 1;
};
const banner: Paint = g => {
  px(g, '#5a3a28', 4, 1, 8, 1); px(g, '#ffcd75', 4, 1); px(g, '#ffcd75', 11, 1);
  px(g, '#7d2b45', 5, 2, 6, 7); px(g, '#b13e53', 6, 2, 4, 6);
  px(g, '#ffcd75', 7, 4, 2, 2);
  px(g, '#7d2b45', 5, 9); px(g, '#7d2b45', 7, 9, 2, 1); px(g, '#7d2b45', 10, 9);
};
const roots: Paint = g => {
  for (const [x, len] of [[3, 9], [8, 6], [12, 10]]) for (let y = 0; y < len; y++) px(g, y % 3 ? '#257179' : '#38b764', x + (y > 4 && x === 12 ? -1 : 0), y);
  px(g, '#a7f070', 2, 4); px(g, '#a7f070', 9, 3); px(g, '#a7f070', 13, 7);
};
const drips: Paint = (g, f) => {
  for (const [x, len] of [[2, 4], [7, 6], [12, 3]]) {
    for (let y = 0; y < len; y++) { const w = Math.max(1, 3 - Math.floor(y / 2)); px(g, '#2f8f85', x + 1 - (w >> 1), y, w, 1); }
    px(g, '#55b89c', x, 0, 1, len - 1);
  }
  px(g, '#73eff7', 8, 7 + f * 3);
};
const hooks: Paint = g => {
  for (let y = 0; y < 7; y++) { px(g, '#1a1c2c', 9, y); px(g, y % 2 ? '#c9d4dc' : '#8b8f9c', 8, y); }
  px(g, '#8b8f9c', 8, 7, 1, 2); px(g, '#8b8f9c', 9, 9); px(g, '#8b8f9c', 10, 8);
};
const vent: Paint = (g, f) => {
  px(g, '#1c0f14', 3, 3, 10, 7); px(g, '#4a4d58', 3, 3, 10, 1); px(g, '#4a4d58', 3, 9, 10, 1);
  for (let x = 4; x < 12; x += 2) px(g, f ? '#ef7d57' : '#b13e53', x, 4, 1, 5);
  px(g, '#ffcd75', 6 + f * 2, 6);
};

// ---- am Fuß der Wand (Boden) ----
const candles: Paint = (g, f) => {
  px(g, '#d9cfb4', 2, 11, 7, 2);
  for (const [x, h] of [[3, 5], [5, 3], [7, 4]]) {
    px(g, '#d9cfb4', x, 12 - h, 1, h); px(g, '#c9d4dc', x, 12 - h, 1, 1);
    px(g, (x + f) % 2 ? '#ffcd75' : '#ef7d57', x, 11 - h - (x === 5 ? f : 0), 1, 1);
  }
};
const bones: Paint = g => {
  px(g, '#c9d4dc', 9, 8, 4, 3); px(g, '#1a1c2c', 10, 9); px(g, '#1a1c2c', 12, 9); px(g, '#94b0c2', 10, 11, 2, 1);
  px(g, '#c9d4dc', 3, 12, 6, 1); px(g, '#c9d4dc', 2, 11, 1, 3); px(g, '#c9d4dc', 9, 11, 1, 3);
  px(g, '#94b0c2', 5, 10, 1, 2); px(g, '#94b0c2', 4, 9, 3, 1);
};
const crystals: Paint = g => {
  const shard = (x: number, y0: number, h: number) => { px(g, '#41a6f6', x, y0, 2, h); px(g, '#73eff7', x, y0, 1, h); px(g, '#f4f4f4', x, y0, 1, 1); };
  shard(4, 6, 7); shard(7, 3, 10); shard(10, 7, 6); shard(12, 9, 4);
  px(g, '#29366f', 3, 13, 11, 1);
};
const shrooms: Paint = g => {
  for (const [x, y, w] of [[3, 8, 4], [8, 10, 3], [11, 7, 4]]) {
    px(g, '#d9cfb4', x + (w >> 1) - (w > 3 ? 1 : 0), y + 2, 1, 13 - y - 2 + 1);
    px(g, '#38b764', x, y + 1, w, 1); px(g, '#a7f070', x, y, w, 1); px(g, '#f4f4f4', x + 1, y);
  }
};
const ingots: Paint = (g, f) => {
  for (const [x, y] of [[3, 11], [8, 11], [5, 9]]) { px(g, '#b13e53', x, y, 5, 2); px(g, f && x === 5 ? '#ffcd75' : '#ef7d57', x, y, 5, 1); }
  px(g, '#ffcd75', 6, 9);
};
const coal: Paint = (g, f) => {
  px(g, '#1c0f14', 3, 10, 9, 3); px(g, '#1c0f14', 5, 8, 5, 2); px(g, '#4a4d58', 5, 8, 2, 1); px(g, '#4a4d58', 9, 10, 2, 1);
  px(g, f ? '#ffcd75' : '#ef7d57', 7, 10); px(g, '#ef7d57', 4, 12); px(g, f ? '#ef7d57' : '#b13e53', 10, 11);
};

// ---- flach im Boden ----
const slab: Paint = g => {
  px(g, '#333c57', 3, 4, 10, 8); px(g, '#566c86', 3, 4, 10, 1); px(g, '#566c86', 3, 4, 1, 8);
  px(g, '#1a1c2c', 5, 6, 6, 1); px(g, '#1a1c2c', 7, 7, 2, 3); px(g, '#1a1c2c', 5, 10, 6, 1);
};
const puddle: Paint = (g, f) => {
  px(g, '#29366f', 3, 6, 10, 5); px(g, '#29366f', 2, 7, 12, 3); px(g, '#3b5dc9', 4, 7, 7, 2);
  px(g, '#73eff7', 5 + f * 4, 7, 2, 1); px(g, '#41a6f6', 9 - f * 3, 9, 1, 1);
};
const grate: Paint = (g, f) => {
  px(g, '#4a4d58', 3, 3, 10, 10); px(g, '#1c0f14', 4, 4, 8, 8);
  for (let x = 5; x < 12; x += 2) px(g, f ? '#ef7d57' : '#b13e53', x, 5, 1, 6);
  px(g, '#8b8f9c', 3, 3, 10, 1); px(g, '#8b8f9c', 4, 7, 8, 1);
};

const warm = (r: number, a = 0.75): Prop['light'] => f => ({ r: r + (f ? 0.15 : 0), col: '#ef7d57', a });

interface BiomeProps { wall: Prop[]; foot: Prop[]; flat: Prop[]; }
let SETS: BiomeProps[] | null = null;
function sets(): BiomeProps[] {
  if (SETS) return SETS;
  SETS = [
    { wall: [bake(chains), bake(cobweb), bake(banner)],
      foot: [bake(candles, 2, true, f => ({ r: 1.7 + (f ? 0.15 : 0), col: '#ffcd75', a: 0.8 }), 0.6), bake(bones, 1, true)],
      flat: [bake(slab)] },
    { wall: [bake(roots), bake(drips, 2)],
      foot: [bake(crystals, 1, true, () => ({ r: 2.4, col: '#73eff7', a: 0.9 }), 0.5), bake(shrooms, 1, true, () => ({ r: 1.8, col: '#a7f070', a: 0.8 }), 0.6)],
      flat: [bake(puddle, 2)] },
    { wall: [bake(hooks), bake(vent, 2, false, warm(1.4, 0.6), 0.3)],
      foot: [bake(ingots, 2, true, warm(1.6), 0.7), bake(coal, 2, true, warm(1.2, 0.6), 0.7)],
      flat: [bake(grate, 2, false, warm(1.7, 0.7), 0.5)] },
  ];
  return SETS;
}

// ---- Platzierung (rein, testbar) ----
export type PropKind = 'wall' | 'foot' | 'flat';
const hp = (x: number, y: number, s: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0;

// Welche Art Dekor gehört auf dieses Feld? null = keins
export function propAt(tiles: Uint8Array, seed: number, x: number, y: number): { kind: PropKind; pick: number } | null {
  if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return null;
  const i = y * W + x, t = tiles[i], h = hp(x, y, seed);
  const wall = (dx: number, dy: number) => wallLike(tiles[i + dy * W + dx]);
  if (t === T.WALL) {
    // Wandfront: unten offener Boden
    return !wallLike(tiles[i + W]) && h % 4 === 0 ? { kind: 'wall', pick: h >>> 5 } : null;
  }
  if (t !== T.FLOOR) return null;
  // am Wandfuß: Wand darüber, links, rechts und darunter frei – nie in einem Gang
  if (wall(0, -1) && !wall(-1, 0) && !wall(1, 0) && !wall(0, 1) && !opaque(tiles[i + W]) && h % 5 === 0) return { kind: 'foot', pick: h >>> 5 };
  // mitten im Raum: alle acht Nachbarn offen
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && opaque(tiles[i + dy * W + dx])) return null;
  return h % 17 === 0 ? { kind: 'flat', pick: h >>> 5 } : null;
}

export function drawProp(ctx: CanvasRenderingContext2D, bi: number, p: { kind: PropKind; pick: number }, x: number, y: number, dx: number, dy: number, time: number, lights: Light[]) {
  const list = sets()[bi][p.kind], prop = list[p.pick % list.length];
  const f = prop.frames.length > 1 ? Math.floor(time * 4 + x * 0.7 + y) % prop.frames.length : 0;
  ctx.drawImage(prop.frames[f], dx, dy);
  if (prop.light) lights.push({ x, y: y + (prop.ly ?? 0.4) - 0.5, ...prop.light(f) });
}

// Fackelbild umfärben (Arena des Bosses: Flamme in dessen Farbe)
export function recolor(src: HTMLCanvasElement, map: Record<string, string>): HTMLCanvasElement {
  const [c, g] = mk(); c.width = src.width; c.height = src.height;
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const m = new Map(Object.entries(map).map(([a, b]) => [parseInt(a.slice(1), 16), parseInt(b.slice(1), 16)]));
  for (let i = 0; i < d.data.length; i += 4) {
    const k = (d.data[i] << 16) | (d.data[i + 1] << 8) | d.data[i + 2], v = m.get(k);
    if (v !== undefined && d.data[i + 3]) { d.data[i] = v >> 16; d.data[i + 1] = (v >> 8) & 255; d.data[i + 2] = v & 255; }
  }
  g.putImageData(d, 0, 0);
  return c;
}
