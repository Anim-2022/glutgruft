// Rätselkammern: reine Logik ohne Spielzustand, damit Lösbarkeit testbar bleibt.
// Jede Kammer hat 7x7 Innenfelder; die Tür liegt immer unten in der Mitte bei (3, 7).
import { RNG } from '../core/rng';

export const VS = 7;
export const DOOR: [number, number] = [3, 7];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- Kisten und Druckplatten ----------
// '.' Boden, '#' Fels, 'c' Kiste, 'p' Platte, 'L' Hebel (setzt zurück)
export const CRATE_TEMPLATES: string[][] = [
  ['.......', '.p...p.', '.......', '..c.c..', '.......', '.......', 'L......'],
  ['#.....#', '.p...p.', '...c...', '.#...#.', '...c...', '.......', 'L.....#'],
  ['.......', '.p#.#p.', '.......', '..c.c..', '.......', '.#...#.', 'L......'],
  ['.......', '.c.#.c.', '...#...', 'p..#..p', '...#...', '.......', 'L......'],
  ['.......', '..c#c..', '...#...', '.p.#.p.', '...#...', '.......', 'L......'],
  ['p..p..p', '.......', '.c.c.c.', '.......', '..#.#..', '.......', 'L......'],
  ['##...##', '#p...p#', '.......', '..c#c..', '.......', '.......', 'L......'],
  ['.p.....', '.#.##..', '.c...c.', '.#.#.#.', '.....p.', '.......', 'L......'],
  ['.......', '.#p#...', '.......', '.c.#.c.', '.....#.', '....p..', 'L......'],
  ['...p...', '.#...#.', '...c...', '.p.c.p.', '...c...', '.#...#.', 'L......'],
  ['.......', '.pp....', '.##.c..', '....c..', '.#.....', '.......', 'L......'],
];

export const mirror = (tpl: string[]) => tpl.map(r => [...r].reverse().join(''));

// Breitensuche über (Spieler, Kisten). Liefert die Mindestzahl an Zügen oder -1.
export function cratesSolvable(tpl: string[]): number {
  const cell = (x: number, y: number) => (x === DOOR[0] && y === DOOR[1] ? '.' : x < 0 || y < 0 || x >= VS || y >= VS ? '#' : tpl[y][x]);
  const solid = (x: number, y: number) => { const c = cell(x, y); return c === '#' || c === 'L'; };
  const crates: number[] = [], plates: number[] = [];
  for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) {
    if (tpl[y][x] === 'c') crates.push(y * 8 + x);
    if (tpl[y][x] === 'p') plates.push(y * 8 + x);
  }
  if (crates.length !== plates.length) return -1;
  const goal = [...plates].sort((a, b) => a - b).join(',');
  const key = (p: number, cs: number[]) => `${p}|${cs.join(',')}`;
  let frontier: [number, number[]][] = [[DOOR[1] * 8 + DOOR[0], [...crates].sort((a, b) => a - b)]];
  const seen = new Set([key(...frontier[0])]);
  for (let depth = 0; frontier.length && depth < 400; depth++) {
    const next: [number, number[]][] = [];
    for (const [p, cs] of frontier) {
      if (cs.join(',') === goal) return depth;
      const px = p % 8, py = (p / 8) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = px + dx, ny = py + dy;
        if (solid(nx, ny)) continue;
        const n = ny * 8 + nx;
        let ncs = cs;
        if (cs.includes(n)) {
          const bx = nx + dx, by = ny + dy, b = by * 8 + bx;
          if (solid(bx, by) || cs.includes(b) || (bx === DOOR[0] && by === DOOR[1])) continue;
          ncs = cs.map(c => (c === n ? b : c)).sort((a, c) => a - c);
        }
        const k = key(n, ncs);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push([n, ncs]);
      }
    }
    frontier = next;
  }
  return -1;
}

// ---------- Eishalle ----------
// 'i' Eis, '#' Fels, 'g' Zielplatte (fester Boden)

export type Ground = 'ice' | 'floor' | 'block';

// Ein Zug von (x, y) in eine Richtung: auf Eis gleitet man bis zum nächsten Hindernis oder festen Boden.
export function slide(kind: (x: number, y: number) => Ground, x: number, y: number, dx: number, dy: number): [number, number] {
  for (;;) {
    const k = kind(x + dx, y + dy);
    if (k === 'block') return [x, y];
    x += dx; y += dy;
    if (k === 'floor') return [x, y];
  }
}

export function iceKind(grid: string[]): (x: number, y: number) => Ground {
  return (x, y) => {
    if (x === DOOR[0] && y === DOOR[1]) return 'floor';
    if (x < 0 || y < 0 || x >= VS || y >= VS) return 'block';
    const c = grid[y][x];
    return c === '#' ? 'block' : c === 'g' ? 'floor' : 'ice';
  };
}

function iceDist(grid: string[], from: number): Map<number, number> {
  const kind = iceKind(grid), d = new Map([[from, 0]]), q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % 8, cy = (c / 8) | 0;
    for (const [dx, dy] of DIRS) {
      if (c === DOOR[1] * 8 + DOOR[0] && dy !== -1) continue; // von der Tür geht es nur hinein
      const [nx, ny] = slide(kind, cx, cy, dx, dy), n = ny * 8 + nx;
      if (n === c || d.has(n)) continue;
      d.set(n, d.get(c)! + 1);
      q.push(n);
    }
  }
  return d;
}

// Mindestzüge von der Tür zum Ziel; -1, wenn unlösbar oder wenn man sich festfahren kann.
export function iceMoves(grid: string[]): number {
  const door = DOOR[1] * 8 + DOOR[0];
  let goal = -1;
  for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) if (grid[y][x] === 'g') goal = y * 8 + x;
  const d = iceDist(grid, door);
  if (!d.has(goal)) return -1;
  for (const pos of d.keys()) if (!iceDist(grid, pos).has(door)) return -1;
  return d.get(goal)!;
}

export function genIce(rng: RNG): string[] {
  for (;;) {
    const g = Array.from({ length: VS }, () => Array(VS).fill('i'));
    for (let k = rng.int(6, 10); k > 0; k--) g[rng.int(0, VS - 1)][rng.int(0, VS - 1)] = '#';
    g[VS - 1][DOOR[0]] = 'i';
    const gx = rng.int(0, VS - 1), gy = rng.int(0, VS - 3);
    g[gy][gx] = 'g';
    const grid = g.map(r => r.join(''));
    if (iceMoves(grid) >= 4) return grid;
  }
}
