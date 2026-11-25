// Phase 4: Dekor je Biom – nur Darstellung, fest am Feld (Hash), ändert weder Karte noch Logik.
// Drei Arten, damit nichts wie ein Hindernis aussieht:
//  - an der Wandfront (Ketten, Spinnweben, Banner, Wurzeln, Tropfsteine, Lüftungsgitter)
//  - am Fuß einer Wand auf dem Boden (Kerzen, Knochen, Kristalle, Leuchtpilze, Barren, Kohle)
//  - flach im Boden mitten im Raum (Grabplatte, Pfütze, Glutrost)
import { W, H, T, wallLike, walkable } from '../game/dungeon';
import type { Light } from './light';

const TS = 16;
type Paint = (g: CanvasRenderingContext2D, f: number) => void;
const mk = (size = TS): [HTMLCanvasElement, CanvasRenderingContext2D] => { const c = document.createElement('canvas'); c.width = size; c.height = size; return [c, c.getContext('2d')!]; };
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

// span: footprint in tiles (1, or 3 for a floor pattern centred on its tile and drawn slice by slice)
interface Prop { frames: HTMLCanvasElement[]; light?: (f: number) => Omit<Light, 'x' | 'y'>; ly?: number; span: number; }

// Jede Art hat mehrere Spielarten: Malfunktion mit Spielart v und eigenem Zufall R (fest je Spielart,
// in allen Bildern gleich), dazu je eine gespiegelte Fassung.
type R = () => number;
type VPaint = (g: CanvasRenderingContext2D, f: number, v: number, r: R) => void;
interface Spec { paint: VPaint; n: number; frames?: number; line?: boolean; light?: (f: number, v: number) => Omit<Light, 'x' | 'y'> | undefined; ly?: number; mirror?: boolean; span?: number; }
const rng = (seed: number): R => () => { let t = (seed = (seed + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const flipped = (c: HTMLCanvasElement) => { const [m, g] = mk(c.width); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return m; };
let specSeed = 1;
function bakeSpec(sp: Spec): Prop[] {
  const out: Prop[] = [], seed = (specSeed += 7919);
  for (let v = 0; v < sp.n; v++) {
    const span = sp.span ?? 1;
    const frames = Array.from({ length: sp.frames ?? 1 }, (_, f) => { const [c, g] = mk(TS * span); sp.paint(g, f, v, rng(seed + v * 104729)); if (sp.line) outline(c); return c; });
    const light = sp.light && sp.light(0, v) ? (f: number) => sp.light!(f, v)! : undefined;
    out.push({ frames, light, ly: sp.ly, span });
    if (sp.mirror !== false) out.push({ frames: frames.map(flipped), light, ly: sp.ly, span });
  }
  return out;
}
const I = (r: R, a: number, b: number) => a + Math.floor(r() * (b - a + 1)); // ganze Zahl in [a, b]

// ---- Wandfront ----
const chains: VPaint = (g, _f, v) => {
  const link = (x: number, y0: number, y1: number) => { for (let y = y0; y < y1; y++) { px(g, '#1a1c2c', x + 1, y); px(g, y % 2 ? '#c9d4dc' : '#8b8f9c', x, y); } };
  if (v === 0) { link(4, 0, 9); link(11, 0, 9); px(g, '#8b8f9c', 10, 9, 3, 1); px(g, '#8b8f9c', 10, 10, 1, 2); px(g, '#8b8f9c', 12, 10, 1, 2); px(g, '#c9d4dc', 10, 12, 3, 1); }
  else if (v === 1) { link(7, 0, 11); px(g, '#8b8f9c', 6, 11, 3, 1); px(g, '#8b8f9c', 6, 12, 1, 2); px(g, '#8b8f9c', 8, 12, 1, 2); px(g, '#c9d4dc', 6, 14, 3, 1); }
  else { px(g, '#4a4d58', 1, 2, 2, 2); px(g, '#4a4d58', 13, 2, 2, 2); for (let x = 3; x <= 12; x++) { const y = 3 + Math.round(4 * Math.sin(((x - 3) / 9) * Math.PI)); px(g, '#1a1c2c', x, y + 1); px(g, x % 2 ? '#c9d4dc' : '#8b8f9c', x, y); } }
};
const cobweb: VPaint = (g, _f, v, r) => {
  const n = v === 0 ? 7 : 5;
  g.globalAlpha = 0.6;
  for (let k = 0; k < n; k++) { px(g, '#c9d4dc', k, 0); px(g, '#c9d4dc', 0, k); }
  for (let k = 0; k < n - 1; k++) px(g, '#c9d4dc', k, k);
  for (const rr of v === 0 ? [3, 5] : [3]) for (let k = 0; k <= rr; k++) px(g, '#94b0c2', k, rr - k);
  if (v === 1) { const x = I(r, 3, 5); for (let y = 2; y < 9; y++) px(g, '#c9d4dc', x, y); g.globalAlpha = 1; px(g, '#1a1c2c', x - 1, 9, 3, 2); px(g, '#b13e53', x, 9); }
  g.globalAlpha = 1;
};
const BANNER = [['#7d2b45', '#b13e53', '#ffcd75'], ['#29366f', '#3b5dc9', '#c9d4dc'], ['#1e6b3a', '#38b764', '#ffcd75']];
const banner: VPaint = (g, _f, v, r) => {
  const [d, m, e] = BANNER[v % 3];
  px(g, '#5a3a28', 4, 1, 8, 1); px(g, '#ffcd75', 4, 1); px(g, '#ffcd75', 11, 1);
  px(g, d, 5, 2, 6, 8); px(g, m, 6, 2, 4, 7);
  if (v === 0) { px(g, e, 7, 4, 2, 2); px(g, e, 6, 5); px(g, e, 9, 4); }
  else if (v === 1) { px(g, e, 7, 3, 2, 5); px(g, e, 6, 4, 4, 1); }
  else { px(g, e, 7, 3, 2, 2); px(g, d, 7, 4); px(g, e, 7, 6, 2, 1); }
  for (let x = 5; x <= 10; x++) if (r() < 0.45) px(g, d, x, 10); // ausgefranster Saum
};
const roots: VPaint = (g, _f, _v, r) => {
  for (let k = I(r, 3, 4); k > 0; k--) {
    let x = I(r, 1, 14);
    const len = I(r, 4, 11);
    for (let y = 0; y < len; y++) { px(g, y % 3 ? '#257179' : '#38b764', x, y); if (r() < 0.2) x = Math.max(0, Math.min(15, x + (r() < 0.5 ? -1 : 1))); if (r() < 0.12) px(g, '#a7f070', x + 1, y); }
  }
};
const drips: VPaint = (g, f, _v, r) => {
  let tip = 7;
  for (let k = I(r, 2, 4), x = I(r, 1, 3); k > 0 && x < 14; k--, x += I(r, 3, 5)) {
    const len = I(r, 3, 7);
    for (let y = 0; y < len; y++) { const w = Math.max(1, 3 - Math.floor(y / 2)); px(g, '#2f8f85', x + 1 - (w >> 1), y, w, 1); }
    px(g, '#55b89c', x, 0, 1, len - 1);
    if (len > 4) tip = x;
  }
  px(g, '#73eff7', tip, 7 + f * 3);
};
const glowmoss: VPaint = (g, f, _v, r) => {
  for (let k = 0; k < 3; k++) { const x = I(r, 1, 11), y = I(r, 1, 8); px(g, '#1e6b3a', x, y, 4, 2); px(g, '#38b764', x + 1, y, 2, 1); }
  for (let k = 0; k < 5; k++) px(g, (k + f) % 2 ? '#a7f070' : '#73eff7', I(r, 1, 14), I(r, 1, 10));
};
const hooks: VPaint = (g, _f, v) => {
  const chain = (x: number, y1: number) => { for (let y = 0; y < y1; y++) { px(g, '#1a1c2c', x + 1, y); px(g, y % 2 ? '#c9d4dc' : '#8b8f9c', x, y); } };
  if (v === 0) { chain(8, 7); px(g, '#8b8f9c', 8, 7, 1, 2); px(g, '#8b8f9c', 9, 9); px(g, '#8b8f9c', 10, 8); }
  else if (v === 1) { // Zange und Hammer am Haken
    px(g, '#4a4d58', 3, 1, 10, 1);
    px(g, '#8b8f9c', 4, 2, 1, 7); px(g, '#8b8f9c', 6, 2, 1, 7); px(g, '#4a4d58', 5, 8, 1, 2);
    px(g, '#5a3a28', 10, 2, 1, 6); px(g, '#4a4d58', 8, 8, 5, 2); px(g, '#8b8f9c', 8, 8, 5, 1);
  } else { chain(7, 8); px(g, '#4a4d58', 5, 8, 5, 4); px(g, '#8b8f9c', 5, 8, 5, 1); px(g, '#1a1c2c', 5, 12, 5, 1); }
};
const vent: VPaint = (g, f, v) => {
  if (v === 0) {
    px(g, '#1c0f14', 3, 3, 10, 7); px(g, '#4a4d58', 3, 3, 10, 1); px(g, '#4a4d58', 3, 9, 10, 1);
    for (let x = 4; x < 12; x += 2) px(g, f ? '#ef7d57' : '#b13e53', x, 4, 1, 5);
    px(g, '#ffcd75', 6 + f * 2, 6);
  } else {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const d = (x - 4) ** 2 + (y - 4) ** 2; if (d <= 16) px(g, d > 9 ? '#4a4d58' : (x + y + f) % 3 ? '#b13e53' : '#ef7d57', 4 + x, 2 + y); }
    px(g, '#8b8f9c', 6, 2, 5, 1); px(g, '#ffcd75', 8, 6);
  }
};

// ---- am Fuß der Wand (Boden) ----
const candles: VPaint = (g, f, _v, r) => {
  const n = I(r, 2, 4), xs: number[] = [];
  for (let k = 0; k < n; k++) xs.push(I(r, 2, 12));
  xs.sort((a, b) => a - b);
  px(g, '#d9cfb4', xs[0] - 1, 12, xs[n - 1] - xs[0] + 3, 1);
  xs.forEach((x, k) => {
    const h = I(r, 2, 6);
    px(g, '#d9cfb4', x, 12 - h, 1, h); px(g, '#c9d4dc', x, 12 - h, 1, 1);
    if (r() < 0.4) px(g, '#d9cfb4', x + 1, 12 - h + 1, 1, 2); // Wachstropfen
    px(g, (k + f) % 2 ? '#ffcd75' : '#ef7d57', x, 11 - h - ((k + f) % 3 === 0 ? 1 : 0));
  });
};
const bones: VPaint = (g, _f, v, r) => {
  const skull = (x: number, y: number) => { px(g, '#c9d4dc', x, y, 4, 3); px(g, '#c9d4dc', x + 1, y + 3, 2, 1); px(g, '#1a1c2c', x + 1, y + 1); px(g, '#1a1c2c', x + 3, y + 1); px(g, '#94b0c2', x, y + 2, 1, 1); };
  const bone = (x: number, y: number, len: number, vert: boolean) => {
    if (vert) { px(g, '#c9d4dc', x, y, 1, len); px(g, '#c9d4dc', x - 1, y, 3, 1); px(g, '#c9d4dc', x - 1, y + len - 1, 3, 1); }
    else { px(g, '#c9d4dc', x, y, len, 1); px(g, '#c9d4dc', x, y - 1, 1, 3); px(g, '#c9d4dc', x + len - 1, y - 1, 1, 3); px(g, '#94b0c2', x + 1, y + 1, len - 2, 1); }
  };
  if (v === 0) { skull(9, 8); bone(2, 12, 6, false); bone(5, 9, 4, true); }
  else if (v === 1) { // Brustkorb
    px(g, '#c9d4dc', 7, 6, 1, 7);
    for (const y of [7, 9, 11]) { px(g, '#c9d4dc', 4, y, 3, 1); px(g, '#c9d4dc', 8, y, 3, 1); px(g, '#94b0c2', 4, y + 1, 1, 1); px(g, '#94b0c2', 10, y + 1, 1, 1); }
    skull(11, 10);
  } else { for (let k = 0; k < 3; k++) bone(I(r, 2, 8), I(r, 7, 13), I(r, 3, 6), r() < 0.4); if (r() < 0.6) skull(I(r, 2, 10), 9); }
};
const CRYSTAL = [['#41a6f6', '#73eff7', '#f4f4f4', '#73eff7'], ['#29366f', '#41a6f6', '#c9d4dc', '#41a6f6'], ['#5d275d', '#9a4fc0', '#f4f4f4', '#9a4fc0']];
const crystals: VPaint = (g, _f, v, r) => {
  const [d, m, w] = CRYSTAL[v % 3];
  for (let k = I(r, 3, 5); k > 0; k--) {
    const x = I(r, 2, 12), h = I(r, 3, 10), y0 = 13 - h;
    px(g, d, x, y0, 2, h); px(g, m, x, y0, 1, h); px(g, w, x, y0, 1, 1);
  }
  px(g, '#29366f', 2, 13, 12, 1);
};
const shrooms: VPaint = (g, _f, v, r) => {
  const [cap, hi] = v % 2 ? ['#41a6f6', '#73eff7'] : ['#38b764', '#a7f070'];
  for (let k = I(r, 2, 4); k > 0; k--) {
    const w = I(r, 2, 4), x = I(r, 1, 14 - w), y = I(r, 6, 10);
    px(g, '#d9cfb4', x + (w >> 1), y + 1, 1, 13 - y);
    px(g, cap, x, y + 1, w, 1); px(g, hi, x, y, w, 1); px(g, '#f4f4f4', x + 1, y);
  }
};
const ingots: VPaint = (g, f, _v, r) => {
  const rows = I(r, 1, 3);
  for (let k = 0; k < rows; k++) {
    const y = 12 - k * 2, x0 = 2 + k * 2 + I(r, 0, 1);
    for (let x = x0; x <= 12 - k * 2; x += 5) { px(g, '#b13e53', x, y, 4, 2); px(g, (f + k + x) % 3 === 0 ? '#ffcd75' : '#ef7d57', x, y, 4, 1); }
  }
};
const coal: VPaint = (g, f, _v, r) => {
  for (let k = 0; k < 6; k++) { const x = I(r, 2, 11), y = I(r, 8, 12); px(g, '#1c0f14', x, y, I(r, 2, 4), 2); }
  for (let k = 0; k < 3; k++) px(g, '#4a4d58', I(r, 3, 12), I(r, 8, 11));
  for (let k = 0; k < 3; k++) px(g, (k + f) % 2 ? '#ffcd75' : '#ef7d57', I(r, 3, 12), I(r, 9, 12));
};

// ---- flach im Boden ----
const slab: VPaint = (g, _f, v, r) => {
  const w = I(r, 8, 11), h = I(r, 6, 9), x = (16 - w) >> 1, y = (16 - h) >> 1;
  px(g, '#333c57', x, y, w, h); px(g, '#566c86', x, y, w, 1); px(g, '#566c86', x, y, 1, h);
  const cx = x + (w >> 1), cy = y + (h >> 1);
  if (v === 0) { px(g, '#1a1c2c', cx - 1, y + 2, 1, h - 4); px(g, '#1a1c2c', cx - 3, cy - 1, 5, 1); }
  else if (v === 1) { px(g, '#1a1c2c', cx - 2, cy - 2, 4, 3); px(g, '#566c86', cx - 1, cy - 1); px(g, '#566c86', cx + 1, cy - 1); px(g, '#1a1c2c', cx - 1, cy + 1, 2, 1); }
  else for (let k = 0; k < 3; k++) px(g, '#1a1c2c', x + 2, y + 2 + k * 2, w - 4 - I(r, 0, 2), 1);
  if (r() < 0.5) px(g, '#1a1c2c', x + w - 3, y + h - 2, 2, 1); // Sprung
};
const puddle: VPaint = (g, f, _v, r) => {
  const cx = 8 + (r() - 0.5) * 3, cy = 8 + (r() - 0.5) * 2;
  for (let k = 0; k < 3; k++) {
    const ox = cx + (r() - 0.5) * 6, oy = cy + (r() - 0.5) * 3, rx = 2.5 + r() * 2.5, ry = 1.5 + r() * 1.5;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (((x - ox) / rx) ** 2 + ((y - oy) / ry) ** 2 <= 1) px(g, '#29366f', x, y);
  }
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (((x - cx) / 3) ** 2 + ((y - cy) / 1.4) ** 2 <= 1) px(g, '#3b5dc9', x, y);
  px(g, '#73eff7', Math.round(cx) - 2 + f * 3, Math.round(cy) - 1, 2, 1);
};
const grate: VPaint = (g, f, v) => {
  if (v === 0) {
    px(g, '#4a4d58', 3, 3, 10, 10); px(g, '#1c0f14', 4, 4, 8, 8);
    for (let x = 5; x < 12; x += 2) px(g, f ? '#ef7d57' : '#b13e53', x, 5, 1, 6);
    px(g, '#8b8f9c', 3, 3, 10, 1); px(g, '#8b8f9c', 4, 7, 8, 1);
  } else {
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      const d = (x - 5) ** 2 + (y - 5) ** 2;
      if (d > 25) continue;
      px(g, d > 18 ? '#4a4d58' : x % 2 === 0 ? '#8b8f9c' : (x + y + f) % 4 ? '#b13e53' : '#ef7d57', 2 + x, 2 + y);
    }
  }
};

// ---- added decor (phase 4b): more silhouettes per biome ----
// crypt: skull shelf in a wall niche, rusty wall grate, broken urns, wax puddle, rune circle
const skullShelf: VPaint = (g, f, v) => {
  px(g, '#14172a', 3, 2, 10, 9); px(g, '#333c57', 3, 2, 10, 1); px(g, '#566c86', 2, 11, 12, 1); // niche and ledge
  const skull = (x: number) => { px(g, '#c9d4dc', x, 7, 3, 3); px(g, '#1a1c2c', x, 8); px(g, '#1a1c2c', x + 2, 8); px(g, '#94b0c2', x, 10, 3, 1); };
  if (v === 0) { skull(4); skull(9); } else { skull(6); px(g, '#d9cfb4', 10, 9, 1, 2); px(g, f ? '#ffcd75' : '#ef7d57', 10, 8); }
};
const wallGrate: VPaint = (g, _f, v) => {
  px(g, '#1a1c2c', 4, 3, 8, 7); px(g, '#4a4d58', 4, 3, 8, 1); px(g, '#4a4d58', 4, 9, 8, 1);
  for (let x = 5; x < 12; x += 2) px(g, '#8b8f9c', x, 4, 1, 5);
  if (v === 1) { px(g, '#7d2b45', 6, 9, 1, 3); px(g, '#7d2b45', 9, 9, 1, 2); } // rust streaks
};
const urns: VPaint = (g, _f, v, r) => {
  const urn = (x: number, y: number) => { px(g, '#8a5a3a', x, y, 4, 4); px(g, '#c48a6a', x, y, 1, 3); px(g, '#5a3a28', x + 1, y - 1, 2, 1); };
  urn(3, 9);
  // shards
  for (let k = 0; k < 5; k++) px(g, k % 2 ? '#c48a6a' : '#8a5a3a', I(r, 6, 13), I(r, 11, 13), I(r, 1, 2), 1);
  if (v === 1) urn(9, 10);
};
const wax: VPaint = (g, f, _v, r) => {
  for (let k = 0; k < 3; k++) { const x = I(r, 3, 10), y = I(r, 9, 12); px(g, '#d9cfb4', x, y, I(r, 2, 4), 1); }
  px(g, '#d9cfb4', 7, 9, 1, 3); px(g, f ? '#ffcd75' : '#ef7d57', 7, 8);
};
// Rune circle: engraved into the floor over 3×3 tiles (48×48 px, centre at 24,24).
// Dark groove with a faint lit lower lip, worn in places; glyphs and inlay in muted blue. No flicker.
const runeCircle: VPaint = (g, _f, _v, r) => {
  const C = 24, SQ = 0.86;
  const groove = (x: number, y: number) => { g.globalAlpha = 0.7; px(g, '#0d0e17', x, y); g.globalAlpha = 0.2; px(g, '#94b0c2', x, y + 1); g.globalAlpha = 1; };
  const inlay = (x: number, y: number, a = 0.4) => { g.globalAlpha = a; px(g, '#3b5dc9', x, y); g.globalAlpha = 1; };
  const ring = (rx: number, wear: number, dot: ((x: number, y: number) => void) = groove) => {
    const seen = new Set<number>(), n = Math.ceil(rx * 8);
    for (let k = 0; k < n; k++) {
      const t = (k / n) * Math.PI * 2, x = Math.round(C + Math.cos(t) * rx), y = Math.round(C + Math.sin(t) * rx * SQ);
      if (seen.has(y * 64 + x)) continue;
      seen.add(y * 64 + x);
      if (r() >= wear) dot(x, y);
    }
  };
  ring(21, 0.1); ring(16, 0.08);
  ring(18.5, 0.55, (x, y) => inlay(x, y, 0.3)); // faded inlay line between the outer grooves
  ring(8, 0.06);
  // eight glyphs in the band between the outer rings
  const GLYPHS = [[[0, -1], [0, 0], [0, 1], [-1, -1], [1, -1]], [[-1, 0], [0, 0], [1, 0], [0, 1]], [[-1, -1], [0, 0], [1, 1], [1, -1]], [[0, -1], [-1, 0], [1, 0], [0, 1]],
    [[-1, -1], [-1, 0], [-1, 1], [0, 0], [1, 1]], [[0, -1], [0, 0], [1, 1], [-1, 1]], [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]], [[-1, -1], [1, -1], [0, 0], [0, 1]]];
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2 + Math.PI / 8, gx = Math.round(C + Math.cos(t) * 18.5), gy = Math.round(C + Math.sin(t) * 18.5 * SQ);
    for (const [dx, dy] of GLYPHS[(k + I(r, 0, 7)) % 8]) { groove(gx + dx, gy + dy); inlay(gx + dx, gy + dy, 0.35); }
  }
  // four spokes from the inner ring out to the band, and a small sigil in the middle
  for (let k = 0; k < 4; k++) {
    const t = (k / 4) * Math.PI * 2;
    for (let d = 9; d <= 15; d++) if (r() > 0.12) groove(Math.round(C + Math.cos(t) * d), Math.round(C + Math.sin(t) * d * SQ));
  }
  for (const [dx, dy] of [[0, -3], [-1, -2], [1, -2], [-2, -1], [2, -1], [-3, 0], [3, 0], [-2, 1], [2, 1], [-1, 2], [1, 2], [0, 3]]) groove(C + dx, C + dy);
  inlay(C, C, 0.5); inlay(C - 1, C, 0.3); inlay(C + 1, C, 0.3);
};
// cave: glowing vines, egg cluster, scattered stones
const vines: VPaint = (g, f, _v, r) => {
  for (let k = 0; k < 3; k++) {
    let x = I(r, 2, 13);
    for (let y = 0; y < I(r, 6, 12); y++) { px(g, '#1e6b3a', x, y); if (y % 3 === 2) px(g, (y + f) % 2 ? '#a7f070' : '#73eff7', x + 1, y); if (r() < 0.25) x += r() < 0.5 ? -1 : 1; }
  }
};
const eggs: VPaint = (g, f, _v, r) => {
  for (let k = 0; k < I(r, 3, 5); k++) {
    const x = I(r, 2, 11), y = I(r, 8, 11);
    px(g, '#d9cfb4', x, y, 3, 3); px(g, '#c9d4dc', x, y, 1, 1); px(g, '#9a4fc0', x + 1, y + 2, 2, 1);
  }
  px(g, '#5d275d', 2, 13, 12, 1);
  if (f) px(g, '#a7f070', 7, 10); // something moves inside
};
const stones: VPaint = (g, _f, _v, r) => {
  for (let k = 0; k < 6; k++) { const x = I(r, 2, 12), y = I(r, 4, 12), w = I(r, 1, 3); px(g, '#2f8f85', x, y, w, 2); px(g, '#55b89c', x, y, w, 1); px(g, '#0d2222', x, y + 2, w, 1); }
};
// forge: anvil, slag bucket, steam pipes, lava crack at the wall foot
const anvil: VPaint = (g, f) => {
  px(g, '#4a4d58', 3, 7, 10, 2); px(g, '#8b8f9c', 3, 7, 10, 1); px(g, '#4a4d58', 1, 7, 2, 1); // horn
  px(g, '#4a4d58', 6, 9, 4, 3); px(g, '#333c57', 4, 12, 8, 2);
  if (f) { px(g, '#ffcd75', 8, 6); px(g, '#ef7d57', 10, 5); } // sparks
};
const bucket: VPaint = (g, f) => {
  px(g, '#4a4d58', 4, 8, 7, 5); px(g, '#8b8f9c', 4, 8, 7, 1); px(g, '#1c0f14', 5, 9, 5, 1);
  px(g, f ? '#ef7d57' : '#b13e53', 6, 9, 3, 1); px(g, '#8b8f9c', 3, 6, 1, 3); px(g, '#8b8f9c', 11, 6, 1, 3); px(g, '#8b8f9c', 4, 5, 7, 1);
};
const pipes: VPaint = (g, f, v) => {
  px(g, '#4a4d58', 2, 3, 12, 2); px(g, '#8b8f9c', 2, 3, 12, 1);
  px(g, '#4a4d58', v ? 10 : 5, 5, 2, 6); px(g, '#8b8f9c', v ? 10 : 5, 5, 1, 6);
  px(g, '#5a3a28', 7, 2, 3, 1); // valve
  // steam puff
  g.globalAlpha = 0.6; px(g, '#c9d4dc', (v ? 10 : 5) - 1 + f, 11 + f, 3, 1); px(g, '#94b0c2', (v ? 10 : 5) + f, 12 + f, 2, 1); g.globalAlpha = 1;
};
const lavaCrack: VPaint = (g, f, _v, r) => {
  let x = I(r, 3, 6);
  for (let y = 7; y < 15; y++) { px(g, '#1c0f14', x - 1, y, 3, 1); px(g, (y + f) % 3 ? '#ef7d57' : '#ffcd75', x, y); if (r() < 0.4) x += r() < 0.5 ? -1 : 1; }
};

const warm = (r: number, a = 0.75) => (f: number) => ({ r: r + (f ? 0.15 : 0), col: '#ef7d57', a });

// Catalogue per biome and kind. A "family" is one spec (one kind of thing: chains, banners, candles …);
// its entries are the variants and their mirrored versions. The catalogue is plain data, so placement
// can reason about families without baking any canvas.
type Catalog = Record<PropKind, Spec[]>;
let CAT: Catalog[] | null = null;
function catalog(): Catalog[] {
  if (CAT) return CAT;
  CAT = [
    { wall: [{ paint: chains, n: 3 }, { paint: cobweb, n: 2 }, { paint: banner, n: 3 }, { paint: skullShelf, n: 2, frames: 2 }, { paint: wallGrate, n: 2 }],
      foot: [{ paint: candles, n: 4, frames: 2, line: true, light: f => ({ r: 1.7 + (f ? 0.15 : 0), col: '#ffcd75', a: 0.8 }), ly: 0.6 }, { paint: bones, n: 3, line: true },
        { paint: urns, n: 2, line: true }, { paint: wax, n: 2, frames: 2, light: f => ({ r: 1.3 + (f ? 0.1 : 0), col: '#ffcd75', a: 0.7 }), ly: 0.6 }],
      flat: [{ paint: slab, n: 3 }, { paint: runeCircle, n: 1, span: 3, mirror: false, light: () => ({ r: 2.6, col: '#3b5dc9', a: 0.22 }), ly: 0.5 }] },
    { wall: [{ paint: roots, n: 3 }, { paint: drips, n: 3, frames: 2 }, { paint: glowmoss, n: 2, frames: 2, light: () => ({ r: 1.4, col: '#a7f070', a: 0.6 }), ly: 0.3 },
        { paint: vines, n: 2, frames: 2, light: () => ({ r: 1.3, col: '#73eff7', a: 0.5 }), ly: 0.4 }],
      foot: [{ paint: crystals, n: 3, line: true, light: (_f, v) => ({ r: 2.4, col: CRYSTAL[v % 3][3], a: 0.9 }), ly: 0.5 },
        { paint: shrooms, n: 4, line: true, light: (_f, v) => ({ r: 1.8, col: v % 2 ? '#73eff7' : '#a7f070', a: 0.8 }), ly: 0.6 },
        { paint: eggs, n: 2, frames: 2, line: true }],
      flat: [{ paint: puddle, n: 4, frames: 2 }, { paint: stones, n: 3 }] },
    { wall: [{ paint: hooks, n: 3 }, { paint: vent, n: 2, frames: 2, light: warm(1.4, 0.6), ly: 0.3 }, { paint: pipes, n: 2, frames: 2 }],
      foot: [{ paint: ingots, n: 3, frames: 2, line: true, light: warm(1.6), ly: 0.7 }, { paint: coal, n: 3, frames: 2, line: true, light: warm(1.2, 0.6), ly: 0.7 },
        { paint: anvil, n: 1, frames: 2, line: true }, { paint: bucket, n: 1, frames: 2, line: true, light: warm(1.1, 0.5), ly: 0.6 },
        { paint: lavaCrack, n: 2, frames: 2, light: warm(1.5, 0.7), ly: 0.6 }],
      flat: [{ paint: grate, n: 2, frames: 2, light: warm(1.7, 0.7), ly: 0.5 }] },
  ];
  return CAT;
}
// Entry list of a biome/kind: family (spec index) and footprint of every pick, in bake order
interface Entry { fam: number; span: number }
const ENTRIES = new Map<string, Entry[]>();
export function entries(bi: number, kind: PropKind): Entry[] {
  const key = `${bi}:${kind}`;
  let e = ENTRIES.get(key);
  if (!e) {
    e = [];
    catalog()[bi][kind].forEach((sp, fam) => { for (let k = sp.n * (sp.mirror === false ? 1 : 2); k > 0; k--) e!.push({ fam, span: sp.span ?? 1 }); });
    ENTRIES.set(key, e);
  }
  return e;
}
export const propFamily = (bi: number, p: PropSpot) => `${p.kind}:${entries(bi, p.kind)[p.pick % entries(bi, p.kind).length].fam}`;

interface BiomeProps { wall: Prop[]; foot: Prop[]; flat: Prop[]; }
let SETS: BiomeProps[] | null = null;
function sets(): BiomeProps[] {
  if (SETS) return SETS;
  const bake = (l: Spec[]) => l.flatMap(bakeSpec);
  SETS = catalog().map(c => ({ wall: bake(c.wall), foot: bake(c.foot), flat: bake(c.flat) }));
  return SETS;
}

// ---- Placement (pure, testable) ----
// 1. Candidates by fixed rules: wall decor on straight wall fronts, foot decor at the foot of a straight
//    wall, flat floor patterns only in open floor. Never inside or around a puzzle chamber, never next to
//    an object (pot, barrel, chest …) or the stairs, never on a corridor or doorway.
// 2. Spacing: of candidates closer than SPACING tiles only the one with the largest hash stays.
// 3. Variety: every kept spot gets the variant whose family is least used nearby (no two candle groups
//    or banners side by side); ties are broken by the spot's hash.
export type PropKind = 'wall' | 'foot' | 'flat';
export interface PropSpot { kind: PropKind; pick: number; }
// area that stays bare (puzzle chamber incl. its walls), inclusive tile bounds
export interface Zone { x0: number; y0: number; x1: number; y1: number }
export const SPACING = 3, VARIETY_R = 9, TORCH_CLEAR = 1;
const hp = (x: number, y: number, s: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0;
// tiles a foot or floor decor may stand beside: open ground (no object, no stairs, no puzzle tile)
const OPEN = new Set<number>([T.FLOOR, T.GRASS, T.BURNT, T.RUBBLE, T.OIL, T.WATER, T.WEB]);
// a doorway: walkable tile squeezed between two walls (horizontal or vertical passage)
function doorway(tiles: Uint8Array, i: number): boolean {
  const t = tiles[i];
  if (!walkable(t)) return false;
  return (wallLike(tiles[i - 1]) && wallLike(tiles[i + 1])) || (wallLike(tiles[i - W]) && wallLike(tiles[i + W]));
}

function candidate(tiles: Uint8Array, seed: number, x: number, y: number, zone: Zone | null, torch: Set<number>): (PropSpot & { h: number }) | null {
  if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) return null;
  if (zone && x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1) return null;
  const i = y * W + x, t = tiles[i], h = hp(x, y, seed);
  const at = (dx: number, dy: number) => tiles[i + dy * W + dx];
  const wallAt = (dx: number, dy: number) => wallLike(at(dx, dy));
  const open = (dx: number, dy: number) => OPEN.has(at(dx, dy)) && !doorway(tiles, i + dy * W + dx);
  if (t === T.WALL) {
    // straight wall front: left and right also front, no passage, no corner; not crowding a torch
    const front = (dx: number) => at(dx, 0) === T.WALL && OPEN.has(at(dx, 1));
    if (!(front(0) && front(-1) && front(1)) || h % 5) return null;
    for (let d = -TORCH_CLEAR; d <= TORCH_CLEAR; d++) if (torch.has(i + d)) return null;
    return { kind: 'wall', pick: 0, h };
  }
  if (t !== T.FLOOR || doorway(tiles, i)) return null;
  // at the foot of a straight wall in a room at least three tiles deep, with open ground around
  if (wallAt(-1, -1) && wallAt(0, -1) && wallAt(1, -1)) {
    if (!(open(-1, 0) && open(1, 0) && open(0, 1) && open(-1, 1) && open(1, 1) && open(0, 2))) return null;
    return h % 6 === 0 ? { kind: 'foot', pick: 0, h } : null;
  }
  // flat in the floor only in big rooms: 5×5 of open ground around (also fits the 3×3 rune circle)
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!open(dx, dy)) return null;
  return h % 17 === 0 ? { kind: 'flat', pick: 0, h } : null;
}

// Decor of a whole floor; cached, recomputed as soon as the map (or the bare zone) changes
let cache: { key: string; tiles: Uint8Array; map: (PropSpot | null)[] } | null = null;
export function propsFor(tiles: Uint8Array, seed: number, bi = 0, zone: Zone | null = null): (PropSpot | null)[] {
  const key = `${seed}:${bi}:${zone ? [zone.x0, zone.y0, zone.x1, zone.y1].join(',') : '-'}`;
  if (cache && cache.key === key && cache.tiles.length === tiles.length) {
    let same = true;
    for (let i = 0; i < tiles.length; i++) if (cache.tiles[i] !== tiles[i]) { same = false; break; }
    if (same) return cache.map;
  }
  const torch = new Set(torchSpots(tiles, seed));
  const cand: ((PropSpot & { h: number }) | null)[] = new Array(W * H).fill(null);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cand[y * W + x] = candidate(tiles, seed, x, y, zone, torch);
  const kept: { i: number; c: PropSpot & { h: number } }[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = cand[y * W + x];
    if (!c) continue;
    let best = true;
    for (let dy = -SPACING; dy <= SPACING && best; dy++) for (let dx = -SPACING; dx <= SPACING; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const o = cand[ny * W + nx];
      if (o && (o.h > c.h || (o.h === c.h && ny * W + nx < y * W + x))) { best = false; break; }
    }
    if (best) kept.push({ i: y * W + x, c });
  }
  // variety: assign variants in a fixed order (largest hash first), each avoiding the families around it
  kept.sort((a, b) => b.c.h - a.c.h || a.i - b.i);
  const map: (PropSpot | null)[] = new Array(W * H).fill(null);
  const placed: { x: number; y: number; kind: PropKind; fam: number; pick: number }[] = [];
  for (const { i, c } of kept) {
    const x = i % W, y = (i / W) | 0, list = entries(bi, c.kind);
    let bestPick = -1, bestScore = Infinity;
    for (let k = 0; k < list.length; k++) {
      const pick = (k + (c.h >>> 7)) % list.length, e = list[pick];
      // the 3×3 rune circle only where the whole pattern lies on open floor
      if (e.span > 1 && c.kind !== 'flat') continue;
      let score = 0;
      for (const o of placed) {
        const d = Math.max(Math.abs(o.x - x), Math.abs(o.y - y));
        if (d > VARIETY_R * 2 || o.kind !== c.kind) continue;
        if (o.fam === e.fam) score += d <= VARIETY_R ? 100 : 10;
        if (o.pick === pick) score += 1000;
      }
      if (score < bestScore) { bestScore = score; bestPick = pick; }
      if (!score) break;
    }
    const pick = bestPick < 0 ? (c.h >>> 7) % list.length : bestPick;
    map[i] = { kind: c.kind, pick };
    placed.push({ x, y, kind: c.kind, fam: list[pick].fam, pick });
  }
  cache = { key, tiles: tiles.slice(), map };
  return map;
}
export const propAt = (tiles: Uint8Array, seed: number, x: number, y: number, bi = 0, zone: Zone | null = null) => propsFor(tiles, seed, bi, zone)[y * W + x];

// Torches: candidates on wall fronts, of close ones only one stays (at least TORCH_GAP + 1 tiles apart)
export const TORCH_GAP = 4;
export function torchSpots(tiles: Uint8Array, seed: number): number[] {
  const cand = (x: number, y: number) => {
    const i = y * W + x;
    return x > 0 && y > 0 && x < W - 1 && y < H - 1 && tiles[i] === T.WALL && walkable(tiles[i + W]) && hp(x, y, seed) % 5 === 0;
  };
  const out: number[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!cand(x, y)) continue;
    const h = hp(x, y, seed ^ 0x5bd1);
    let best = true;
    for (let dy = -TORCH_GAP; dy <= TORCH_GAP && best; dy++) for (let dx = -TORCH_GAP; dx <= TORCH_GAP; dx++) {
      if ((dx || dy) && cand(x + dx, y + dy)) { const o = hp(x + dx, y + dy, seed ^ 0x5bd1); if (o > h || (o === h && dy * W + dx < 0)) { best = false; break; } }
    }
    if (best) out.push(y * W + x);
  }
  return out;
}

export function drawProp(ctx: CanvasRenderingContext2D, bi: number, p: PropSpot, x: number, y: number, dx: number, dy: number, time: number, lights: Light[]) {
  const list = sets()[bi][p.kind], prop = list[p.pick % list.length];
  const f = prop.frames.length > 1 ? Math.floor(time * 4 + x * 0.7 + y) % prop.frames.length : 0;
  if (prop.span > 1) { drawPropSlice(ctx, bi, p, 0, 0, dx, dy, time, x, y); }
  else ctx.drawImage(prop.frames[f], dx, dy);
  if (prop.light) lights.push({ x, y: y + (prop.ly ?? 0.4) - 0.5, ...prop.light(f) });
}
// footprint of a prop in tiles (1 for most, 3 for the rune circle)
export function propSpan(bi: number, p: PropSpot): number { const list = sets()[bi][p.kind]; return list[p.pick % list.length].span; }
// one tile of a multi-tile prop: (sx, sy) is this tile's offset from the prop's centre tile
export function drawPropSlice(ctx: CanvasRenderingContext2D, bi: number, p: PropSpot, sx: number, sy: number, dx: number, dy: number, time: number, cx: number, cy: number) {
  const list = sets()[bi][p.kind], prop = list[p.pick % list.length], h = prop.span >> 1;
  const f = prop.frames.length > 1 ? Math.floor(time * 4 + cx * 0.7 + cy) % prop.frames.length : 0;
  ctx.drawImage(prop.frames[f], (sx + h) * TS, (sy + h) * TS, TS, TS, dx, dy, TS, TS);
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

// Für Galerie-Bildschirmfotos: alle Spielarten je Biom und Art
export const propSets = () => sets();
