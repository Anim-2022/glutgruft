import { RNG } from '../core/rng';

export const W = 64, H = 40;
export const T = {
  WALL: 0, FLOOR: 1, STAIRS: 2, CHEST: 3, CHEST_OPEN: 4, ALTAR: 5, ALTAR_USED: 6,
  CRACKED: 7, BARREL: 8, PILLAR: 9, GRASS: 10, BURNT: 11, FRAGILE: 12, FRAGILE2: 13, RUBBLE: 14,
  CRATE: 15, CRATE_ON: 16, PLATE: 17, LEVER: 18, ICE: 19, RUNE: 20, TABLET: 21, GOAL: 22, CURSED: 23, TRADER: 24,
  FOUNTAIN: 25, FOUNTAIN_DRY: 26, GATE: 27, BRAZIER: 28, BRAZIER_ON: 29, STATUE: 30, MIMIC: 31,
  // destructible world (FEATURES.destruction): oil and water puddles, cobwebs (walkable); clay pots, spore caps (blocking)
  OIL: 32, WATER: 33, POT: 34, WEB: 35, SPORE: 36,
  CURSED_OPEN: 37, // opened cursed chest (stays purple)
} as const;

export interface Room { x: number; y: number; w: number; h: number; }

export const walkable = (t: number) => t === T.FLOOR || t === T.STAIRS || (t >= T.GRASS && t <= T.RUBBLE) || t === T.PLATE || t === T.RUNE || t === T.GOAL || t === T.BRAZIER || t === T.BRAZIER_ON
  || t === T.OIL || t === T.WATER || t === T.WEB;
export const opaque = (t: number) => t === T.WALL || t === T.CRACKED || t === T.PILLAR || t === T.GATE || t === T.STATUE;
export const wallLike = (t: number) => t === T.WALL || t === T.CRACKED;
export const center = (r: Room): [number, number] => [r.x + (r.w >> 1), r.y + (r.h >> 1)];

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Verbindet zwei Punkte mit einem geknickten Gang, wahlweise zwei Felder breit.
function corridor(tiles: Uint8Array, rng: RNG, ax: number, ay: number, bx: number, by: number, wide: boolean) {
  let x = ax, y = ay;
  const dig = (cx: number, cy: number) => {
    if (cx > 0 && cy > 0 && cx < W - 1 && cy < H - 1) tiles[cy * W + cx] = T.FLOOR;
  };
  const stepX = () => { while (x !== bx) { x += Math.sign(bx - x); dig(x, y); if (wide) dig(x, y + 1); } };
  const stepY = () => { while (y !== by) { y += Math.sign(by - y); dig(x, y); if (wide) dig(x + 1, y); } };
  if (rng.chance(0.5)) { stepX(); stepY(); } else { stepY(); stepX(); }
}

// Räume unterschiedlicher Form und Größe, verbunden als Baum plus zusätzliche Schleifen.
function genRooms(rng: RNG, halls: boolean): { tiles: Uint8Array; rooms: Room[] } | null {
  const tiles = new Uint8Array(W * H);
  const rooms: Room[] = [];
  for (let i = 0; i < 700 && rooms.length < 22; i++) {
    const big = rng.chance(halls ? 0.35 : 0.18);
    const w = big ? rng.int(9, 13) : rng.int(4, 8), h = big ? rng.int(6, 9) : rng.int(3, 6);
    const x = rng.int(1, W - w - 2), y = rng.int(1, H - h - 2);
    if (rooms.some(r => x <= r.x + r.w + 1 && x + w + 1 >= r.x && y <= r.y + r.h + 1 && y + h + 1 >= r.y)) continue;
    rooms.push({ x, y, w, h });
    const shape = w >= 5 && h >= 5 ? rng.int(0, 3) : 0; // 0 Rechteck, 1 abgeschrägte Ecken, 2 Höhle, 3 Kreuz
    const cx = x + (w >> 1), cy = y + (h >> 1);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const ex = Math.min(xx - x, x + w - 1 - xx), ey = Math.min(yy - y, y + h - 1 - yy);
      let open = true;
      if (shape === 1) open = ex + ey >= 2;
      else if (shape === 2) open = ex + ey >= 1 && (ex + ey >= 3 || rng.chance(0.7));
      else if (shape === 3) open = Math.abs(xx - cx) <= Math.max(1, w >> 2) || Math.abs(yy - cy) <= Math.max(1, h >> 2);
      if (open || (xx === cx && yy === cy)) tiles[yy * W + xx] = T.FLOOR;
    }
  }
  if (rooms.length < 6) return null;
  // Minimaler Spannbaum über die Raummitten (Prim)
  const d = (a: Room, b: Room) => Math.abs(center(a)[0] - center(b)[0]) + Math.abs(center(a)[1] - center(b)[1]);
  const linked = new Set<string>(), inTree = [0];
  const link = (a: number, b: number) => {
    linked.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
    const [ax, ay] = center(rooms[a]), [bx, by] = center(rooms[b]);
    corridor(tiles, rng, ax, ay, bx, by, rng.chance(halls ? 0.5 : 0.25));
  };
  while (inTree.length < rooms.length) {
    let best = [0, 0], bd = 1e9;
    for (const a of inTree) for (let b = 0; b < rooms.length; b++) {
      if (inTree.includes(b)) continue;
      const v = d(rooms[a], rooms[b]);
      if (v < bd) { bd = v; best = [a, b]; }
    }
    link(best[0], best[1]);
    inTree.push(best[1]);
  }
  // Schleifen: nahe Räume zusätzlich verbinden, damit es mehrere Wege gibt
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
    if (!linked.has(`${a}-${b}`) && d(rooms[a], rooms[b]) < 20 && rng.chance(0.3)) link(a, b);
  }
  return { tiles, rooms };
}

// Höhle per zellulärem Automaten; alle größeren Kavernen werden zusammengeführt.
function genCave(rng: RNG): { tiles: Uint8Array; rooms: Room[] } | null {
  let g = new Uint8Array(W * H);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) g[y * W + x] = rng.chance(0.56) ? 1 : 0;
  for (let it = 0; it < 5; it++) {
    const n = new Uint8Array(W * H);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      let open = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) open += g[(y + oy) * W + x + ox];
      n[y * W + x] = open >= 5 ? 1 : 0;
    }
    g = n;
  }
  // Regionen bestimmen
  const region = new Int32Array(W * H).fill(-1), sizes: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!g[i] || region[i] >= 0) continue;
    const id = sizes.length, q = [i];
    region[i] = id;
    for (let h = 0; h < q.length; h++) for (const [ox, oy] of N4) {
      const n = q[h] + oy * W + ox;
      if (g[n] && region[n] < 0) { region[n] = id; q.push(n); }
    }
    sizes.push(q.length);
  }
  if (!sizes.length) return null;
  const main = sizes.indexOf(Math.max(...sizes));
  if (sizes[main] < 380) return null;
  const tiles = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (g[i] && (region[i] === main || sizes[region[i]] >= 14)) tiles[i] = T.FLOOR;
  // Nebenkavernen mit einem Tunnel an die Haupthöhle anschließen
  const mainCells: number[] = [];
  for (let i = 0; i < W * H; i++) if (region[i] === main) mainCells.push(i);
  for (let id = 0; id < sizes.length; id++) {
    if (id === main || sizes[id] < 14) continue;
    const from = region.indexOf(id), fx = from % W, fy = (from / W) | 0;
    let best = mainCells[0], bd = 1e9;
    for (let k = 0; k < 60; k++) {
      const c = rng.pick(mainCells), v = Math.abs((c % W) - fx) + Math.abs(((c / W) | 0) - fy);
      if (v < bd) { bd = v; best = c; }
    }
    corridor(tiles, rng, fx, fy, best % W, (best / W) | 0, false);
  }
  // „Räume“ sind hier Ankerpunkte in offenen Bereichen, weit genug auseinander
  const rooms: Room[] = [];
  for (let k = 0; k < 600 && rooms.length < 14; k++) {
    const x = rng.int(4, W - 5), y = rng.int(4, H - 5);
    let open = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) open += tiles[(y + oy) * W + x + ox] === T.FLOOR ? 1 : 0;
    if (open < 8 || rooms.some(r => Math.abs(center(r)[0] - x) + Math.abs(center(r)[1] - y) < 9)) continue;
    rooms.push({ x: x - 2, y: y - 2, w: 5, h: 4 });
  }
  return rooms.length >= 6 ? { tiles, rooms } : null;
}

// style: 0 Gruft (Räume), 1 Höhle, 2 Schmiede (große Hallen, breite Gänge)
export function genDungeon(rng: RNG, style = 0): { tiles: Uint8Array; rooms: Room[] } {
  for (;;) {
    const g = style === 1 ? genCave(rng) : genRooms(rng, style === 2);
    if (!g) continue;
    // Start zufällig, Ziel ist der am weitesten entfernte Raum – so führt der Weg durch die Ebene
    const { tiles, rooms } = g;
    rng.shuffle(rooms);
    const [sx, sy] = center(rooms[0]);
    const d = distMap(tiles, sx, sy);
    const far = (r: Room) => d[center(r)[1] * W + center(r)[0]];
    if (rooms.some(r => far(r) < 0)) continue;
    // abgeschnittene Bodeninseln zuschütten, damit nichts Unerreichbares entsteht
    for (let i = 0; i < W * H; i++) if (tiles[i] === T.FLOOR && d[i] < 0) tiles[i] = T.WALL;
    let fi = 1;
    for (let i = 2; i < rooms.length; i++) if (far(rooms[i]) > far(rooms[fi])) fi = i;
    [rooms[fi], rooms[rooms.length - 1]] = [rooms[rooms.length - 1], rooms[fi]];
    return { tiles, rooms };
  }
}

// Sichtlinie (Bresenham). Das Zielfeld selbst darf eine Wand sein.
export function los(tiles: Uint8Array, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
    if (x0 === x1 && y0 === y1) return true;
    if (opaque(tiles[y0 * W + x0])) return false;
  }
}

export function computeFov(tiles: Uint8Array, px: number, py: number, radius: number, vis: Uint8Array, seen: Uint8Array): void {
  vis.fill(0);
  for (let y = Math.max(0, py - radius); y <= Math.min(H - 1, py + radius); y++) {
    for (let x = Math.max(0, px - radius); x <= Math.min(W - 1, px + radius); x++) {
      if ((x - px) ** 2 + (y - py) ** 2 > radius * radius + 1) continue;
      if (los(tiles, px, py, x, y)) { vis[y * W + x] = 1; seen[y * W + x] = 1; }
    }
  }
}

// Schrittabstand zu einem Ziel über begehbare Felder (für Gegner-Wegfindung)
export function distMap(tiles: Uint8Array, tx: number, ty: number): Int16Array {
  const d = new Int16Array(W * H).fill(-1);
  const q = [ty * W + tx];
  d[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], cx = c % W, cy = (c / W) | 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (d[n] !== -1 || !walkable(tiles[n])) continue;
      d[n] = d[c] + 1;
      q.push(n);
    }
  }
  return d;
}
