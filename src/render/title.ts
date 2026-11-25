// Titelbild: ein ruhendes, ausführlich gemaltes Bild über den ganzen Schirm (Hintergrund einmal gemalt
// und zwischengespeichert) und das Hauptmenü darüber. Alle Maße hängen an VW/VH und an wenigen Ankern.
import { VW, VH, sprites, text } from './gfx';

let cache: HTMLCanvasElement | null = null;
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// Anker der Komposition
const CX = VW >> 1;
const HORIZON = Math.round(VH * 0.575);  // Fuß der Rückwand / hinterer Bodenrand (207)
const DAIS = HORIZON + 15;               // Oberkante des Podests, auf dem die Helden stehen
const MENU_Y = DAIS + 22;                // erste Zeile des Menüs

const P = {
  void: '#0b0a12', deep: '#14111f',
  w0: '#1d1930', w1: '#221d33', w2: '#2a2340', w3: '#2f2846', wHi: '#3b3256',
  s0: '#3a3352', s1: '#463d63', s2: '#5a4f78', s3: '#7a6ca3',
  b0: '#4a1830', b1: '#6b1d2a', b2: '#7d2b45', b3: '#b13e53',
  g0: '#8a5a3a', g1: '#c98a3a', g2: '#ffcd75', g3: '#fff3c4', fire: '#ef7d57',
  bone: '#d9cfb4', bone2: '#b8ae94', ink: '#0d0e17', v0: '#5d275d', v1: '#9a4fc0',
};

export function titleScene(): HTMLCanvasElement {
  if (cache) return cache;
  const cv = document.createElement('canvas'); cv.width = VW; cv.height = VH;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const R = rng(9137);
  const px = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const pick = <T,>(a: T[]) => a[(R() * a.length) | 0];
  const block = (x: number, y: number, w: number, h: number, pal: string[], hi: string) => {
    px(x, y, w, h, P.deep);
    px(x + 1, y + 1, w - 2, h - 2, pick(pal));
    px(x + 1, y + 1, w - 2, 1, hi);
    if (R() < 0.18) px(x + 2 + R() * (w - 6), y + 2 + R() * Math.max(1, h - 5), 2, 1, P.deep);
  };
  const LIGHTS: [number, number, number][] = []; // Fackeln: x, y, Reichweite

  // ================= Hintergrund: Rückwand =================
  px(0, 0, VW, VH, P.void);
  for (let y = 0, row = 0; y < HORIZON; y += 9, row++) {
    const pal = y < 60 ? [P.w0, P.w1, P.w0] : [P.w1, P.w2, P.w2, P.w3];
    for (let x = -(row % 2) * 10; x < VW; x += 20) block(x, y, 20, 9, pal, y < 60 ? P.w1 : P.wHi);
  }

  // Seitenbögen: Gänge, die ins Dunkel führen (je zwei links und rechts)
  const sideArch = (x0: number, w: number) => {
    const top = 62, spring = top + w / 2;
    const shape = () => { g.beginPath(); g.moveTo(x0, HORIZON); g.lineTo(x0, spring); g.arc(x0 + w / 2, spring, w / 2, Math.PI, 0); g.lineTo(x0 + w, HORIZON); g.closePath(); };
    // Laibung
    g.save(); g.translate(0, 0); g.lineWidth = 8; g.strokeStyle = P.s0; shape(); g.stroke(); g.lineWidth = 2; g.strokeStyle = P.s2; shape(); g.stroke(); g.restore();
    // Tiefe: Ringe nach innen dunkler, hinten ein schwacher Lichtpunkt
    g.save(); shape(); g.clip();
    for (let k = 0; k < 6; k++) {
      const ins = k * 5, c = ['#1a1629', '#161325', '#121020', '#0f0d1a', '#0c0a15', '#0a0912'][k];
      g.fillStyle = c; g.beginPath(); g.moveTo(x0 + ins, HORIZON); g.lineTo(x0 + ins, spring + ins * 0.6); g.arc(x0 + w / 2, spring + ins * 0.6, w / 2 - ins, Math.PI, 0); g.lineTo(x0 + w - ins, HORIZON); g.fill();
    }
    // ferne Stufen
    for (let k = 0; k < 4; k++) px(x0 + 6 + k * 3, HORIZON - 4 - k * 3, w - 12 - k * 6, 1, '#221d33');
    const fx = x0 + w / 2, fy = spring + 22;
    px(fx - 1, fy, 2, 3, P.fire); px(fx, fy - 1, 1, 1, P.g2);
    g.restore();
  };
  sideArch(34, 58); sideArch(124, 58); sideArch(VW - 92, 58); sideArch(VW - 182, 58);

  // Apsis mit Rosenfenster hinter dem Podest
  const AW = 66, ATOP = 64, ASPR = ATOP + AW;
  {
    const shape = (o: number) => { g.beginPath(); g.moveTo(CX - AW - o, HORIZON); g.lineTo(CX - AW - o, ASPR); g.arc(CX, ASPR, AW + o, Math.PI, 0); g.lineTo(CX + AW + o, HORIZON); g.closePath(); };
    g.fillStyle = P.s0; shape(10); g.fill();
    // Bogensteine
    for (let i = 0; i < 17; i++) {
      const a0 = Math.PI + (i / 17) * Math.PI, a1 = Math.PI + ((i + 1) / 17) * Math.PI, r0 = AW, r1 = AW + 10;
      g.beginPath(); g.moveTo(CX + Math.cos(a0) * r0, ASPR + Math.sin(a0) * r0); g.lineTo(CX + Math.cos(a0) * r1, ASPR + Math.sin(a0) * r1);
      g.lineTo(CX + Math.cos(a1) * r1, ASPR + Math.sin(a1) * r1); g.lineTo(CX + Math.cos(a1) * r0, ASPR + Math.sin(a1) * r0); g.closePath();
      g.fillStyle = i === 8 ? P.s3 : i % 2 ? P.s2 : P.s1; g.fill(); g.strokeStyle = P.deep; g.lineWidth = 1; g.stroke();
    }
    for (const s of [-1, 1]) for (let y = ASPR; y < HORIZON; y += 11) {
      const x = s < 0 ? CX - AW - 10 : CX + AW;
      px(x, y, 10, 10, (y / 11) % 2 ? P.s1 : P.s2); px(x, y, 10, 1, P.s3); px(x, y + 10, 10, 1, P.deep);
    }
    g.fillStyle = '#100d1a'; shape(0); g.fill();
    // Rosenfenster: Speichen, Bleiruten, farbiges Glas
    const rx = CX, ry = ASPR - 6, rr = 40;
    g.fillStyle = P.s1; g.beginPath(); g.arc(rx, ry, rr + 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = P.deep; g.beginPath(); g.arc(rx, ry, rr + 1, 0, Math.PI * 2); g.fill();
    // Ringe: Mitte (Gold), Blütenblätter, äußerer Kranz mit kleinen Kreisen; dazwischen Bleiruten
    const SEG = Math.PI / 6;
    for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) {
      const d = Math.hypot(x, y); if (d > rr) continue;
      const a = (Math.atan2(y, x) + Math.PI * 2 + SEG / 2) % (Math.PI * 2), seg = Math.floor(a / SEG), fa = a - seg * SEG - SEG / 2;
      const off = Math.abs(fa) * d;                       // Abstand zur Segmentmitte in Pixeln (quer)
      const edge = Math.abs(Math.abs(fa) - SEG / 2) * d;  // Abstand zur Speiche
      let c: string;
      if (d < 8) c = d < 5 ? P.g2 : P.g1;
      else if (d < 22) { // Blütenblätter: spitz nach außen
        const petal = off < (22 - d) * 0.55 + 1.5;
        c = petal ? (seg % 2 ? '#7d2b45' : '#9a4fc0') : '#3a1d3a';
      } else { // Kranz: je Segment ein Kreis
        const cxr = 31, cd = Math.hypot(d - cxr, off);
        c = cd < 4.5 ? (cd < 2 ? P.g2 : seg % 2 ? '#b13e53' : '#5d275d') : seg % 2 ? '#4a1830' : '#2e1a40';
        if (Math.abs(cd - 5.3) < 0.7) c = '#1a1426';
      }
      const lead = Math.abs(d - 8) < 0.7 || Math.abs(d - 22) < 0.8 || Math.abs(d - rr + 1.5) < 0.8 || (d > 8 && edge < 0.75);
      px(rx + x, ry + y, 1, 1, lead ? '#1a1426' : c);
    }
    // Mitte: Flamme der Glut
    px(rx - 2, ry - 4, 4, 7, P.fire); px(rx - 1, ry - 6, 2, 9, P.g2); px(rx, ry - 2, 1, 3, P.g3);
    // Fenstersims
    px(CX - AW + 8, ry + rr + 6, (AW - 8) * 2, 4, P.s2); px(CX - AW + 8, ry + rr + 6, (AW - 8) * 2, 1, P.s3);
  }

  // Säulen zwischen den Bögen
  const column = (x: number, w: number, torch: boolean) => {
    px(x - 3, 52, w + 6, 8, P.s2); px(x - 3, 52, w + 6, 1, P.s3); px(x - 1, 60, w + 2, 3, P.s1);
    for (let y = 63; y < HORIZON - 8; y++) for (let k = 0; k < w; k++) {
      const f = k / w, c = f < 0.2 ? P.s0 : f < 0.45 ? P.s1 : f < 0.7 ? P.s2 : f < 0.85 ? P.s1 : P.s0;
      px(x + k, y, 1, 1, c);
    }
    for (let k = 4; k < w - 2; k += 6) px(x + k, 63, 1, HORIZON - 71, 'rgba(13,10,20,0.4)');
    px(x - 3, HORIZON - 8, w + 6, 8, P.s1); px(x - 3, HORIZON - 8, w + 6, 1, P.s3);
    if (torch) {
      const tx = x + w / 2, ty = 116;
      px(tx - 6, ty + 10, 12, 3, P.g0); px(tx - 4, ty + 13, 8, 2, '#5a3a28'); px(tx - 1, ty + 15, 2, 6, '#4a4d58'); px(tx - 6, ty + 10, 12, 1, P.g1);
      px(tx - 5, ty, 10, 10, P.b3); px(tx - 4, ty - 5, 8, 7, P.fire); px(tx - 2, ty - 10, 4, 6, P.fire);
      px(tx - 3, ty + 1, 6, 7, P.fire); px(tx - 2, ty - 2, 4, 9, P.g2); px(tx - 1, ty - 7, 2, 4, P.g2); px(tx - 1, ty + 4, 2, 3, P.g3);
      px(tx + 4, ty - 14, 1, 1, P.fire); px(tx - 5, ty - 17, 1, 1, P.g2);
      LIGHTS.push([tx, ty, 120]);
    }
  };
  column(100, 20, false); column(190, 20, true); column(VW - 210, 20, true); column(VW - 120, 20, false);
  column(10, 20, false); column(VW - 30, 20, false);

  // Banner in den äußeren Bögen
  const banner = (x: number) => {
    const w = 26, h = 70, y = 70;
    px(x - 4, y - 3, w + 8, 3, P.g0); px(x - 6, y - 4, 3, 5, P.g1); px(x + w + 3, y - 4, 3, 5, P.g1);
    for (let yy = 0; yy < h; yy++) {
      const tip = yy > h - 13 ? yy - (h - 13) : 0;
      for (let k = tip; k < w - tip; k++) px(x + k, y + yy, 1, 1, k - tip < 2 || w - tip - k < 3 ? P.g1 : k < 5 ? P.b0 : k > w - 7 ? '#3d1428' : '#7a2a4f');
    }
    // Wappen: Flamme
    const ex = x + w / 2, ey = y + 28;
    px(ex - 4, ey, 8, 8, P.fire); px(ex - 3, ey - 4, 6, 5, P.g2); px(ex - 1, ey - 8, 2, 4, P.g2); px(ex - 2, ey + 3, 4, 4, P.g3);
    px(ex - 7, ey + 12, 14, 1, P.g1); px(ex - 5, ey + 15, 10, 1, P.g1);
  };
  banner(50); banner(VW - 76);

  // ================= Boden in Fluchtperspektive =================
  const VPX = CX, VPY = HORIZON - 70;
  px(0, HORIZON, VW, VH - HORIZON, '#1a1628');
  const rows: number[] = []; for (let y = HORIZON, h = 5; y < VH; y += h, h = Math.round(h * 1.3 + 1)) rows.push(y);
  rows.push(VH);
  for (let r = 0; r < rows.length - 1; r++) {
    const y0 = rows[r], y1 = rows[r + 1];
    for (let c = -14; c <= 14; c++) {
      // Fugenlinien laufen zum Fluchtpunkt
      const xa = (yy: number) => VPX + (c * 30) * (yy - VPY) / (HORIZON - VPY);
      const xb = (yy: number) => VPX + ((c + 1) * 30) * (yy - VPY) / (HORIZON - VPY);
      const col = (r + c) % 2 ? '#2a2340' : '#332b4b';
      for (let yy = y0 + 1; yy < y1; yy++) { const a = xa(yy) + 1, b = xb(yy); if (b > 0 && a < VW) px(a, yy, b - a, 1, col); }
      px(xa(y0 + 1) + 1, y0 + 1, xb(y0 + 1) - xa(y0 + 1) - 1, 1, '#41385d');
    }
  }
  // Risse und Moos auf dem Boden
  for (let k = 0; k < 18; k++) { const x = R() * VW, y = HORIZON + 30 + R() * 110; for (let j = 0; j < 6; j++) px(x + j * (R() < 0.5 ? 1 : -1), y + j * 0.6, 1, 1, P.deep); }
  for (let k = 0; k < 10; k++) { const x = R() * VW, y = HORIZON + 40 + R() * 100; for (let j = 0; j < 7; j++) px(x + R() * 12, y + R() * 3, 2, 1, pick(['#1e6b3a', '#257179'])); }

  // ================= Podest mit Runenkreis =================
  {
    const top = DAIS, hw = 104;
    // zwei Stufen
    for (const [y, w, c] of [[top + 12, hw + 14, P.s0], [top + 6, hw + 7, P.s1]] as [number, number, string][]) {
      px(CX - w, y, w * 2, 7, c); px(CX - w, y, w * 2, 1, P.s2);
      for (let x = CX - w + 14; x < CX + w; x += 22) px(x, y + 1, 1, 6, P.deep);
    }
    g.fillStyle = P.s2; g.beginPath(); g.ellipse(CX, top + 1, hw, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = P.s1; g.beginPath(); g.ellipse(CX, top + 2, hw - 3, 7.5, 0, 0, Math.PI * 2); g.fill();
    px(CX - hw + 2, top + 6, hw * 2 - 4, 1, P.g1);              // Goldkante
    // Runenkreis
    g.strokeStyle = 'rgba(154,79,192,0.75)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(CX, top + 2, 70, 5, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(CX, top + 2, 52, 3.6, 0, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; px(CX + Math.cos(a) * 61, top + 2 + Math.sin(a) * 4.3, 2, 1, k % 2 ? '#d08cff' : P.v1); }
    // Feuerschalen an den Ecken
    for (const s of [-1, 1]) {
      const bx = CX + s * (hw + 4), by = top + 4;
      px(bx - 2, by - 2, 4, 14, '#4a4d58'); px(bx - 6, by - 4, 12, 3, '#8b8f9c'); px(bx - 5, by - 1, 10, 1, '#4a4d58');
      px(bx - 4, by - 10, 8, 6, P.b3); px(bx - 3, by - 13, 6, 6, P.fire); px(bx - 1, by - 16, 2, 7, P.g2); px(bx, by - 9, 1, 3, P.g3);
      LIGHTS.push([bx, by - 9, 70]);
    }
  }

  // ================= Kram an den Seiten (vorn) =================
  // links: Schatztruhe mit Goldhaufen und Schädel
  {
    const x = 56, y = VH - 54, w = 46;
    px(x + 2, y - 9, w - 4, 10, '#5a3a28'); px(x + 2, y - 9, w - 4, 2, P.g1); px(x + 2, y - 9, 3, 10, P.g1); px(x + w - 5, y - 9, 3, 10, P.g1);
    for (let k = 0; k < 120; k++) { const a = R() * Math.PI, r = Math.sqrt(R()); px(x + w / 2 + Math.cos(a) * r * 22, y + 9 - Math.sin(a) * r * 9, 2, 2, pick([P.g2, P.g1, P.g2, P.g3])); }
    px(x, y + 9, w, 22, '#6b3e24'); px(x, y + 9, w, 2, P.g0);
    for (const yy of [y + 16, y + 25]) px(x, yy, w, 2, P.g1);
    for (const xx of [x, x + w - 4, x + w / 2 - 2]) px(xx, y + 9, 4, 22, P.g1);
    px(x + w / 2 - 4, y + 15, 8, 7, P.g2); px(x + w / 2 - 1, y + 17, 2, 3, '#3a1c10');
    for (let k = 0; k < 14; k++) px(x - 10 + R() * 70, y + 32 + R() * 4, 2, 1, pick([P.g2, P.g1]));
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(x + w / 2, y + 32, 30, 3, 0, 0, Math.PI * 2); g.fill();
    LIGHTS.push([x + w / 2, y + 4, 40]);
  }
  // rechts: Kerzenständer, gebrochene Säulentrommel, Knochen
  {
    const x = VW - 58, y = VH - 42;
    px(x - 18, y + 8, 40, 3, 'rgba(0,0,0,0.4)');
    px(x - 1, y - 30, 3, 38, '#4a4d58'); px(x - 12, y - 30, 26, 2, '#8b8f9c'); px(x - 6, y + 6, 14, 3, '#8b8f9c');
    for (const cx of [x - 11, x, x + 11]) {
      const h = cx === x ? 12 : 8;
      px(cx - 1, y - 30 - h, 4, h, P.bone); px(cx - 1, y - 30 - h, 4, 1, '#f4f4f4');
      px(cx, y - 36 - h, 2, 5, P.g2); px(cx, y - 34 - h, 2, 2, P.fire); px(cx, y - 38 - h, 1, 2, P.g3);
      LIGHTS.push([cx + 1, y - 34 - h, 34]);
    }
    // Knochen und Schädel
    const SK = ['..wwwww..', '.wwwwwww.', 'wwkkwkkww', 'wwkkwkkww', 'wwwwkwwww', '.wwwwwww.', '..wkwkw..'];
    SK.forEach((r, yy) => [...r].forEach((c, xx) => { if (c !== '.') px(x - 40 + xx, y + yy, 1, 1, c === 'w' ? (xx > 5 ? P.bone2 : P.bone) : P.ink); }));
    px(x - 28, y + 5, 10, 2, P.bone); px(x - 29, y + 4, 2, 4, P.bone); px(x - 19, y + 4, 2, 4, P.bone);
  }

  // Hohe Feuerschalen neben dem Menü: rahmen es ein und werfen Licht auf den Boden
  for (const bx of [CX - 196, CX + 196]) {
    const by = VH - 24;
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(bx, by + 2, 16, 3, 0, 0, Math.PI * 2); g.fill();
    px(bx - 1, by - 46, 3, 46, '#4a4d58'); px(bx, by - 46, 1, 46, '#8b8f9c');
    px(bx - 10, by - 2, 21, 2, '#4a4d58'); px(bx - 10, by - 4, 2, 4, '#4a4d58'); px(bx + 9, by - 4, 2, 4, '#4a4d58');
    px(bx - 5, by - 24, 11, 2, '#4a4d58');
    // Schale
    px(bx - 13, by - 52, 27, 4, '#8b8f9c'); px(bx - 11, by - 48, 23, 3, '#4a4d58'); px(bx - 8, by - 45, 17, 2, '#2a2c35');
    px(bx - 13, by - 52, 27, 1, '#c9d4dc');
    // Feuer
    px(bx - 11, by - 60, 23, 8, P.b3); px(bx - 9, by - 66, 19, 8, P.fire); px(bx - 6, by - 72, 13, 8, P.fire); px(bx - 3, by - 78, 7, 7, P.fire);
    px(bx - 7, by - 62, 15, 9, P.g2); px(bx - 4, by - 70, 9, 9, P.g2); px(bx - 1, by - 76, 3, 6, P.g2); px(bx - 4, by - 58, 9, 4, P.g3);
    px(bx + 9, by - 82, 1, 1, P.fire); px(bx - 10, by - 86, 1, 1, P.g2); px(bx + 3, by - 90, 1, 1, P.fire);
    LIGHTS.push([bx, by - 62, 110]);
  }

  // ================= Figuren =================
  const fig = (key: string, x: number, foot: number, k: number, fly = 0) => {
    const im = sprites[key]; if (!im) return;
    const w = im.width * k, h = im.height * k;
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(x, foot, Math.max(8, w * 0.36), 3, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(im, Math.round(x - w / 2), foot + 1 - h - fly, w, h);
  };
  // Gegner links und rechts auf dem Boden, gleichmäßig verteilt
  const ef = HORIZON + 14;
  fig('skelett:f0', 66, ef, 3); fig('golem:f0', 124, ef, 3); fig('fledermaus:f0', 180, ef, 3, 26);
  fig('sporling:f0', VW - 180, ef, 3); fig('glutgeist:f0', VW - 124, ef, 3, 6); fig('koenig:f0', VW - 66, ef, 3);
  // Helden auf dem Podest
  fig('krieger:f0', CX - 50, DAIS + 2, 3); fig('magier:f0', CX, DAIS + 2, 3); fig('waldlaeufer:f0', CX + 50, DAIS + 2, 3);

  // ================= Vordergrund: dunkle Rahmensäulen und Kette =================
  for (const [x, w] of [[-6, 22], [VW - 16, 22]] as [number, number][]) {
    px(x, 0, w, VH, '#08070d'); px(x + (x < 0 ? w - 2 : 1), 0, 1, VH, '#1d1930');
  }
  for (let y = 0; y < 44; y += 4) { px(26, y, 3, 3, y % 8 ? '#2a2c35' : '#4a4d58'); }
  // hängende Laterne
  px(22, 44, 11, 2, '#4a4d58'); px(23, 46, 9, 12, '#2a2c35'); px(25, 48, 5, 8, P.g1); px(26, 49, 3, 6, P.g2); px(22, 58, 11, 2, '#4a4d58');
  LIGHTS.push([27, 52, 60]);

  // ================= Licht =================
  const dark = document.createElement('canvas'); dark.width = VW; dark.height = VH;
  const d = dark.getContext('2d')!;
  d.fillStyle = 'rgba(6,4,12,0.6)'; d.fillRect(0, 0, VW, VH);
  d.globalCompositeOperation = 'destination-out';
  const hole = (x: number, y: number, r: number, a = 1) => {
    const gr = d.createRadialGradient(x, y, r * 0.05, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.5, `rgba(0,0,0,${a * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = gr; d.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const [x, y, r] of LIGHTS) hole(x, y, r);
  hole(CX, ASPR - 6, 110, 0.9); hole(CX, DAIS, 130, 0.8); hole(CX, 36, 150, 0.5);
  g.drawImage(dark, 0, 0);
  g.globalCompositeOperation = 'lighter';
  const warm = (x: number, y: number, r: number, a: number, col = '239,125,87') => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const [x, y, r] of LIGHTS) { warm(x, y, r * 0.8, 0.16); warm(x, y, r * 0.15, 0.4, '255,205,117'); }
  // Lichtbahnen aus dem Rosenfenster auf das Podest
  g.save();
  g.beginPath(); g.moveTo(CX - 26, ASPR + 10); g.lineTo(CX + 26, ASPR + 10); g.lineTo(CX + 96, DAIS + 6); g.lineTo(CX - 96, DAIS + 6); g.closePath(); g.clip();
  const beam = g.createLinearGradient(0, ASPR, 0, DAIS);
  beam.addColorStop(0, 'rgba(208,140,255,0.16)'); beam.addColorStop(1, 'rgba(239,125,87,0.04)');
  g.fillStyle = beam; g.fillRect(0, ASPR, VW, DAIS - ASPR + 8);
  g.restore();
  warm(CX, ASPR - 6, 60, 0.18, '208,140,255');
  g.globalCompositeOperation = 'source-over';
  // Bodennebel, Vignette, Staub
  const fog = g.createLinearGradient(0, HORIZON - 6, 0, HORIZON + 40);
  fog.addColorStop(0, 'rgba(148,176,194,0)'); fog.addColorStop(0.5, 'rgba(148,176,194,0.05)'); fog.addColorStop(1, 'rgba(148,176,194,0)');
  g.fillStyle = fog; g.fillRect(0, HORIZON - 6, VW, 46);
  const vig = g.createRadialGradient(CX, VH * 0.48, VH * 0.42, CX, VH * 0.48, VW * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = vig; g.fillRect(0, 0, VW, VH);
  for (let k = 0; k < 50; k++) { const x = CX + (R() - 0.5) * 200, y = ASPR + R() * (DAIS - ASPR); px(x, y, 1, 1, R() < 0.5 ? 'rgba(255,205,117,0.5)' : 'rgba(208,140,255,0.45)'); }
  cache = cv;
  return cv;
}

// ================= Schriftzug =================
export function drawLogo(ctx: CanvasRenderingContext2D, sub: string) {
  const ty = 12;
  const glow = ctx.createRadialGradient(CX, ty + 20, 8, CX, ty + 20, 170);
  glow.addColorStop(0, 'rgba(239,125,87,0.2)'); glow.addColorStop(1, 'rgba(239,125,87,0)');
  ctx.fillStyle = glow; ctx.fillRect(CX - 170, 0, 340, 90);
  for (const [dx, dy, c] of [[3, 4, '#0d0e17'], [2, 2, '#5d275d'], [1, 1, '#b13e53'], [0, 0, '#ef7d57']] as [number, number, string][])
    text(ctx, 'GLUTGRUFT', CX + dx, ty + dy, c, 44, 'center', false);
  ctx.save(); ctx.beginPath(); ctx.rect(0, ty, VW, 20); ctx.clip(); text(ctx, 'GLUTGRUFT', CX, ty, '#ffcd75', 44, 'center', false); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(0, ty, VW, 6); ctx.clip(); text(ctx, 'GLUTGRUFT', CX, ty, '#fff3c4', 44, 'center', false); ctx.restore();
  // Untertitel auf einem schmalen Band mit Zierlinien
  const sy = ty + 52, half = text(ctx, sub, -9999, sy, '#000', 10) / 2;
  ctx.fillStyle = 'rgba(11,10,18,0.75)'; ctx.fillRect(CX - half - 10, sy - 3, half * 2 + 20, 15);
  ctx.fillStyle = '#c98a3a'; ctx.fillRect(CX - half - 10, sy - 3, half * 2 + 20, 1); ctx.fillRect(CX - half - 10, sy + 11, half * 2 + 20, 1);
  ctx.fillStyle = '#8a5a3a'; ctx.fillRect(CX - half - 46, sy + 4, 32, 1); ctx.fillRect(CX + half + 14, sy + 4, 32, 1);
  ctx.fillStyle = '#ffcd75'; ctx.fillRect(CX - half - 14, sy + 3, 3, 3); ctx.fillRect(CX + half + 11, sy + 3, 3, 3);
  text(ctx, sub, CX, sy, '#e8e4d8', 10, 'center');
}

// ================= Menü =================
// Aufbau: oben die große Starttaste, darunter die sechs Einstellungen in zwei Spalten.
export const MENU_COLS = 2;
export type MenuRect = { x: number; y: number; w: number; h: number };
export function menuRects(n: number): MenuRect[] {
  const out: MenuRect[] = [];
  const sw = 186, sh = 19;
  out.push({ x: CX - sw / 2, y: MENU_Y, w: sw, h: sh });
  const cw = 150, ch = 14, gx = 8, gy = 4, y0 = MENU_Y + sh + 7;
  for (let i = 1; i < n; i++) {
    const c = (i - 1) % MENU_COLS, r = ((i - 1) / MENU_COLS) | 0;
    out.push({ x: CX - cw - gx / 2 + c * (cw + gx), y: y0 + r * (ch + gy), w: cw, h: ch });
  }
  return out;
}
// Tastatur: hoch/runter wechseln die Zeile, links/rechts die Spalte
export function menuStep(sel: number, dx: number, dy: number, n: number): number {
  if (sel === 0) return dy > 0 ? 1 : dy < 0 ? n - 2 + ((n - 1) % 2 ? 1 : 0) : 0;
  const c = (sel - 1) % 2, r = ((sel - 1) / 2) | 0, rows = Math.ceil((n - 1) / 2);
  if (dx) return 1 + r * 2 + (1 - c) < n ? 1 + r * 2 + (1 - c) : sel;
  const nr = r + dy;
  if (nr < 0) return 0;
  if (nr >= rows) return 0;
  return Math.min(n - 1, 1 + nr * 2 + c);
}

const ICON: Record<string, string[]> = {
  sound: ['...x...', '..xx.x.', 'xxxx..x', 'xxxx..x', 'xxxx..x', '..xx.x.', '...x...'],
  mute: ['...x...', '..xx...', 'xxxxx.x', 'xxxx.x.', 'xxxxx.x', '..xx...', '...x...'],
  book: ['xxx.xxx', 'x.x.x.x', 'xxx.xxx', 'x.x.x.x', 'xxx.xxx', 'xxxxxxx', '...x...'],
  restart: ['.xxxx..', 'x....x.', 'x...xxx', 'x....x.', 'x......', 'x....x.', '.xxxx..'],
  screen: ['xxxxxxx', 'x.....x', 'x.....x', 'x.....x', 'xxxxxxx', '...x...', '.xxxxx.'],
  full: ['xx...xx', 'x.....x', '.......', '.......', '.......', 'x.....x', 'xx...xx'],
};
function icon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, col: string) {
  const rows = ICON[name]; if (!rows) return;
  ctx.fillStyle = col;
  rows.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch === 'x') ctx.fillRect(x + xx, y + yy, 1, 1); }));
}

export function drawTitleMenu(ctx: CanvasRenderingContext2D, items: { label: string; icon: string }[], sel: number, hint: string, note = '') {
  const rects = menuRects(items.length);
  // Tafel hinter dem Menü: hebt die Tasten von der Szene ab
  const top = rects[0].y - 6, bot = rects[rects.length - 1].y + rects[rects.length - 1].h + 6, pw = 326;
  ctx.fillStyle = 'rgba(11,9,18,0.82)'; ctx.fillRect(CX - pw / 2, top, pw, bot - top);
  ctx.fillStyle = '#3b3256'; ctx.fillRect(CX - pw / 2, top, pw, 1); ctx.fillRect(CX - pw / 2, bot - 1, pw, 1);
  ctx.fillRect(CX - pw / 2, top, 1, bot - top); ctx.fillRect(CX + pw / 2 - 1, top, 1, bot - top);
  ctx.fillStyle = '#c98a3a';
  for (const [x, y] of [[CX - pw / 2, top], [CX + pw / 2 - 3, top], [CX - pw / 2, bot - 3], [CX + pw / 2 - 3, bot - 3]]) ctx.fillRect(x, y, 3, 3);

  items.forEach((it, i) => {
    const r = rects[i], on = i === sel, main = i === 0;
    const x = Math.round(r.x), y = Math.round(r.y), w = r.w, h = r.h;
    // Platte: dunkler Grund, feiner Rand, Lichtkante oben
    ctx.fillStyle = '#0d0e17'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = main ? (on ? '#6b1d2a' : '#4a1830') : (on ? '#3b3256' : '#221d33'); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = main ? (on ? '#b13e53' : '#7d2b45') : (on ? '#5a4f78' : '#2f2846'); ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = on ? '#ffcd75' : main ? '#7d2b45' : '#3b3256';
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    if (on) {
      // kleiner Pixelpfeil links neben der Taste
      ctx.fillStyle = '#ffcd75';
      const ay = y + (h >> 1);
      ctx.fillRect(x - 6, ay - 2, 1, 5); ctx.fillRect(x - 5, ay - 1, 1, 3); ctx.fillRect(x - 4, ay, 1, 1);
      ctx.fillStyle = '#c98a3a'; ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    }
    const col = on ? '#ffcd75' : main ? '#f4e4c8' : '#c9d4dc';
    if (main) text(ctx, it.label, x + w / 2, y + 5, col, 10, 'center');
    else {
      icon(ctx, it.icon, x + 6, y + 4, on ? '#ffcd75' : '#7a8aa3');
      text(ctx, it.label, x + 16 + (w - 20) / 2, y + 4, col, 8, 'center');
    }
  });
  // Rückmeldung (z. B. „Lehrgang beginnt von vorn“) und Hinweise, beide zurückhaltend
  if (note) text(ctx, note, CX, bot + 4, '#ffcd75', 8, 'center');
  text(ctx, hint, CX, VH - 11, '#566c86', 8, 'center');
}

// Welche Taste liegt unter dem Mauszeiger? -1: keine
export function menuHit(mx: number, my: number, n: number): number {
  return menuRects(n).findIndex(r => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h);
}
