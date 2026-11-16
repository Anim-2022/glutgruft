// Palette, Sprite-Atlas und Pixeltext. Alles wird beim Start im Code erzeugt.
export const VW = 480, VH = 270, TS = 16;

export const PAL: Record<string, string> = {
  k: '#1a1c2c', w: '#f4f4f4', g: '#94b0c2', d: '#566c86', r: '#b13e53', o: '#ef7d57', y: '#ffcd75',
  l: '#a7f070', G: '#38b764', t: '#257179', b: '#3b5dc9', c: '#41a6f6', s: '#73eff7', p: '#5d275d',
  n: '#8a5a3a', h: '#e8b796', v: '#9a4fc0',
};

// 8x8-Matrizen, doppelt skaliert auf 16x16
const SPR: Record<string, string[]> = {
  krieger: ['..gggg..', '..gddg.w', '..hhhh.w', '.rrrrr.w', 'grrrrrgw', 'g.rrrr.n', '..d.d...', '.dd.dd..'],
  magier: ['...bb...', '..bbbb..', '.bbbbbb.', '..hhhh.s', '.bbbbb.n', '.bcbcb.n', '.bbbbb.n', '..d..d.n'],
  waldlaeufer: ['..GGGG..', '.GGGGG.n', '..hhhhn.', '.GGGG.n.', '.GnGGGn.', '.GGGG.n.', '..n.n..n', '.nn.nn..'],
  ratte: ['........', '........', '.d....d.', '.ddddd..', 'dkddddd.', 'hdddddd.', '.d.d.d.h', '........'],
  skelett: ['..wwww..', '..wkwk..', '..wwww..', '...ww...', '.wwwwww.', 'w.wwww.w', '..w..w..', '.ww..ww.'],
  schuetze: ['..wwww..', '..wkwk.n', '..wwwwn.', '...ww.n.', '.wwwwwn.', '..wwwwn.', '..w..w.n', '.ww..ww.'],
  fledermaus: ['........', 'v......v', 'vv.vv.vv', 'vvvvvvvv', 'vvrvvrvv', 'v.vvvv.v', '...vv...', '........'],
  sporling: ['..rrrr..', '.rwrrwr.', 'rrrrrrrr', 'rrwrrrrr', '..yyyy..', '..ykyk..', '..yyyy..', '.yy..yy.'],
  golem: ['.dddddd.', '.dodood.', '.dddddd.', 'dddddddd', 'dg.dd.gd', 'dd.dd.dd', '.dd..dd.', '.dd..dd.'],
  glutgeist: ['...o....', '..oyo...', '.oyyyo..', '.oywyo..', 'oykyykyo', 'oyyyyyyo', '.oyyyyo.', '..oooo..'],
  koenig: ['.y.yy.y.', '.yyyyyy.', '..wkwk..', '..wwww..', 'vvvwwvvv', 'vwvvvvwv', '.vvvvvv.', '.vv..vv.'],
  mutter: ['.GGGGGG.', 'GlGGGlGG', 'GGGGGGGG', 'GGlGGGGl', '.yyyyyy.', '.yrkyrk.', '.yyyyyy.', 'yy.yy.yy'],
  fuerst: ['o.dddd.o', 'oddddddo', '.dyddyd.', '.dddddd.', 'rddrrddr', 'rddooddr', '.dd..dd.', '.oo..oo.'],
  stairs: ['kkkkkkkk', 'gggggggk', 'dddddddk', 'kkgggggk', 'kkdddddk', 'kkkkgggk', 'kkkkdddk', 'kkkkkkgk'],
  chest: ['........', '.nnnnnn.', 'nyyyyyyn', 'nnnnnnnn', 'nnnyynnn', 'nnnyynnn', 'nnnnnnnn', '........'],
  chest_open: ['.nnnnnn.', 'n.kkkk.n', 'nnnnnnnn', 'nkkkkkkn', 'nnnnnnnn', 'nnnnnnnn', 'nnnnnnnn', '........'],
  altar: ['...ss...', '..scss..', '...ss...', '.gggggg.', '..gddg..', '..gddg..', '.gggggg.', 'dddddddd'],
  altar_used: ['........', '........', '........', '.gggggg.', '..gddg..', '..gddg..', '.gggggg.', 'dddddddd'],
  trap: ['........', '........', '........', '.g.g.g.g', 'gdgdgdgd', 'dddddddd', '........', '........'],
  potion: ['...gg...', '...gg...', '..gggg..', '.grrrrg.', '.grwrrg.', '.grrrrg.', '..gggg..', '........'],
  soul: ['........', '...s....', '..scs...', '.scwcs..', '.scccs..', '..scs...', '...s....', '........'],
};
const NO_OUTLINE = new Set(['stairs', 'trap']);

export const sprites: Record<string, HTMLCanvasElement> = {};

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

export function hex(col: string): [number, number, number] {
  const n = parseInt(col.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export interface TileSet { floor: HTMLCanvasElement[]; wall: HTMLCanvasElement; top: HTMLCanvasElement; }
export const tilesets: TileSet[] = [];

const BIOMES = [
  { floor: '#343a5c', speck: '#434a70', brick: '#6b82a0', hi: '#8ea4bf', mortar: '#333c5c', top: '#20243a' },
  { floor: '#22443f', speck: '#2f6a55', brick: '#2f8f85', hi: '#55b89c', mortar: '#174a4c', top: '#16302f' },
  { floor: '#40262b', speck: '#6a3530', brick: '#9a4a3c', hi: '#c96f45', mortar: '#47222b', top: '#2a171d' },
];

export function bake(): void {
  for (const [name, rows] of Object.entries(SPR)) {
    const [c, g] = mk(TS, TS);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = PAL[ch];
      g.fillRect(x * 2, y * 2, 2, 2);
    }));
    if (!NO_OUTLINE.has(name)) outline(g);
    sprites[name] = c;
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
    tilesets.push({ floor, wall, top });
  }
}

function outline(g: CanvasRenderingContext2D) {
  const d = g.getImageData(0, 0, TS, TS), src = new Uint8ClampedArray(d.data);
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < TS && y < TS && src[(y * TS + x) * 4 + 3] > 0;
  const [r, gg, b] = hex(PAL.k);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (op(x, y) || !(op(x + 1, y) || op(x - 1, y) || op(x, y + 1) || op(x, y - 1))) continue;
    const i = (y * TS + x) * 4;
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
  const k = size < 14 ? 1 : size < 30 ? 2 : 5;
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

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, border = '#566c86', fill = 'rgba(13,14,23,0.88)') {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
}

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, col: string) {
  ctx.fillStyle = '#0d0e17'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#333c57'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), 1);
}
