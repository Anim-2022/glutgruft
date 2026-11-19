// Phase 3: Bodenmuster über 2×2 Felder, Mauerkronen nach Nachbarmuster, Sockel der Wandfront,
// gerasterte Übergänge (Gras, Brandfläche, Eis). Alles im Code gezeichnet, nur Palettenfarben.
const TS = 16;
const mk = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!];
};
export interface BiomeCols { floor: string; speck: string; brick: string; hi: string; mortar: string; top: string; cap: string; capHi: string; g1: string; g2: string; }

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const px = (g: CanvasRenderingContext2D, col: string, x: number, y: number, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

// ---- Boden: 32×32-Muster, in vier Felder geschnitten ----
// Rückgabe: je Spielart vier Viertel [oben-links, oben-rechts, unten-links, unten-rechts]
export function floorMacro(b: BiomeCols, bi: number, rnd: () => number): HTMLCanvasElement[][] {
  const out: HTMLCanvasElement[][] = [];
  for (let v = 0; v < 3; v++) {
    const [c, g] = mk(32, 32);
    px(g, b.floor, 0, 0, 32, 32);
    if (bi === 0) gruftFloor(g, b, v, rnd);
    else if (bi === 1) caveFloor(g, b, rnd);
    else forgeFloor(g, b, v, rnd);
    const parts: HTMLCanvasElement[] = [];
    for (const [qx, qy] of [[0, 0], [16, 0], [0, 16], [16, 16]]) { const [q, qg] = mk(TS, TS); qg.drawImage(c, -qx, -qy); parts.push(q); }
    out.push(parts);
  }
  return out;
}

// Gruft: Steinplatten unterschiedlicher Größe mit Fugen, leicht verschieden getönt
const SLABS = [
  [[0, 0, 12, 10], [12, 0, 20, 10], [0, 10, 20, 12], [20, 10, 12, 12], [0, 22, 10, 10], [10, 22, 22, 10]],
  [[0, 0, 16, 16], [16, 0, 16, 8], [16, 8, 16, 8], [0, 16, 8, 16], [8, 16, 24, 16]],
  [[0, 0, 10, 14], [10, 0, 22, 6], [10, 6, 12, 8], [22, 6, 10, 8], [0, 14, 16, 18], [16, 14, 16, 18]],
];
function gruftFloor(g: CanvasRenderingContext2D, b: BiomeCols, v: number, rnd: () => number) {
  for (const [x, y, w, h] of SLABS[v]) {
    const t = rnd();
    g.fillStyle = t < 0.33 ? 'rgba(0,0,0,0.10)' : t < 0.66 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
    g.fillRect(x, y, w, h);
    px(g, b.speck, x, y, w - 1, 1); // Glanzkante oben
    for (let k = 0; k < (w * h) / 40; k++) px(g, b.speck, x + 1 + ((rnd() * (w - 3)) | 0), y + 2 + ((rnd() * (h - 4)) | 0));
    px(g, b.mortar, x + w - 1, y, 1, h); px(g, b.mortar, x, y + h - 1, w, 1); // Fugen rechts und unten
    if (rnd() < 0.3) { const cx = x + 2 + ((rnd() * (w - 5)) | 0), cy = y + 2 + ((rnd() * (h - 5)) | 0); px(g, b.mortar, cx, cy, 2, 1); px(g, b.mortar, cx + 1, cy + 1, 1, 2); }
  }
}

// Höhle: unebener Fels – weiche Flecken aus Wertrauschen, Kiesel, feine Risse
function caveFloor(g: CanvasRenderingContext2D, b: BiomeCols, rnd: () => number) {
  const N = 5, grid = Array.from({ length: N * N }, () => rnd());
  const at = (i: number, j: number) => grid[(j % (N - 1)) * N + (i % (N - 1))]; // nahtlos kachelbar
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const fx = (x / 32) * (N - 1), fy = (y / 32) * (N - 1), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, w = fy - j;
    const n = at(i, j) * (1 - u) * (1 - w) + at(i + 1, j) * u * (1 - w) + at(i, j + 1) * (1 - u) * w + at(i + 1, j + 1) * u * w;
    const d = n + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.2;
    if (d < 0.3) px(g, b.mortar, x, y); else if (d > 0.72) px(g, b.speck, x, y);
  }
  for (let k = 0; k < 6; k++) { const x = (rnd() * 30) | 0, y = (rnd() * 30) | 0; px(g, b.brick, x, y, 2, 1); px(g, b.hi, x, y); px(g, b.mortar, x, y + 1, 2, 1); }
  for (let k = 0; k < 1; k++) { let x = (rnd() * 28) | 0, y = (rnd() * 28) | 0; for (let s = 0; s < 5; s++) { px(g, b.top, x, y); x += rnd() < 0.5 ? 1 : 0; y += 1; } }
}

// Schmiede: große Eisen- und Steinplatten (Grundrisse wie in der Gruft), Nieten nur an großen Platten, Ruß und Rost
function forgeFloor(g: CanvasRenderingContext2D, b: BiomeCols, v: number, rnd: () => number) {
  for (const [x, y, w, h] of SLABS[(v + 1) % SLABS.length]) {
    if (rnd() < 0.45) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x, y, w, h); }
    px(g, b.speck, x, y, w - 1, 1);
    px(g, b.mortar, x + w - 1, y, 1, h); px(g, b.mortar, x, y + h - 1, w, 1);
    if (w >= 12 && h >= 10 && rnd() < 0.6) for (const [rx, ry] of [[2, 2], [w - 4, 2], [2, h - 4], [w - 4, h - 4]]) { px(g, b.hi, x + rx, y + ry); px(g, '#1c0f14', x + rx, y + ry + 1); }
    for (let k = 0; k < (w * h) / 60; k++) px(g, '#7d2b45', x + 1 + ((rnd() * (w - 3)) | 0), y + 2 + ((rnd() * (h - 4)) | 0));
  }
  // Rußfleck über die Plattengrenzen hinweg
  const cx = 6 + ((rnd() * 20) | 0), cy = 6 + ((rnd() * 20) | 0);
  for (let y = -5; y <= 5; y++) for (let x = -6; x <= 6; x++) {
    const d = (x * x) / 36 + (y * y) / 25;
    if (d < 1 && BAYER[((cy + y) & 3) * 4 + ((cx + x) & 3)] > d * 0.9) { g.fillStyle = 'rgba(28,15,20,0.5)'; g.fillRect((cx + x + 32) % 32, (cy + y + 32) % 32, 1, 1); }
  }
}

// Großflächige Helligkeitswelle über den Boden: Wert in [-1, 1], weich über 4×4 Felder
const h2 = (x: number, y: number) => (((Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0) % 1000) / 500 - 1;
export function floorTint(x: number, y: number): number {
  const fx = x / 4, fy = y / 4, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const s = (t: number) => t * t * (3 - 2 * t), su = s(u), sv = s(v);
  return (h2(i, j) * (1 - su) + h2(i + 1, j) * su) * (1 - sv) + (h2(i, j + 1) * (1 - su) + h2(i + 1, j + 1) * su) * sv;
}

// ---- Mauerkrone nach offenen Seiten (Bit 1 oben, 2 links, 4 rechts) ----
// Kante mit Glanz nur dort, wo Boden angrenzt; zur Mitte hin dunkler, wie eine gerundete Masse
export function capEdges(b: BiomeCols): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let bits = 0; bits < 8; bits++) {
    const [c, g] = mk(TS, TS);
    if (bits & 1) { px(g, b.capHi, 0, 0, TS, 1); px(g, b.hi, 0, 1, TS, 1); }
    if (bits & 2) { px(g, b.capHi, 0, 0, 1, TS); px(g, b.hi, 1, bits & 1 ? 1 : 0, 1, TS); }
    if (bits & 4) { px(g, b.hi, TS - 1, 0, 1, TS); px(g, 'rgba(0,0,0,0.25)', TS - 2, bits & 1 ? 2 : 0, 1, TS); }
    out.push(c);
  }
  return out;
}
export function capTiles(b: BiomeCols, base: HTMLCanvasElement, edges: HTMLCanvasElement[]): HTMLCanvasElement[] {
  return edges.map((e, bits) => {
    const [c, g] = mk(TS, TS);
    g.drawImage(base, 0, 0);
    // Abstand zur nächsten offenen Kante bestimmt die Abdunklung
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let d = 99;
      if (bits & 1) d = Math.min(d, y);
      if (bits & 2) d = Math.min(d, x);
      if (bits & 4) d = Math.min(d, TS - 1 - x);
      const a = d > 9 ? 0.3 : d > 5 ? 0.18 : d > 3 ? 0.08 : 0;
      if (a && BAYER[(y & 3) * 4 + (x & 3)] < 0.85) { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, y, 1, 1); }
    }
    g.drawImage(e, 0, 0);
    return c;
  });
}
// ruhigere Oberfläche der Mauerkrone (ohne Ziegelgitter, das wie Frontmauerwerk wirkt)
export function capBase(b: BiomeCols, bi: number, rnd: () => number): HTMLCanvasElement {
  const [c, g] = mk(TS, TS);
  px(g, b.cap, 0, 0, TS, TS);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  if (bi === 1) for (let i = 0; i < 7; i++) g.fillRect((rnd() * 13) | 0, (rnd() * 14) | 0, 2 + ((rnd() * 2) | 0), 1 + ((rnd() * 2) | 0));
  else { g.fillRect(3, 8, 9, 1); g.fillRect(9, 2, 1, 6); g.fillRect(5, 9, 1, 5); }
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 5; i++) g.fillRect((rnd() * 15) | 0, (rnd() * 15) | 0, 1 + ((rnd() * 2) | 0), 1);
  if (bi === 2) { px(g, '#7d2b45', 4, 4, 1, 3); px(g, '#ef7d57', 4, 5); px(g, '#7d2b45', 12, 11, 2, 1); }
  return c;
}

// ---- Sockel der Wandfront: Fuge, dunklere Sockelsteine, Übergang zum Boden ----
export function plinth(g: CanvasRenderingContext2D, b: BiomeCols) {
  px(g, b.mortar, 0, 12, TS, 1);
  px(g, b.brick, 0, 13, TS, 3);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 13, TS, 3);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 13, TS, 1);
  px(g, b.mortar, 5, 13, 1, 3); px(g, b.mortar, 12, 13, 1, 3);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 15, TS, 1);
}

// ---- gerasterte Ränder: Maske je offene Seite (1 oben, 2 links, 4 rechts, 8 unten) ----
const masks: HTMLCanvasElement[] = [];
export function edgeMask(bits: number): HTMLCanvasElement {
  if (masks[bits]) return masks[bits];
  const [c, g] = mk(TS, TS);
  g.fillStyle = '#fff';
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let d = 99;
    if (bits & 1) d = Math.min(d, y);
    if (bits & 2) d = Math.min(d, x);
    if (bits & 4) d = Math.min(d, TS - 1 - x);
    if (bits & 8) d = Math.min(d, TS - 1 - y);
    if (d >= 4 || BAYER[(y & 3) * 4 + (x & 3)] < (d + 0.5) / 4.5) g.fillRect(x, y, 1, 1);
  }
  return (masks[bits] = c);
}
// Bild mit gerasterten Rändern (zwischengespeichert je Bild und Muster)
const soft = new WeakMap<HTMLCanvasElement, HTMLCanvasElement[]>();
export function softEdged(src: HTMLCanvasElement, bits: number): HTMLCanvasElement {
  if (!bits) return src;
  let list = soft.get(src);
  if (!list) soft.set(src, (list = []));
  if (list[bits]) return list[bits];
  const [c, g] = mk(TS, TS);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(edgeMask(bits), 0, 0);
  return (list[bits] = c);
}
// Moosgrund unter dem Gras (damit die Fläche als Rasen liest, nicht als einzelne Halme)
export function grassBed(b: BiomeCols): HTMLCanvasElement {
  const [c, g] = mk(TS, TS);
  // unregelmäßige Moosflecken statt Gitterraster
  g.globalAlpha = 0.55;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const h = ((Math.imul(x + 3, 2654435761) ^ Math.imul(y + 7, 40503)) >>> 0) % 100; if (h < 22) px(g, b.g1, x, y); }
  g.globalAlpha = 1;
  return c;
}
