// Schatten und Umgebungsverdeckung (nur Darstellung).
// - Bodenschatten: Pixel-Ellipsen unter Figuren und Gegenständen
// - AO: Boden an Wänden und in Innenecken abgedunkelt (je Nachbarmuster einmal gebacken)
import { W, H, wallLike } from '../game/dungeon';

const TS = 16;
const mk = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!];
};

// ---- Bodenschatten ----
const ovals = new Map<number, HTMLCanvasElement>();
// Pixel-Ellipse: dunkler Kern, hellerer Saum; Breite w, Höhe ≈ w/3
export function oval(w: number): HTMLCanvasElement {
  let c = ovals.get(w);
  if (c) return c;
  const h = Math.max(3, Math.round(w / 3.2));
  const [cv, g] = mk(w, h);
  const rx = w / 2, ry = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = ((x + 0.5 - rx) / rx) ** 2 + ((y + 0.5 - ry) / ry) ** 2;
    if (d > 1) continue;
    g.fillStyle = d < 0.45 ? 'rgba(0,0,0,0.58)' : 'rgba(0,0,0,0.32)';
    g.fillRect(x, y, 1, 1);
  }
  ovals.set(w, cv);
  return cv;
}
// Ellipse mittig unter dem Punkt (cx, footY) zeichnen
export function dropShadow(ctx: CanvasRenderingContext2D, cx: number, footY: number, w: number, alpha = 1) {
  const o = oval(w);
  ctx.globalAlpha = alpha;
  ctx.drawImage(o, Math.round(cx - w / 2), Math.round(footY - o.height / 2));
  ctx.globalAlpha = 1;
}

// ---- Umgebungsverdeckung am Boden ----
// Bits: 1 Wand oben, 2 links, 4 rechts, 8 oben-links, 16 oben-rechts
const ao = new Map<number, HTMLCanvasElement>();
function aoTile(bits: number): HTMLCanvasElement {
  let c = ao.get(bits);
  if (c) return c;
  const [cv, g] = mk(TS, TS);
  const f = (a: number, x: number, y: number, w: number, h: number) => { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, y, w, h); };
  // Wand oben wirft den längsten Schatten (Licht fällt von oben in den Raum)
  if (bits & 1) { f(0.4, 0, 0, TS, 3); f(0.22, 0, 3, TS, 2); f(0.1, 0, 5, TS, 2); }
  if (bits & 2) { f(0.26, 0, 0, 2, TS); f(0.1, 2, 0, 1, TS); }
  if (bits & 4) { f(0.2, TS - 2, 0, 2, TS); f(0.08, TS - 3, 0, 1, TS); }
  // Innenecke ohne direkte Nachbarwand: kleiner Eckschatten
  if (bits & 8 && !(bits & 3)) { f(0.3, 0, 0, 3, 2); f(0.18, 0, 2, 2, 1); f(0.18, 3, 0, 1, 1); }
  if (bits & 16 && !(bits & 5)) { f(0.26, TS - 3, 0, 3, 2); f(0.15, TS - 2, 2, 2, 1); f(0.15, TS - 4, 0, 1, 1); }
  ao.set(bits, cv);
  return cv;
}
export function aoBits(tiles: Uint8Array, x: number, y: number): number {
  const w = (ox: number, oy: number) => { const nx = x + ox, ny = y + oy; return nx < 0 || ny < 0 || nx >= W || ny >= H || wallLike(tiles[ny * W + nx]); };
  return (w(0, -1) ? 1 : 0) | (w(-1, 0) ? 2 : 0) | (w(1, 0) ? 4 : 0) | (w(-1, -1) ? 8 : 0) | (w(1, -1) ? 16 : 0);
}
export function drawAO(ctx: CanvasRenderingContext2D, tiles: Uint8Array, x: number, y: number, dx: number, dy: number) {
  const b = aoBits(tiles, x, y);
  if (b) ctx.drawImage(aoTile(b), dx, dy);
}
