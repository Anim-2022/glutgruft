// Phase 4: Luft im Raum – Schwebeteilchen und Bodennebel je Biom (nur Darstellung).
// Staub und Sporen werden vor dem Licht gezeichnet und sind daher nur im Lichtschein zu sehen;
// Glutfunken leuchten selbst und liegen über der Dunkelheit.
import { W, H, wallLike } from '../game/dungeon';
import { edgeMask } from './tiles';

const TS = 16;
interface Mote { x: number; y: number; vx: number; vy: number; t: number; life: number; col: string; glow: boolean; ph: number; }
const motes: Mote[] = [];
const MAX = 90;

// je Biom: Teilchen pro Sekunde und Erzeuger
const KINDS: { rate: number; make: (x: number, y: number) => Mote }[][] = [
  [{ rate: 7, make: (x, y) => ({ x, y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 3, t: 0, life: 3 + Math.random() * 3, col: Math.random() < 0.7 ? '#94b0c2' : '#c9d4dc', glow: false, ph: Math.random() * 6 }) }],
  [{ rate: 10, make: (x, y) => ({ x, y, vx: 0, vy: -3 - Math.random() * 5, t: 0, life: 3 + Math.random() * 2, col: Math.random() < 0.6 ? '#a7f070' : '#73eff7', glow: false, ph: Math.random() * 6 }) }],
  [
    { rate: 7, make: (x, y) => ({ x, y, vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 14, t: 0, life: 1.2 + Math.random() * 1.4, col: Math.random() < 0.5 ? '#ffcd75' : '#ef7d57', glow: true, ph: Math.random() * 6 }) },
    { rate: 4, make: (x, y) => ({ x, y: y - 20, vx: 2 + Math.random() * 4, vy: 4 + Math.random() * 4, t: 0, life: 3 + Math.random() * 2, col: '#8b8f9c', glow: false, ph: Math.random() * 6 }) },
  ],
];

const acc = [0, 0];
export function resetAmbient() { motes.length = 0; acc.fill(0); }

// Teilchen bewegen und neue auf sichtbarem Boden im Bild erzeugen
export function stepAmbient(bi: number, tiles: Uint8Array, vis: Uint8Array, x0: number, y0: number, x1: number, y1: number, dt: number) {
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.t += dt;
    if (m.t > m.life) { motes.splice(i, 1); continue; }
    m.x += (m.vx + Math.sin(m.t * 1.7 + m.ph) * (m.glow ? 6 : 3)) * dt; m.y += m.vy * dt;
  }
  KINDS[bi].forEach((k, ki) => {
    acc[ki] += k.rate * dt;
    for (; acc[ki] >= 1; acc[ki]--) {
      if (motes.length >= MAX) { acc[ki] = 0; break; }
      for (let tries = 0; tries < 6; tries++) {
        const tx = x0 + ((Math.random() * (x1 - x0 + 1)) | 0), ty = y0 + ((Math.random() * (y1 - y0 + 1)) | 0);
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const i = ty * W + tx;
        if (!vis[i] || wallLike(tiles[i])) continue;
        motes.push(k.make(tx * TS + Math.random() * TS, ty * TS + Math.random() * TS));
        break;
      }
    }
  });
}

// glow = false: Staub, Sporen, Asche (vor dem Licht); glow = true: Funken (danach, additiv)
export function drawAmbient(ctx: CanvasRenderingContext2D, ox: number, oy: number, glow: boolean) {
  if (glow) ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    if (m.glow !== glow) continue;
    const f = m.t / m.life, a = Math.min(1, f * 4, (1 - f) * 3) * (glow ? 0.9 : 0.55 + 0.35 * Math.sin(m.t * 5 + m.ph));
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = m.col; ctx.fillRect(Math.round(m.x + ox), Math.round(m.y + oy), 1, 1);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ---- Bodennebel: gerastertes Rauschen, langsam treibend, an der Welt verankert ----
const FOG: { col: string; a: number; speed: number }[] = [
  { col: '#94b0c2', a: 0.05, speed: 3 },
  { col: '#73eff7', a: 0.08, speed: 5 },
  { col: '#b13e53', a: 0.06, speed: 7 },
];
const fogs: HTMLCanvasElement[] = [];
const N = 128;
function fogTex(bi: number): HTMLCanvasElement {
  if (fogs[bi]) return fogs[bi];
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const g = c.getContext('2d')!;
  // three octaves whose cells are not multiples of the 16 px tile, so the fog has no square grid
  const oct = [4, 7, 13].map(G => ({ G, grid: Array.from({ length: G * G }, () => Math.random()) }));
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const s = (t: number) => t * t * (3 - 2 * t);
  const vn = (o: { G: number; grid: number[] }, x: number, y: number) => {
    const at = (i: number, j: number) => o.grid[(j % o.G) * o.G + (i % o.G)];
    const fx = (x / N) * o.G, fy = (y / N) * o.G, i = Math.floor(fx), j = Math.floor(fy), u = s(fx - i), v = s(fy - j);
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
  g.fillStyle = FOG[bi].col;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = vn(oct[0], x, y) * 0.5 + vn(oct[1], x, y) * 0.32 + vn(oct[2], x, y) * 0.18;
    if ((n - 0.35) * 2.2 * 16 > BAYER[(y & 3) * 4 + (x & 3)]) g.fillRect(x, y, 1, 1);
  }
  return (fogs[bi] = c);
}
// nur über sichtbarem Boden – nicht über Fels und nicht im Dunkel jenseits der Karte
let fogCv: HTMLCanvasElement | null = null, maskCv: HTMLCanvasElement | null = null;
export function drawFog(ctx: CanvasRenderingContext2D, bi: number, tiles: Uint8Array, vis: Uint8Array, x0: number, y0: number, x1: number, y1: number, ox: number, oy: number, time: number, vw: number, vh: number) {
  const tex = fogTex(bi), f = FOG[bi];
  if (!fogCv || fogCv.width !== vw || fogCv.height !== vh) {
    fogCv = document.createElement('canvas'); fogCv.width = vw; fogCv.height = vh;
    maskCv = document.createElement('canvas'); maskCv.width = vw; maskCv.height = vh;
  }
  const g = fogCv.getContext('2d')!;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, vw, vh);
  const sx = (((Math.round(ox + time * f.speed) % N) + N) % N) - N, sy = (((Math.round(oy + time * f.speed * 0.4) % N) + N) % N) - N;
  for (let y = sy; y < vh; y += N) for (let x = sx; x < vw; x += N) g.drawImage(tex, x, y);
  // keep the fog only over visible floor; toward the edge of sight it frays out (dithered mask, no tile steps)
  g.globalCompositeOperation = 'destination-in';
  const mask = maskCv!, mg = mask.getContext('2d')!;
  mg.clearRect(0, 0, vw, vh);
  const fl = (i: number) => vis[i] && !wallLike(tiles[i]);
  for (let y = Math.max(1, y0); y <= Math.min(H - 2, y1); y++) for (let x = Math.max(1, x0); x <= Math.min(W - 2, x1); x++) {
    const i = y * W + x;
    if (!fl(i)) continue;
    let bits = 0;
    if (!fl(i - W) && !wallLike(tiles[i - W])) bits |= 1;
    if (!fl(i - 1) && !wallLike(tiles[i - 1])) bits |= 2;
    if (!fl(i + 1) && !wallLike(tiles[i + 1])) bits |= 4;
    if (!fl(i + W) && !wallLike(tiles[i + W])) bits |= 8;
    if (bits) mg.drawImage(edgeMask(bits), x * TS + ox, y * TS + oy);
    else { mg.fillStyle = '#fff'; mg.fillRect(x * TS + ox, y * TS + oy, TS, TS); }
  }
  g.drawImage(mask, 0, 0);
  ctx.globalAlpha = f.a;
  ctx.drawImage(fogCv, 0, 0);
  ctx.globalAlpha = 1;
}

// ---- Nachbearbeitung: Farbstimmung je Biom und Vignette ----
// helle Tönung, multipliziert: färbt Licht und Mitteltöne, Schwarz bleibt Schwarz
const GRADE = ['#e4ebff', '#e0fff4', '#fff0e2'];
let vig: HTMLCanvasElement | null = null;
function vignette(vw: number, vh: number): HTMLCanvasElement {
  if (vig && vig.width === vw && vig.height === vh) return vig;
  vig = document.createElement('canvas'); vig.width = vw; vig.height = vh;
  const g = vig.getContext('2d')!, gr = g.createRadialGradient(vw / 2, vh / 2, vh * 0.35, vw / 2, vh / 2, vw * 0.62);
  gr.addColorStop(0, 'rgba(5,6,12,0)'); gr.addColorStop(0.7, 'rgba(5,6,12,0.22)'); gr.addColorStop(1, 'rgba(5,6,12,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, vw, vh);
  return vig;
}
// Über der Szene, unter Oberfläche und Schadenszahlen
export function postFx(ctx: CanvasRenderingContext2D, bi: number, vw: number, vh: number) {
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = GRADE[bi]; ctx.fillRect(0, 0, vw, vh);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(vignette(vw, vh), 0, 0);
}
