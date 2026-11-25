// Titelbild: ein ruhendes, ausführlich gemaltes Bild über den ganzen Schirm.
// Der Hintergrund wird einmal gemalt und zwischengespeichert; Schriftzug und Menü kommen jeden Frame darüber.
import { VW, VH, sprites, text } from './gfx';

let cache: HTMLCanvasElement | null = null;

// fester Zufall: das Bild sieht bei jedem Start gleich aus
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export const LEDGE = 196; // Oberkante des Steinsimses, auf dem die Figuren stehen

export function titleScene(): HTMLCanvasElement {
  if (cache) return cache;
  const cv = document.createElement('canvas'); cv.width = VW; cv.height = VH;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const R = rng(4242);
  const px = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const pick = <T,>(a: T[]) => a[(R() * a.length) | 0];
  const CX = VW / 2;

  // Quader: Fläche, Lichtkante, Schattenkante, Abplatzer
  const block = (x: number, y: number, w: number, h: number, pal: string[]) => {
    px(x, y, w, h, '#14121e');
    px(x + 1, y + 1, w - 2, h - 2, pick(pal));
    px(x + 1, y + 1, w - 2, 1, pal[pal.length - 1]);
    px(x + 1, y + h - 2, w - 2, 1, '#1a1726');
    if (R() < 0.2) px(x + 2 + R() * (w - 6), y + 2 + R() * (h - 5), 2, 1, '#1a1726');
  };
  const WALL = ['#2b2440', '#2f2846', '#29233c', '#332b4b', '#3b3256'];
  const STONE = ['#3a3352', '#40385a', '#463d63', '#4f4570'];

  // ---------- Rückwand ----------
  px(0, 0, VW, VH, '#100e18');
  for (let y = 0, row = 0; y < LEDGE + 10; y += 10, row++)
    for (let x = -(row % 2) * 11; x < VW; x += 22) block(x, y, 22, 10, WALL);
  // Gewölbebögen oben
  for (const [x0, w] of [[150, 110], [CX - 70, 140], [VW - 260, 110]]) {
    g.fillStyle = '#0c0a12';
    g.beginPath(); g.ellipse(x0 + w / 2, 0, w / 2, 26, 0, 0, Math.PI); g.fill();
    g.strokeStyle = '#463d63'; g.lineWidth = 3; g.beginPath(); g.ellipse(x0 + w / 2, 0, w / 2 + 2, 28, 0, 0, Math.PI); g.stroke();
  }

  // ---------- Pfeiler links und rechts ----------
  const pillar = (x: number, w: number) => {
    for (let y = 0; y < LEDGE + 4; y += 12) block(x, y, w, 12, STONE);
    px(x - 3, LEDGE - 6, w + 6, 6, '#4f4570'); px(x - 3, LEDGE - 6, w + 6, 1, '#6b5f8f');
  };
  pillar(0, 40); pillar(VW - 40, 40);
  pillar(100, 26); pillar(VW - 126, 26);

  // ---------- Fenster rechts: Mond über einer Burg ----------
  {
    const x = VW - 98, y = 26, w = 50, h = 120;
    g.fillStyle = '#4f4570'; g.beginPath(); g.moveTo(x - 6, y + h); g.lineTo(x - 6, y + 25); g.arc(x + w / 2, y + 25, w / 2 + 6, Math.PI, 0); g.lineTo(x + w + 6, y + h); g.fill();
    g.fillStyle = '#14121e'; g.beginPath(); g.moveTo(x - 1, y + h); g.lineTo(x - 1, y + 25); g.arc(x + w / 2, y + 25, w / 2 + 1, Math.PI, 0); g.lineTo(x + w + 1, y + h); g.fill();
    g.save(); g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + 25); g.arc(x + w / 2, y + 25, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.clip();
    const sky = g.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#0e1638'); sky.addColorStop(0.6, '#1d2b63'); sky.addColorStop(1, '#2d3f86');
    g.fillStyle = sky; g.fillRect(x, y, w, h);
    for (let k = 0; k < 22; k++) px(x + R() * w, y + R() * h * 0.7, 1, 1, R() < 0.3 ? '#f4f4f4' : '#94b0c2');
    const mx = x + 30, my = y + 32;
    g.fillStyle = 'rgba(201,212,220,0.25)'; g.beginPath(); g.arc(mx, my, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8ecf0'; g.beginPath(); g.arc(mx, my, 10, 0, Math.PI * 2); g.fill();
    px(mx - 5, my - 3, 3, 3, '#c9d4dc'); px(mx + 2, my + 2, 4, 3, '#c9d4dc'); px(mx - 1, my - 7, 2, 2, '#c9d4dc');
    g.fillStyle = '#0b1028';
    px(x, y + h - 28, w, 28, '#0b1028');
    for (const [tx, tw, th] of [[x + 4, 8, 46], [x + 18, 10, 60], [x + 34, 7, 40], [x + 44, 6, 34]]) {
      px(tx, y + h - th, tw, th, '#0b1028');
      g.fillStyle = '#0b1028'; g.beginPath(); g.moveTo(tx - 2, y + h - th); g.lineTo(tx + tw / 2, y + h - th - 12); g.lineTo(tx + tw + 2, y + h - th); g.fill();
      px(tx + tw / 2 - 1, y + h - th + 8, 2, 3, '#ffcd75');
    }
    g.restore();
    px(x + w / 2 - 1, y, 2, h, '#2b2440'); px(x, y + 64, w, 2, '#2b2440');
    px(x - 8, y + h, w + 16, 5, '#4f4570'); px(x - 8, y + h, w + 16, 1, '#6b5f8f');
  }

  // ---------- Käfig an einer Kette links ----------
  {
    const x = 52, y = 52;
    for (let k = 0; k < y; k += 4) { px(x + 10, k, 3, 3, k % 8 ? '#4a4d58' : '#8b8f9c'); px(x + 11, k + 1, 1, 1, '#1a1c2c'); }
    g.fillStyle = '#5a3a28'; g.beginPath(); g.ellipse(x + 11, y + 4, 12, 4, 0, Math.PI, 0); g.fill();
    for (let k = 0; k <= 22; k += 4) px(x + k, y + 4, 1, 34, '#8a5a3a');
    px(x - 1, y + 4, 24, 2, '#c98a3a'); px(x - 1, y + 20, 24, 1, '#8a5a3a'); px(x - 2, y + 37, 26, 3, '#c98a3a');
    px(x + 6, y + 31, 9, 3, '#d9cfb4'); px(x + 5, y + 30, 2, 5, '#d9cfb4'); px(x + 14, y + 30, 2, 5, '#d9cfb4');
    px(x + 9, y + 25, 5, 5, '#d9cfb4'); px(x + 10, y + 27, 1, 1, '#1a1c2c'); px(x + 12, y + 27, 1, 1, '#1a1c2c');
  }
  for (let k = 0; k < 60; k += 4) px(4 + k * 0.7, 8 + Math.sin(k / 12) * 6 + k * 0.35, 3, 3, k % 8 ? '#4a4d58' : '#8b8f9c');

  // ---------- Banner mit Totenkopf ----------
  const banner = (x: number) => {
    const w = 30, h = 76, y = 18;
    px(x - 5, y - 3, w + 10, 3, '#8a5a3a'); px(x - 7, y - 4, 3, 5, '#c98a3a'); px(x + w + 4, y - 4, 3, 5, '#c98a3a');
    for (let yy = 0; yy < h; yy++) {
      const tip = yy > h - 16 ? (yy - (h - 16)) : 0;
      for (let k = tip; k < w - tip; k++) {
        const c = k - tip < 2 || w - tip - k < 3 ? '#c98a3a' : k < 6 ? '#5d1f3d' : k > w - 8 ? '#4a1830' : '#7a2a4f';
        px(x + k, y + yy, 1, 1, c);
      }
    }
    const ex = x + w / 2, ey = y + 30;
    const SK = ['..wwwwwww..', '.wwwwwwwww.', 'wwwwwwwwwww', 'wwkkwwwkkww', 'wwkkwwwkkww', 'wwwwwkwwwww', '.wwwwwwwww.', '..wkwkwkw..', '..wwwwwww..'];
    SK.forEach((r, yy) => [...r].forEach((c, xx) => { if (c !== '.') px(ex - 5 + xx, ey - 4 + yy, 1, 1, c === 'w' ? '#d98aa3' : '#3a1228'); }));
  };
  banner(146); banner(VW - 176);

  // ---------- Fackeln ----------
  const TORCH: number[][] = [[80, 120], [VW - 80, 120]];
  const flame = (x: number, y: number, k: number) => {
    px(x - 4 * k, y + 6 * k, 8 * k, 2 * k, '#8a5a3a'); px(x - 3 * k, y + 8 * k, 6 * k, 2 * k, '#5a3a28'); px(x - k, y + 10 * k, 2 * k, 5 * k, '#4a4d58');
    px(x - 3 * k, y, 6 * k, 6 * k, '#b13e53'); px(x - 2 * k, y - 3 * k, 4 * k, 4 * k, '#ef7d57'); px(x - k, y - 6 * k, 2 * k, 3 * k, '#ef7d57');
    px(x - 2 * k, y + k, 4 * k, 4 * k, '#ef7d57'); px(x - k, y - k, 2 * k, 5 * k, '#ffcd75'); px(x, y - 4 * k, k, 2 * k, '#ffcd75');
    px(x - k, y + 3 * k, 2 * k, k, '#fff3c4');
    px(x + 2 * k, y - 8 * k, k, k, '#ef7d57'); px(x - 3 * k, y - 10 * k, k, k, '#ffcd75');
  };
  for (const [x, y] of TORCH) flame(x, y, 2);

  // ---------- Sims, auf dem die Figuren stehen; darunter große Quader ----------
  for (let y = LEDGE + 9, row = 0; y < VH; y += 13, row++)
    for (let x = -(row % 2) * 15; x < VW; x += 30) block(x, y, 30, 13, row < 2 ? WALL : ['#231e34', '#262038', '#2a2340', '#2f2846']);
  for (let x = 30; x < VW - 30; x += 24) block(x, LEDGE, 24, 9, STONE);
  px(30, LEDGE, VW - 60, 1, '#7a6ca3');
  px(30, LEDGE + 9, VW - 60, 3, 'rgba(8,6,14,0.7)');

  // ---------- Stufen unten links und rechts ----------
  for (let k = 0; k < 3; k++) for (let j = 0; j < 3 - k; j++) {
    block(j * 28, VH - 16 * (k + 1), 28, 16, STONE);
    block(VW - 28 - j * 28, VH - 16 * (k + 1), 28, 16, STONE);
  }
  // Schatztruhe mit Gold
  {
    const x = 8, y = 262, w = 54, h = 34;
    px(x + 2, y - 10, w - 4, 12, '#5a3a28'); px(x + 2, y - 10, w - 4, 2, '#c98a3a'); px(x + 2, y - 10, 3, 12, '#c98a3a'); px(x + w - 5, y - 10, 3, 12, '#c98a3a');
    for (let k = 0; k < 150; k++) {
      const a = R() * Math.PI, r = Math.sqrt(R());
      px(x + w / 2 + Math.cos(a) * r * 26, y + 10 - Math.sin(a) * r * 11, 2, 2, pick(['#ffcd75', '#c98a3a', '#ffcd75', '#fff3c4', '#ef7d57']));
    }
    px(x, y + 10, w, h - 10, '#6b3e24'); px(x, y + 10, w, 2, '#8a5a3a');
    for (const yy of [y + 18, y + 28]) px(x, yy, w, 2, '#c98a3a');
    for (const xx of [x, x + w - 4, x + w / 2 - 2]) px(xx, y + 10, 4, h - 10, '#c98a3a');
    px(x + w / 2 - 4, y + 18, 8, 7, '#ffcd75'); px(x + w / 2 - 1, y + 20, 2, 3, '#3a1c10');
    for (let k = 0; k < 16; k++) px(x + R() * 90, y + h + 1 + R() * 5, 2, 1, pick(['#ffcd75', '#c98a3a']));
    const jx = x + 72, jy = y + 14;
    g.fillStyle = '#8a4a2a'; g.beginPath(); g.ellipse(jx, jy + 9, 10, 11, 0, 0, Math.PI * 2); g.fill();
    px(jx - 5, jy - 4, 10, 4, '#8a4a2a'); px(jx - 6, jy - 5, 12, 2, '#b05a32'); px(jx - 6, jy + 4, 3, 8, '#b05a32'); px(jx + 4, jy + 6, 2, 6, '#5a3a28');
  }
  // Kerze und Schädel rechts
  {
    const x = VW - 52, y = 270;
    px(x - 8, y + 18, 22, 4, '#8a5a3a'); px(x - 6, y + 14, 18, 4, '#c98a3a');
    px(x - 2, y - 6, 8, 20, '#d9cfb4'); px(x - 2, y - 6, 8, 2, '#f4f4f4'); px(x + 4, y - 4, 2, 6, '#f4f4f4');
    px(x + 1, y - 14, 2, 8, '#ffcd75'); px(x, y - 11, 4, 4, '#ef7d57'); px(x + 1, y - 16, 1, 2, '#fff3c4');
    TORCH.push([x + 2, y - 10]);
    const SK = ['...wwwwww...', '..wwwwwwww..', '.wwwwwwwwww.', 'wwkkkwwkkkww', 'wwkkkwwkkkww', 'wwwwwkkwwwww', '.wwwwwwwwww.', '..wkwkwkwk..', '..wwwwwwww..'];
    SK.forEach((r, yy) => [...r].forEach((c, xx) => { if (c !== '.') px(VW - 112 + xx * 2, 310 + yy * 2, 2, 2, c === 'w' ? (xx > 7 ? '#b8ae94' : '#d9cfb4') : '#1a1c2c'); }));
  }

  // ---------- Efeu und Moos ----------
  const ivy = (x: number, y: number, len: number, dir: number) => {
    for (let k = 0; k < len; k += 2) {
      const vx = x + Math.round(Math.sin(k * 0.18) * 4) * dir, vy = y + k;
      px(vx, vy, 2, 2, '#1e6b3a');
      if (k % 6 === 0) { px(vx + 2 * dir, vy - 1, 3, 2, '#38b764'); px(vx + 3 * dir, vy - 2, 2, 1, '#a7f070'); }
      if (k % 6 === 3) px(vx - 2 * dir, vy, 3, 2, '#257179');
    }
  };
  ivy(42, 0, 70, 1); ivy(126, 0, 40, -1); ivy(VW - 44, 0, 50, -1); ivy(VW - 130, 150, 44, 1);
  for (const [x, y] of [[40, LEDGE + 8], [210, LEDGE + 24], [420, LEDGE + 10], [VW - 40, LEDGE + 30], [130, VH - 26], [VW - 160, VH - 20]]) {
    for (let k = 0; k < 9; k++) px(x + R() * 18, y + R() * 6, 3, 2, pick(['#1e6b3a', '#257179', '#38b764']));
    for (let k = 0; k < 3; k++) px(x + R() * 18, y - 3 - R() * 4, 1, 4, '#38b764');
  }

  // ---------- Figuren auf dem Sims ----------
  const fig = (key: string, x: number, k: number) => {
    const im = sprites[key]; if (!im) return;
    const w = im.width * k, h = im.height * k;
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(x, LEDGE + 1, w * 0.4, 3, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(im, Math.round(x - w / 2), LEDGE + 2 - h, w, h);
  };
  fig('skelett:f0', 140, 3); fig('golem:f0', 190, 3); fig('fledermaus:f0', 236, 2);
  fig('krieger:f0', CX - 46, 3); fig('magier:f0', CX, 3); fig('waldlaeufer:f0', CX + 46, 3);
  fig('sporling:f0', VW - 236, 3); fig('glutgeist:f0', VW - 188, 3); fig('koenig:f0', VW - 138, 2);

  // ---------- Licht ----------
  const dark = document.createElement('canvas'); dark.width = VW; dark.height = VH;
  const d = dark.getContext('2d')!;
  d.fillStyle = 'rgba(6,4,12,0.6)'; d.fillRect(0, 0, VW, VH);
  d.globalCompositeOperation = 'destination-out';
  const hole = (x: number, y: number, r: number, a = 1) => {
    const gr = d.createRadialGradient(x, y, r * 0.05, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = gr; d.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const [x, y] of TORCH) hole(x, y, 140);
  hole(CX, 150, 190, 0.9); hole(CX, 60, 160, 0.7); hole(37, 280, 70, 0.8); hole(VW - 73, 80, 70, 0.7);
  g.drawImage(dark, 0, 0);
  g.globalCompositeOperation = 'lighter';
  const warm = (x: number, y: number, r: number, a: number, col = '239,125,87') => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const [x, y] of TORCH) { warm(x, y, 120, 0.2); warm(x, y - 2, 20, 0.45, '255,205,117'); }
  warm(37, 270, 60, 0.25, '255,205,117');
  warm(VW - 73, 60, 50, 0.12, '115,150,255');
  warm(CX, 160, 160, 0.06);
  g.globalCompositeOperation = 'source-over';
  const vig = g.createRadialGradient(CX, VH * 0.45, VH * 0.4, CX, VH * 0.45, VW * 0.65);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vig; g.fillRect(0, 0, VW, VH);
  for (let k = 0; k < 40; k++) px(R() * VW, 90 + R() * 200, 1, 1, R() < 0.5 ? 'rgba(255,205,117,0.6)' : 'rgba(239,125,87,0.5)'); // Funken
  cache = cv;
  return cv;
}

// ---------- Menüsymbole 9x9 ----------
const ICON: Record<string, string[]> = {
  play: ['..x......', '..xx.....', '..xxx....', '..xxxx...', '..xxxxx..', '..xxxx...', '..xxx....', '..xx.....', '..x......'],
  globe: ['...xxx...', '.xx.x.xx.', '.x..x..x.', 'xxxxxxxxx', 'x...x...x', 'xxxxxxxxx', '.x..x..x.', '.xx.x.xx.', '...xxx...'],
  sound: ['....x....', '...xx..x.', 'xxxxx...x', 'xxxxx.x.x', 'xxxxx.x.x', 'xxxxx.x.x', 'xxxxx...x', '...xx..x.', '....x....'],
  mute: ['....x....', '...xx....', 'xxxxx....', 'xxxxx.x.x', 'xxxxx..x.', 'xxxxx.x.x', 'xxxxx....', '...xx....', '....x....'],
  book: ['.........', 'xxxx.xxxx', 'x..x.x..x', 'x.xx.xx.x', 'x..x.x..x', 'x.xx.xx.x', 'x..x.x..x', 'xxxxxxxxx', '....x....'],
  restart: ['...xxx...', '.xx...xx.', 'x......x.', 'x.....xxx', 'x......x.', 'x........', '.xx...xx.', '...xxx...', '.........'],
  screen: ['xxxxxxxxx', 'x.......x', 'x.......x', 'x.......x', 'x.......x', 'xxxxxxxxx', '....x....', '..xxxxx..', '.........'],
  full: ['xxx...xxx', 'xx.....xx', 'x.x...x.x', '.........', '.........', '.........', 'x.x...x.x', 'xx.....xx', 'xxx...xxx'],
};
function icon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, col: string) {
  const rows = ICON[name]; if (!rows) return;
  for (const [c, o] of [['#0d0e17', 1], [col, 0]] as [string, number][]) {
    ctx.fillStyle = c;
    rows.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch === 'x') ctx.fillRect(x + xx + o, y + yy + o, 1, 1); }));
  }
}

// Schriftzug mit Krone, Zierlinien und Untertitel
export function drawLogo(ctx: CanvasRenderingContext2D, sub: string) {
  const tx = VW / 2, ty = 26;
  const glow = ctx.createRadialGradient(tx, 44, 10, tx, 44, 190);
  glow.addColorStop(0, 'rgba(239,125,87,0.22)'); glow.addColorStop(1, 'rgba(239,125,87,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, VW, 110);
  const C = ['x...x...x', 'xx.xxx.xx', 'xxxxxxxxx', 'xxxxxxxxx', 'yyyyyyyyy'];
  C.forEach((r, yy) => [...r].forEach((c, xx) => { if (c !== '.') { ctx.fillStyle = c === 'y' ? '#c98a3a' : '#ffcd75'; ctx.fillRect(tx - 9 + xx * 2, 6 + yy * 2, 2, 2); } }));
  ctx.fillStyle = '#c98a3a'; ctx.fillRect(tx - 110, 12, 92, 1); ctx.fillRect(tx + 18, 12, 92, 1);
  ctx.fillStyle = '#ffcd75'; for (const x of [tx - 112, tx - 18, tx + 16, tx + 110]) ctx.fillRect(x - 1, 11, 3, 3);
  text(ctx, 'GLUTGRUFT', tx + 3, ty + 4, '#1a1c2c', 44, 'center', false);
  text(ctx, 'GLUTGRUFT', tx + 2, ty + 2, '#5d275d', 44, 'center', false);
  text(ctx, 'GLUTGRUFT', tx + 1, ty + 1, '#b13e53', 44, 'center', false);
  text(ctx, 'GLUTGRUFT', tx, ty, '#ef7d57', 44, 'center', false);
  ctx.save(); ctx.beginPath(); ctx.rect(0, ty, VW, 20); ctx.clip(); text(ctx, 'GLUTGRUFT', tx, ty, '#ffcd75', 44, 'center', false); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(0, ty, VW, 6); ctx.clip(); text(ctx, 'GLUTGRUFT', tx, ty, '#fff3c4', 44, 'center', false); ctx.restore();
  const sw = text(ctx, sub, tx, 80, '#e8e4d8', 10, 'center') / 2 + 8;
  ctx.fillStyle = '#c98a3a'; ctx.fillRect(tx - sw - 26, 85, 20, 1); ctx.fillRect(tx + sw + 6, 85, 20, 1);
}

// Menü als Steinplatten mit Symbolen; die gewählte glüht
export function drawTitleMenu(ctx: CanvasRenderingContext2D, items: { label: string; icon: string }[], sel: number, hint: string) {
  const cx = VW / 2, w = 150, h = 15, gap = 2;
  let y = 207;
  items.forEach((it, i) => {
    const on = i === sel, bw = on ? w + 14 : w, x = Math.round(cx - bw / 2), bh = on ? h + 2 : h;
    ctx.fillStyle = '#0d0e17'; ctx.fillRect(x + 1, y, bw - 2, bh); ctx.fillRect(x, y + 1, bw, bh - 2);
    ctx.fillStyle = on ? '#ef7d57' : '#5a4f78'; ctx.fillRect(x + 2, y + 1, bw - 4, bh - 2); ctx.fillRect(x + 1, y + 2, bw - 2, bh - 4);
    ctx.fillStyle = on ? '#7d2b45' : '#2b2440'; ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    ctx.fillStyle = on ? '#b13e53' : '#3b3256'; ctx.fillRect(x + 2, y + 2, bw - 4, 1);
    if (on) {
      ctx.fillStyle = '#ffcd75'; ctx.fillRect(x + 2, y + 1, bw - 4, 1);
      for (const dx of [x - 9, x + bw + 4]) { ctx.fillRect(dx + 2, y + bh / 2 - 3, 1, 7); ctx.fillRect(dx + 1, y + bh / 2 - 2, 3, 5); ctx.fillRect(dx, y + bh / 2 - 1, 5, 3); }
      text(ctx, '>', x + 6, y + 5, '#ffcd75', 8); text(ctx, '<', x + bw - 11, y + 5, '#ffcd75', 8);
      const gl = ctx.createRadialGradient(cx, y + bh / 2, 4, cx, y + bh / 2, 110);
      gl.addColorStop(0, 'rgba(239,125,87,0.2)'); gl.addColorStop(1, 'rgba(239,125,87,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gl; ctx.fillRect(cx - 110, y - 20, 220, 60); ctx.globalCompositeOperation = 'source-over';
    } else icon(ctx, it.icon, x + 8, y + 3, '#94b0c2');
    text(ctx, it.label, cx + (on ? 0 : 6), y + (on ? 5 : 4), on ? '#fff3c4' : '#c9d4dc', 8, 'center');
    y += bh + gap;
  });
  // Fußzeile
  const fy = y + 5;
  ctx.fillStyle = '#566c86'; ctx.fillRect(cx - 200, fy + 4, 400, 1);
  ctx.fillStyle = '#ffcd75'; for (const x of [cx - 202, cx + 199]) ctx.fillRect(x, fy + 3, 3, 3);
  const tw = text(ctx, hint, -999, fy, '#94b0c2', 8, 'left');
  ctx.fillStyle = 'rgba(8,9,15,0.9)'; ctx.fillRect(cx - tw / 2 - 6, fy - 1, tw + 12, 11);
  text(ctx, hint, cx, fy, '#94b0c2', 8, 'center');
}
