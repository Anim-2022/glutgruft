// Bild (PNG) -> Sprite-Matrix im Format von src/render/sprites.ts.
// Keine Abhängigkeiten: PNG wird mit node:zlib gelesen und geschrieben.
//
//   node scripts/img2sprite.ts <bild.png> [--size 16] [--tol 12] [--empty 0.5] [--kweight 0.3] [--global] [--grid] [--name schuetze_test] [--out assets/_hf_test]
//   npx tsx scripts/img2sprite.ts ...  (geht genauso)
//
// Schritte: Hintergrund (Farbe der Ecken ± tol) -> transparent, auf Inhalt zuschneiden,
// quadratisch einpassen, auf size×size verkleinern (häufigste Farbe je Block, kein Mittelwert),
// auf die Spielpalette PAL abbilden, Matrix ausgeben, Vorschau ×8 speichern.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import { PAL } from '../src/render/sprites.ts';

interface Img { w: number; h: number; px: Uint8Array } // RGBA

// ---------- PNG lesen (8 bit, Farbtypen 0/2/3/4/6, ohne Interlace) ----------
function readPng(buf: Buffer): Img {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('keine PNG-Datei');
  let off = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  let plte: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), kind = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') plte = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`nicht unterstützt: Tiefe ${depth}, Interlace ${interlace}`);
  const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!ch) throw new Error(`Farbtyp ${type} nicht unterstützt`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch;
  const cur = new Uint8Array(stride), prev = new Uint8Array(stride), px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = (row[i] + p) & 255;
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 4;
      if (type === 0) px.set([cur[s], cur[s], cur[s], 255], d);
      else if (type === 2) px.set([cur[s], cur[s + 1], cur[s + 2], 255], d);
      else if (type === 3) { const k = cur[s]; px.set([plte![k * 3], plte![k * 3 + 1], plte![k * 3 + 2], trns && k < trns.length ? trns[k] : 255], d); }
      else if (type === 4) px.set([cur[s], cur[s], cur[s], cur[s + 1]], d);
      else px.set(cur.subarray(s, s + 4), d);
    }
    prev.set(cur);
  }
  return { w, h, px };
}

// ---------- PNG schreiben (RGBA, Filter 0) ----------
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function chunk(kind: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(kind, 4, 'ascii');
  let c = -1; for (const b of Buffer.concat([head.subarray(4), data])) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  const tail = Buffer.alloc(4); tail.writeInt32BE(~c, 0);
  return Buffer.concat([head, data, tail]);
}
function writePng(img: Img): Buffer {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) Buffer.from(img.px.buffer, img.px.byteOffset + y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Farben ----------
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PALETTE = Object.entries(PAL).map(([ch, h]) => ({ ch, rgb: hex(h) }));
// Gewichteter Abstand ("redmean"), näher am Auge als reines RGB
function dist(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}
function nearest(rgb: ArrayLike<number>): string {
  let best = '.', bd = Infinity;
  for (const p of PALETTE) { const d = dist(rgb, p.rgb); if (d < bd) { bd = d; best = p.ch; } }
  return best;
}

// ---------- Pipeline ----------
// Hintergrund = Pixel nahe einer Eckfarbe, die vom Rand aus zusammenhängend erreichbar sind.
// So bleiben dunkle Umrisse und Schatten im Inneren der Figur erhalten. --global: alle passenden Pixel.
function removeBackground(img: Img, tol: number, global: boolean): void {
  const { w, h, px } = img;
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map(i => Uint8Array.from(px.subarray(i * 4, i * 4 + 3)));
  const t = tol * tol * 9; // tol ≈ Abweichung pro Kanal, im gewichteten Abstand
  const isBg = (i: number) => corners.some(k => dist(px.subarray(i * 4, i * 4 + 3), k) <= t);
  if (global) { for (let i = 0; i < w * h; i++) if (isBg(i)) px[i * 4 + 3] = 0; return; }
  const seen = new Uint8Array(w * h), stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || !isBg(i)) continue;
    seen[i] = 1; px[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w); if (i < w * (h - 1)) stack.push(i + w);
  }
}

// Zuschneiden auf den Inhalt und quadratisch einpassen (zentriert, Seitenverhältnis bleibt)
function cropSquare(img: Img): { x0: number; y0: number; side: number } {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.px[(y * img.w + x) * 4 + 3] >= 128) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error('nach dem Entfernen des Hintergrunds ist nichts übrig – --tol verkleinern');
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.max(bw, bh);
  return { x0: x0 - Math.floor((side - bw) / 2), y0: y0 - Math.floor((side - bh) / 2), side };
}

// Jeder Zielpixel = häufigste Palettenfarbe seines Blocks (kein Mittelwert).
// Transparent ('.') nur, wenn mehr als `empty` des Blocks leer ist – sonst verschwinden dünne Linien.
// Schwarze Umrisse der Vorlage ('k') zählen nur mit Gewicht `kw`: das Spiel zeichnet Umrisse selbst.
function downscale(img: Img, box: { x0: number; y0: number; side: number }, size: number, empty: number, kw: number): string[] {
  const rows: string[] = [];
  for (let ty = 0; ty < size; ty++) {
    let row = '';
    for (let tx = 0; tx < size; tx++) {
      const sx0 = box.x0 + Math.floor(tx * box.side / size), sx1 = box.x0 + Math.floor((tx + 1) * box.side / size);
      const sy0 = box.y0 + Math.floor(ty * box.side / size), sy1 = box.y0 + Math.floor((ty + 1) * box.side / size);
      const count = new Map<string, number>();
      for (let y = sy0; y < Math.max(sy1, sy0 + 1); y++) for (let x = sx0; x < Math.max(sx1, sx0 + 1); x++) {
        const inside = x >= 0 && y >= 0 && x < img.w && y < img.h, i = (y * img.w + x) * 4;
        const ch = !inside || img.px[i + 3] < 128 ? '.' : nearest(img.px.subarray(i, i + 3));
        count.set(ch, (count.get(ch) ?? 0) + 1);
      }
      let total = 0; for (const n of count.values()) total += n;
      let best = '.', bn = -1;
      if ((count.get('.') ?? 0) <= total * empty) for (const [ch, n] of count) if (ch !== '.' && (ch === 'k' ? n * kw : n) > bn) { bn = ch === 'k' ? n * kw : n; best = ch; }
      row += best;
    }
    rows.push(row);
  }
  return rows;
}

// ---------- --grid: Pixelraster der Vorlage erkennen ----------
// 1) Kantenprofil je Achse (Summe der Farbsprünge zwischen Nachbarspalten bzw. -zeilen), Hochpass gegen Verläufe.
// 2) Autokorrelation: Verschiebung L mit dem stärksten Wert = Zellgröße; ist L/2 oder L/3 fast genauso stark,
//    gilt der Teiler (sonst würde eine doppelte Zelle gewählt).
// 3) Feinabstimmung p ∈ [L−1, L+1] in 0,05-px-Schritten und Phase o: maximale Kantenmasse auf den Linien o + k·p.
// Unsicher (gemittelte Korrelation < 0,15) -> null, der Aufrufer fällt auf den normalen Modus zurück.
function edgeProfile(img: Img, axis: 'x' | 'y'): Float64Array {
  const { w, h, px } = img, n = axis === 'x' ? w : h, m = axis === 'x' ? h : w, e = new Float64Array(n);
  for (let a = 1; a < n; a++) for (let b = 0; b < m; b++) {
    const i = axis === 'x' ? (b * w + a) * 4 : (a * w + b) * 4, j = axis === 'x' ? i - 4 : i - w * 4;
    e[a] += Math.abs(px[i] - px[j]) + Math.abs(px[i + 1] - px[j + 1]) + Math.abs(px[i + 2] - px[j + 2]);
  }
  const hp = new Float64Array(n); // Hochpass: minus gleitender Mittelwert über 9 px
  for (let a = 0; a < n; a++) {
    let s = 0, c = 0; for (let d = -4; d <= 4; d++) if (a + d >= 0 && a + d < n) { s += e[a + d]; c++; }
    hp[a] = Math.max(0, e[a] - s / c);
  }
  return hp;
}
interface Grid { p: number; o: number; corr: number }
// Pixel sind quadratisch: Autokorrelation beider Achsen wird gemittelt -> eine gemeinsame Zellgröße.
function autocorr(e: Float64Array, l: number): number { let s = 0; for (let i = 0; i + l < e.length; i++) s += e[i] * e[i + l]; return s; }
function findGrid(ex: Float64Array, ey: Float64Array, minP = 6): [Grid, Grid] | null {
  const ax = autocorr(ex, 0), ay = autocorr(ey, 0);
  if (!ax || !ay) return null;
  const ac = (l: number) => (autocorr(ex, l) / ax + autocorr(ey, l) / ay) / 2;
  let L = 0, best = 0;
  for (let l = minP; l <= Math.min(ex.length, ey.length) / 6; l++) { const v = ac(l); if (v > best) { best = v; L = l; } }
  if (best < 0.15) return null;
  for (const k of [3, 2]) if (L / k >= minP && ac(Math.round(L / k)) >= 0.8 * best) { L = Math.round(L / k); break; }
  // Feinabstimmung: gemeinsame Periode p, Phase je Achse
  let res: [Grid, Grid] | null = null, bm = -1;
  for (let p = L - 1; p <= L + 1; p += 0.05) {
    const phase = (e: Float64Array) => {
      const bins = Math.ceil(p * 2), hist = new Float64Array(bins);
      for (let x = 0; x < e.length; x++) hist[Math.floor((x % p) * 2) % bins] += e[x];
      let bs = -1, bo = 0;
      for (let b = 0; b < bins; b++) { let s = 0; for (let d = -2; d <= 2; d++) s += hist[(b + d + bins) % bins]; if (s > bs) { bs = s; bo = b / 2; } }
      return [bs, bo];
    };
    const [sx, ox] = phase(ex), [sy, oy] = phase(ey), m = sx / ax ** 0.5 + sy / ay ** 0.5;
    if (m > bm) { bm = m; res = [{ p, o: ox, corr: best }, { p, o: oy, corr: best }]; }
  }
  return res;
}

// Farbe aus der Mitte jeder Rasterzelle, ohne Mittelwert
function sampleGrid(img: Img, gx: Grid, gy: Grid): Img {
  const centers = (g: Grid, n: number) => {
    const c: number[] = []; let v = g.o - g.p / 2; while (v - g.p >= 0) v -= g.p;
    for (; v < n; v += g.p) if (v >= 0) c.push(Math.round(v));
    return c;
  };
  const cx = centers(gx, img.w), cy = centers(gy, img.h), px = new Uint8Array(cx.length * cy.length * 4);
  cy.forEach((y, j) => cx.forEach((x, i) => px.set(img.px.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4), (j * cx.length + i) * 4)));
  return { w: cx.length, h: cy.length, px };
}

function preview(rows: string[], scale: number): Img {
  const h = rows.length * scale, w = rows[0].length * scale, px = new Uint8Array(w * h * 4);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return;
    const [R, G, B] = hex(PAL[ch]);
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) px.set([R, G, B, 255], ((y * scale + dy) * w + x * scale + dx) * 4);
  }));
  return { w, h, px };
}

// ---------- CLI ----------
const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : d; };
const size = Number(opt('size', '16')), tol = Number(opt('tol', '12')), empty = Number(opt('empty', '0.5')), kw = Number(opt('kweight', '0.3'));
const outDir = opt('out', 'assets/_hf_test');
const flag = (k: string) => { const i = args.indexOf(`--${k}`); if (i >= 0) args.splice(i, 1); return i >= 0; };
const global = flag('global'), useGrid = flag('grid');
const file = args[0];
if (!file) { console.error('Aufruf: node scripts/img2sprite.ts <bild.png> [--size 16] [--tol 12] [--empty 0.5] [--kweight 0.3] [--global] [--grid] [--name name] [--out dir]'); process.exit(1); }
const stem = basename(file, extname(file));
const name = opt('name', stem.replace(/[^A-Za-z0-9_]/g, '_'));

let img = readPng(readFileSync(file));
let suffix = '';
if (useGrid) {
  const g = findGrid(edgeProfile(img, 'x'), edgeProfile(img, 'y'));
  if (g) {
    img = sampleGrid(img, g[0], g[1]); suffix = '_grid';
    console.error(`Raster gefunden: Zelle ${g[0].p.toFixed(2)} px (Korr. ${g[0].corr.toFixed(2)}), ${img.w}×${img.h} Zellen`);
  } else console.error('Raster nicht gefunden – normaler Modus');
}
removeBackground(img, tol, global);
const box = cropSquare(img);
// Im Raster ist eine Zelle schon ein Spielpixel: kleinere Figuren nicht hochskalieren, sondern zentrieren
if (suffix && box.side < size) { const d = size - box.side; box.x0 -= Math.floor(d / 2); box.y0 -= Math.floor(d / 2); box.side = size; }
if (suffix) console.error(`Inhalt: ${box.side} Zellen${box.side > size ? ` → auf ${size} verkleinert (häufigste Farbe)` : ''}`);
const rows = downscale(img, box, size, empty, kw);

console.log(`  ${name}: [\n${rows.map(r => `    '${r}',`).join('\n')}\n  ],`);
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${stem}${suffix}_preview.png`);
writeFileSync(out, writePng(preview(rows, 8)));
console.error(`Vorschau: ${out}`);
