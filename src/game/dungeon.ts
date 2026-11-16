import { RNG } from '../core/rng';

export const W = 52, H = 34;
export const T = {
  WALL: 0, FLOOR: 1, STAIRS: 2, CHEST: 3, CHEST_OPEN: 4, ALTAR: 5, ALTAR_USED: 6,
  CRACKED: 7, BARREL: 8, PILLAR: 9, GRASS: 10, BURNT: 11, FRAGILE: 12, FRAGILE2: 13, RUBBLE: 14,
  CRATE: 15, CRATE_ON: 16, PLATE: 17, LEVER: 18, ICE: 19, RUNE: 20, TABLET: 21, GOAL: 22, CURSED: 23, TRADER: 24,
} as const;

export interface Room { x: number; y: number; w: number; h: number; }

export const walkable = (t: number) => t === T.FLOOR || t === T.STAIRS || (t >= T.GRASS && t <= T.RUBBLE) || t === T.PLATE || t === T.RUNE || t === T.GOAL;
export const opaque = (t: number) => t === T.WALL || t === T.CRACKED || t === T.PILLAR;
export const wallLike = (t: number) => t === T.WALL || t === T.CRACKED;
export const center = (r: Room): [number, number] => [r.x + (r.w >> 1), r.y + (r.h >> 1)];

export function genDungeon(rng: RNG): { tiles: Uint8Array; rooms: Room[] } {
  for (;;) {
    const tiles = new Uint8Array(W * H);
    const rooms: Room[] = [];
    for (let i = 0; i < 120 && rooms.length < 10; i++) {
      const w = rng.int(4, 8), h = rng.int(3, 6);
      const x = rng.int(1, W - w - 2), y = rng.int(1, H - h - 2);
      if (rooms.some(r => x <= r.x + r.w + 1 && x + w + 1 >= r.x && y <= r.y + r.h + 1 && y + h + 1 >= r.y)) continue;
      rooms.push({ x, y, w, h });
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) tiles[yy * W + xx] = T.FLOOR;
    }
    if (rooms.length < 4) continue;
    rooms.sort((a, b) => a.x - b.x);
    for (let i = 1; i < rooms.length; i++) {
      let [x, y] = center(rooms[i - 1]);
      const [tx, ty] = center(rooms[i]);
      const hFirst = rng.chance(0.5);
      const stepX = () => { while (x !== tx) { x += Math.sign(tx - x); tiles[y * W + x] = T.FLOOR; } };
      const stepY = () => { while (y !== ty) { y += Math.sign(ty - y); tiles[y * W + x] = T.FLOOR; } };
      if (hFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    }
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
