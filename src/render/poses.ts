// Zusatzbilder der Figuren (Phase 2): Angriff, Zauber, Tod.
// Alle Posen entstehen beim Backen aus den Grundmatrizen; nur Darstellung.
import { WEAPON_ART, ATTACK } from './sprites';

type Grid = string[][];
const toGrid = (rows: string[]): Grid => rows.map(r => r.split(''));
const toRows = (g: Grid): string[] => g.map(r => r.join(''));
const blank = (w: number, h: number): Grid => Array.from({ length: h }, () => Array(w).fill('.'));
export const POSE_PAD = 2; // jede Pose ist links und rechts um 2 Pixel breiter (Platz für ausholende Waffen)

function pad(rows: string[], p = POSE_PAD): Grid {
  return rows.map(r => ('.'.repeat(p) + r + '.'.repeat(p)).split(''));
}

// Waffe aus dem Raster lösen (Kasten der Waffenart, nur Waffenzeichen)
function liftWeapon(g: Grid, box: [number, number, number, number] | undefined, chars: string): [number, number, string][] {
  if (!box) return [];
  const [x0, x1, y0, y1] = box, out: [number, number, string][] = [];
  for (let y = y0; y <= y1 && y < g.length; y++) for (let x = x0 + POSE_PAD; x <= x1 + POSE_PAD; x++) {
    if (chars.includes(g[y][x])) { out.push([x, y, g[y][x]]); g[y][x] = '.'; }
  }
  return out;
}
function drop(g: Grid, px: [number, number, string][], dx: number, dy: number) {
  for (const [x, y, ch] of px) { const nx = x + dx, ny = y + dy; if (ny >= 0 && ny < g.length && nx >= 0 && nx < g[0].length) g[ny][nx] = ch; }
}
// Oberkörper absenken: Zeilen 0..cut rutschen um n nach unten, die Beine bleiben
function crouch(g: Grid, n: number, legs = 4): Grid {
  const h = g.length, w = g[0].length, cut = h - legs, out = blank(w, h);
  for (let y = 0; y < cut; y++) if (y + n < h) out[y + n] = [...g[y]];
  for (let y = cut; y < h; y++) out[y] = g[y].map((c, x) => (c !== '.' ? c : out[y][x]));
  return out;
}
// Oberkörper nach vorn neigen (Seitenansicht zeigt nach rechts)
function lean(g: Grid, dx: number, legs = 4): Grid {
  const h = g.length, w = g[0].length, out = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = y < h - legs ? x - dx : x;
    if (sx >= 0 && sx < w) out[y][x] = g[y][sx];
  }
  return out;
}

const HERO_SWING: Record<string, Record<string, [number, number]>> = {
  krieger: { f: [1, -2], b: [-1, -2], s: [2, -1] },
  waldlaeufer: { f: [1, -1], b: [-1, -1], s: [1, 0] },
  magier: { f: [0, -2], b: [0, -2], s: [0, -2] },
};

// Angriff der Helden: Waffe hochgerissen, Körper geht in die Knie bzw. nach vorn
function heroAttack(cls: string, v: string, rows: string[]): string[] {
  const art = WEAPON_ART[cls], g = pad(rows);
  const wpn = liftWeapon(g, art?.box[v], cls === 'magier' ? 'nscyowh' : art?.clear ?? '');
  let body = v === 's' ? lean(g, 1) : crouch(g, 1);
  const [dx, dy] = HERO_SWING[cls]?.[v] ?? [0, -1];
  drop(body, wpn, dx, dy);
  return toRows(body);
}

// Zauber des Magiers: Stab mit Hand hoch, Funken um die Kugel
function heroCast(v: string, rows: string[]): string[] {
  const g = pad(rows), [x0, x1] = WEAPON_ART.magier.box[v];
  const px: [number, number, string][] = [];
  for (let y = 0; y < g.length; y++) for (let x = x0 + POSE_PAD; x <= x1 + POSE_PAD; x++) if (g[y][x] !== '.') { px.push([x, y, g[y][x]]); g[y][x] = '.'; }
  drop(g, px, 0, -3);
  // Kugel leuchtet: hellster Punkt in der Mitte, Funken außen
  const orb = px.filter(([, , c]) => 'sco'.includes(c));
  if (orb.length) {
    const cx = Math.round(orb.reduce((a, p) => a + p[0], 0) / orb.length), cy = Math.round(orb.reduce((a, p) => a + p[1], 0) / orb.length) - 3;
    const put = (x: number, y: number, c: string) => { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length && g[y][x] === '.') g[y][x] = c; };
    if (cy >= 0) g[cy][cx] = 'w';
    put(cx - 2, cy - 1, 'w'); put(cx + 2, cy - 1, 'y'); put(cx - 2, cy + 2, 'y'); put(cx + 2, cy + 2, 'w');
  }
  // Arm auf der Stabseite hebt sich mit: Zeilen des Oberkörpers etwas gestreckt
  return toRows(g);
}

// Tod: einknicken, kippen, liegen
function deathFrames(rows: string[], front: string[]): string[][] {
  const g = pad(rows);
  const kneel = crouch(g, 2, 4);
  // Beine kürzer: die beiden obersten Beinzeilen fallen weg
  const h = kneel.length;
  const knelt = [...blank(kneel[0].length, 2), ...kneel.slice(0, h - 4), ...kneel.slice(h - 2)];
  // kippen: je höher die Zeile, desto weiter nach hinten
  const tilt = blank(knelt[0].length, knelt.length);
  for (let y = 0; y < knelt.length; y++) {
    const s = Math.round((knelt.length - 1 - y) / 4);
    for (let x = 0; x < knelt[0].length; x++) { const sx = x + s; if (sx < knelt[0].length) tilt[y][x] = knelt[y][sx]; }
  }
  // liegen: Vorderansicht um 90° gedreht (Kopf links), Höhe = Breite der Figur
  const f = toGrid(front), fw = f[0].length, fh = f.length, lie = blank(fh, fw);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) lie[fw - 1 - x][y] = f[y][x];
  // leere Zeilen oben abschneiden, damit die Figur am Boden liegt
  while (lie.length > 1 && lie[0].every(c => c === '.')) lie.shift();
  while (lie.length > 1 && lie[lie.length - 1].every(c => c === '.')) lie.pop();
  const flat = [...blank(fh, 1), ...lie];
  return [toRows(knelt), toRows(tilt), toRows(flat)];
}

// Angriff der Gegner: von Hand gezeichnete Vorderansicht (ATTACK), sonst abgeleitet
function mobAttack(name: string, v: string, rows: string[]): string[] {
  const hand = ATTACK[name]?.[v as 'f' | 's' | 'b'];
  if (hand) return toRows(pad(hand));
  return toRows(v === 's' ? lean(pad(rows), 1) : crouch(pad(rows), 1));
}

export const HEROES = new Set(['krieger', 'magier', 'waldlaeufer']);

// Alle Zusatzbilder einer Figur: Schlüsselendung -> Matrix
export function poseFrames(name: string, views: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const hero = HEROES.has(name);
  for (const [v, rows] of Object.entries(views)) {
    out[`${v}a`] = hero ? heroAttack(name, v, rows) : mobAttack(name, v, rows);
    if (name === 'magier') out[`${v}c`] = heroCast(v, rows);
    if (hero) {
      const [d0, d1, d2] = deathFrames(rows, views.f);
      out[`${v}d0`] = d0; out[`${v}d1`] = d1; out[`${v}d2`] = d2;
    }
  }
  return out;
}
