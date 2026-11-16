// Palette, Sprite-Atlas und Pixeltext. Alles wird beim Start im Code erzeugt.
export const VW = 640, VH = 360, TS = 16;

import { PAL, SPR, ACTORS, NO_OUTLINE, VIEWS, FLOATERS } from './sprites';
export { PAL };

export const sprites: Record<string, HTMLCanvasElement> = {};
export const masks: Record<string, HTMLCanvasElement> = {}; // weiße Silhouetten für Trefferblitze

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

export function hex(col: string): [number, number, number] {
  const n = parseInt(col.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export interface TileSet { floor: HTMLCanvasElement[]; wall: HTMLCanvasElement; top: HTMLCanvasElement; grass: HTMLCanvasElement[]; burnt: HTMLCanvasElement; decals: HTMLCanvasElement[]; }
export const tilesets: TileSet[] = [];

const BIOMES = [
  { floor: '#343a5c', speck: '#434a70', brick: '#6b82a0', hi: '#8ea4bf', mortar: '#333c5c', top: '#20243a', g1: '#3f7a5c', g2: '#5fa06a' },
  { floor: '#22443f', speck: '#2f6a55', brick: '#2f8f85', hi: '#55b89c', mortar: '#174a4c', top: '#16302f', g1: '#38b764', g2: '#a7f070' },
  { floor: '#40262b', speck: '#6a3530', brick: '#9a4a3c', hi: '#c96f45', mortar: '#47222b', top: '#2a171d', g1: '#1f1418', g2: '#6b4a3a' },
];

export function bake(): void {
  const draw = (rows: string[], line: boolean) => {
    const [c, g] = mk(rows[0].length, rows.length);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = PAL[ch];
      g.fillRect(x, y, 1, 1);
    }));
    if (line) outline(g, c.width, c.height);
    return c;
  };
  const mask = (n: string) => {
    const [m, g] = mk(sprites[n].width, sprites[n].height);
    g.drawImage(sprites[n], 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff'; g.fillRect(0, 0, m.width, m.height);
    masks[n] = m;
  };
  for (const [name, rows] of Object.entries(SPR)) sprites[name] = draw(rows, !NO_OUTLINE.has(name));
  // Figuren: je Blickrichtung (f vorn, b hinten, s Seite) vier Bilder – 0 Stand, 1 Atmen, 2/3 Schritt
  for (const name of ACTORS) {
    const views: Record<string, string[]> = { f: SPR[name], b: VIEWS[name].b, s: VIEWS[name].s };
    for (const [v, rows] of Object.entries(views)) {
      const h = rows.length, w = rows[0].length, half = w >> 1;
      const breath = ['.'.repeat(w), ...rows.slice(0, h - 4), ...rows.slice(h - 3)];
      const lift = (left: boolean) => rows.map((r, y) => (y !== h - 1 ? r : left ? '.'.repeat(half) + r.slice(half) : r.slice(0, half) + '.'.repeat(w - half)));
      const alt = VIEWS[name].alt ?? breath;
      const frames = FLOATERS.has(name) ? [rows, alt, alt, rows] : [rows, breath, lift(true), lift(false)];
      frames.forEach((f, i) => { const key = `${name}:${v}${i}`; sprites[key] = draw(f, true); mask(key); });
    }
    sprites[name + '_b'] = sprites[`${name}:f1`];
  }
  // Fackel (zwei Flackerbilder)
  for (const f of [0, 1]) {
    const [c, g] = mk(TS, TS);
    g.fillStyle = '#5a3a28'; g.fillRect(7, 8, 2, 5);
    g.fillStyle = '#333c57'; g.fillRect(6, 12, 4, 1);
    g.fillStyle = '#ef7d57'; g.fillRect(6, 4 + f, 4, 4 - f); g.fillRect(7, 2 + f, 2, 2);
    g.fillStyle = '#ffcd75'; g.fillRect(7, 5, 2, 3); g.fillRect(7 + f, 4, 1, 1);
    g.fillStyle = '#f4f4f4'; g.fillRect(7, 7, 1, 1);
    sprites[`torch${f}`] = c;
  }
  // Eis
  {
    const [c, g] = mk(TS, TS);
    g.fillStyle = '#5aa9d6'; g.fillRect(0, 0, TS, TS);
    g.fillStyle = '#a8e0f0'; g.fillRect(2, 3, 5, 1); g.fillRect(3, 4, 2, 1); g.fillRect(9, 10, 4, 1); g.fillRect(11, 5, 2, 1);
    g.fillStyle = '#3b7fb0'; g.fillRect(0, 15, TS, 1); g.fillRect(15, 0, 1, TS); g.fillRect(6, 12, 3, 1);
    sprites.ice = c;
  }
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const b of BIOMES) {
    const floor: HTMLCanvasElement[] = [];
    for (let v = 0; v < 4; v++) {
      const [c, g] = mk(TS, TS);
      g.fillStyle = b.floor; g.fillRect(0, 0, TS, TS);
      g.fillStyle = b.speck;
      for (let i = 0; i < 3 + v; i++) g.fillRect((rnd() * 15) | 0, (rnd() * 15) | 0, rnd() < 0.3 ? 2 : 1, 1);
      if (v === 3) { g.fillRect(3, 9, 5, 1); g.fillRect(7, 10, 3, 1); }
      floor.push(c);
    }
    const [wall, wg] = mk(TS, TS);
    wg.fillStyle = b.mortar; wg.fillRect(0, 0, TS, TS);
    for (let r = 0; r < 4; r++) {
      const off = r % 2 ? -4 : 0;
      for (let x = off; x < TS; x += 8) {
        wg.fillStyle = b.brick; wg.fillRect(x, r * 4, 7, 3);
        wg.fillStyle = b.hi; wg.fillRect(x, r * 4, 7, 1);
      }
    }
    wg.fillStyle = 'rgba(0,0,0,0.35)'; wg.fillRect(0, 13, TS, 3);
    const [top, tg] = mk(TS, TS);
    tg.fillStyle = b.top; tg.fillRect(0, 0, TS, TS);
    tg.fillStyle = b.mortar; tg.fillRect(2, 3, 3, 1); tg.fillRect(9, 10, 4, 1);
    const grass: HTMLCanvasElement[] = [];
    for (let v = 0; v < 3; v++) {
      const [c, g] = mk(TS, TS);
      for (let i = 0; i < 9; i++) {
        const x = 1 + ((rnd() * 13) | 0), y = 3 + ((rnd() * 11) | 0);
        g.fillStyle = b.g1; g.fillRect(x, y, 1, 3); g.fillRect(x + 1, y + 1, 1, 2);
        g.fillStyle = b.g2; g.fillRect(x, y - 1, 1, 2);
      }
      grass.push(c);
    }
    const [burnt, bg] = mk(TS, TS);
    bg.fillStyle = 'rgba(0,0,0,0.45)'; bg.fillRect(0, 0, TS, TS);
    bg.fillStyle = '#566c86';
    for (let i = 0; i < 5; i++) bg.fillRect((rnd() * 15) | 0, (rnd() * 15) | 0, 1, 1);
    // Bodendekor: Knochen, Kiesel, Riss, Pfütze, biomtypischer Fleck
    const decals: HTMLCanvasElement[] = [];
    const decal = (f: (g: CanvasRenderingContext2D) => void) => { const [c, g] = mk(TS, TS); f(g); decals.push(c); };
    decal(g => { g.fillStyle = '#c9d4dc'; g.fillRect(4, 9, 7, 1); g.fillRect(3, 8, 2, 3); g.fillRect(10, 8, 2, 3); g.fillStyle = '#94b0c2'; g.fillRect(5, 10, 5, 1); });
    decal(g => { g.fillStyle = b.brick; g.fillRect(3, 5, 2, 2); g.fillRect(10, 9, 3, 2); g.fillRect(6, 12, 2, 1); g.fillStyle = b.hi; g.fillRect(3, 5, 2, 1); g.fillRect(10, 9, 3, 1); });
    decal(g => { g.fillStyle = b.top; g.fillRect(4, 4, 1, 3); g.fillRect(5, 6, 3, 1); g.fillRect(7, 7, 1, 3); g.fillRect(8, 9, 3, 1); g.fillRect(10, 10, 1, 2); });
    decal(g => { g.fillStyle = b.mortar; g.fillRect(4, 7, 8, 4); g.fillRect(5, 6, 6, 6); g.fillStyle = b.hi; g.fillRect(6, 7, 3, 1); });
    decal(g => { g.fillStyle = b.g1; g.fillRect(2, 11, 4, 2); g.fillRect(10, 3, 3, 2); g.fillStyle = b.g2; g.fillRect(3, 11, 2, 1); g.fillRect(11, 3, 1, 1); });
    tilesets.push({ floor, wall, top, grass, burnt, decals });
  }
}

function outline(g: CanvasRenderingContext2D, w: number, h: number) {
  const d = g.getImageData(0, 0, w, h), src = new Uint8ClampedArray(d.data);
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  const [r, gg, b] = hex(PAL.k);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (op(x, y) || !(op(x + 1, y) || op(x - 1, y) || op(x, y + 1) || op(x, y - 1))) continue;
    const i = (y * w + x) * 4;
    d.data[i] = r; d.data[i + 1] = gg; d.data[i + 2] = b; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
}

// Pixeltext: eigene 5x7-Bitmapschrift (spaltenweise, Bit 0 = oberste Zeile), proportional gesetzt.
const F57 = '0000000000 00005F0000 0007000700 147F147F14 242A7F2A12 2313086462 3649552250 0005030000 001C224100 0041221C00 14083E0814 08083E0808 0050300000 0808080808 0060600000 2010080402 ' +
  '3E5149453E 00427F4000 4261514946 2141454B31 1814127F10 2745454539 3C4A494930 0171090503 3649494936 064949291E 0036360000 0056360000 0814224100 1414141414 0041221408 0201510906 324979413E ' +
  '7E1111117E 7F49494936 3E41414122 7F4141221C 7F49494941 7F09090901 3E4149497A 7F0808087F 00417F4100 2040413F01 7F08142241 7F40404040 7F020C027F 7F0408107F 3E4141413E 7F09090906 3E4151215E 7F09192946 4649494931 01017F0101 3F4040403F 0718601807 3F4038403F 6314081463 0708700807 6151494543 ' +
  '007F414100 0204081020 0041417F00 0402010204 4040404040 0001020400 ' +
  '2054545478 7F48444438 3844444420 384444487F 3854545418 087E090102 18A4A4A47C 7F08040478 00447D4000 4080847D00 7F10284400 00417F4000 7C04180478 7C08040478 3844444438 FC24242418 18242424FC 7C08040408 4854545420 043F444020 3C4040207C 1C2040201C 3C4030403C 4428102844 1CA0A0A07C 4464544C44 0008364100 00007F0000 0041360800 0804081008';
const EXTRA: Record<string, string> = {
  'ä': '2055545578', 'ö': '3845444538', 'ü': '3C4140217C', 'Ä': '7D1212127D', 'Ö': '3D4242423D', 'Ü': '3D4040403D',
  'ß': '7E01494E30', '·': '0000080000', '–': '0808080808',
};
const GLYPH = new Map<string, number[]>();
F57.split(' ').forEach((h, i) => GLYPH.set(String.fromCharCode(32 + i), cols(h)));
for (const [ch, h] of Object.entries(EXTRA)) GLYPH.set(ch, cols(h));

function cols(h: string): number[] {
  let c = [0, 2, 4, 6, 8].map(i => parseInt(h.slice(i, i + 2), 16));
  while (c.length > 1 && !c[0]) c = c.slice(1);
  while (c.length > 1 && !c[c.length - 1]) c = c.slice(0, -1);
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();

function glyphs(s: string, col: string, size: number): HTMLCanvasElement {
  const key = `${size}|${col}|${s}`;
  let c = cache.get(key);
  if (c) return c;
  const k = size < 14 ? 1 : size < 20 ? 2 : size < 30 ? 3 : 5;
  const list = [...s].map(ch => (ch === ' ' ? [0, 0] : GLYPH.get(ch) ?? GLYPH.get('?')!));
  const w = list.reduce((n, g) => n + g.length + 1, 0);
  const [cv, g] = mk(Math.max(1, w * k), 8 * k);
  g.fillStyle = col;
  let x = 0;
  for (const gl of list) {
    gl.forEach((bits, i) => { for (let y = 0; y < 8; y++) if (bits & (1 << y)) g.fillRect((x + i) * k, y * k, k, k); });
    x += gl.length + 1;
  }
  if (cache.size > 800) cache.clear();
  cache.set(key, cv);
  return cv;
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, col = '#f4f4f4', size = 10, align: 'left' | 'center' | 'right' = 'left', shadow = true): number {
  if (!s) return 0;
  const c = glyphs(s, col, size);
  if (align === 'center') x -= c.width >> 1;
  else if (align === 'right') x -= c.width;
  x |= 0; y |= 0;
  if (shadow) ctx.drawImage(glyphs(s, '#0d0e17', size), x + 1, y + 1);
  ctx.drawImage(c, x, y);
  return c.width;
}

export function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}

// Rahmen im Pixelstil: dunkle Außenkante, farbiger Rand, Glanzlinie oben, betonte Ecken
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, border = '#566c86', fill = 'rgba(13,14,23,0.9)') {
  x |= 0; y |= 0; w |= 0; h |= 0;
  ctx.fillStyle = '#05060c';
  ctx.fillRect(x - 1, y, 1, h); ctx.fillRect(x + w, y, 1, h); ctx.fillRect(x, y - 1, w, 1); ctx.fillRect(x, y + h, w, 1);
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  if (w < 14 || h < 14) return;
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  ctx.fillStyle = border;
  for (const [cx, cy] of [[x + 1, y + 1], [x + w - 3, y + 1], [x + 1, y + h - 3], [x + w - 3, y + h - 3]]) ctx.fillRect(cx, cy, 2, 2);
}

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, col: string) {
  ctx.fillStyle = '#0d0e17'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#333c57'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), 1);
}
