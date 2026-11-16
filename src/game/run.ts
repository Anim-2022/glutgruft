import { RNG } from '../core/rng';
import type { Meta } from '../core/save';
import { W, H, T, Room, genDungeon, center, walkable, opaque, los, computeFov, distMap } from './dungeon';
import { VS, CRATE_TEMPLATES, mirror, genIce, slide } from './puzzles';
import { CLASSES, ClassId, MOBS, PERKS, RELICS, BOSS_BY_BIOME, BIOME_NAMES, FLOORS_PER_BIOME, LAST_FLOOR, biomeOf, spawnTable } from './content';

export interface Actor {
  id: number; kind: string; name: string;
  x: number; y: number; hp: number; maxHp: number; atk: number; def: number;
  st: Record<string, number>; // Statuseffekte -> verbleibende Züge
  xp: number; cd: number; awake: boolean; boss?: boolean;
}

export interface Player extends Actor {
  cls: ClassId; lvl: number; exp: number;
  res: number; resMax: number; potions: number; bombs: number;
  crit: number; pow: number; vamp: number; thorns: number; soulMul: number;
  dir: [number, number]; perks: string[]; relics: string[]; hits: number;
}

export interface Puzzle {
  kind: 'crates' | 'runes' | 'ice';
  x: number; y: number; // linke obere Ecke der 7x7 Innenfelder
  solved: boolean; dead: boolean; entered: boolean;
  layout: number[];               // Kisten: Ausgangszustand für den Hebel
  order: number[]; runes: Record<number, number>; pressed: number[]; fails: number;
}

export type Fx =
  | { k: 'num'; x: number; y: number; s: string; col: string }
  | { k: 'shake'; n: number }
  | { k: 'lunge'; id: number; dx: number; dy: number }
  | { k: 'flash'; id: number }
  | { k: 'die'; x: number; y: number; kind: string }
  | { k: 'boom'; x: number; y: number; r: number }
  | { k: 'debris'; x: number; y: number }
  | { k: 'bolt'; x0: number; y0: number; x1: number; y1: number; col: string };

export interface Run {
  seed: number; rng: RNG; floor: number;
  tiles: Uint8Array; seen: Uint8Array; vis: Uint8Array;
  p: Player; mobs: Actor[]; traps: { x: number; y: number }[];
  fire: Map<number, number>;   // Feld -> verbleibende Züge
  fuses: Map<number, number>;  // Fass -> Züge bis zur Explosion
  cracks: Map<number, number>; // rissige Wand -> erhaltene Schläge
  puzzle: Puzzle | null; willUsed: boolean;
  log: string[]; fx: Fx[];
  mode: 'play' | 'perk' | 'dead' | 'win';
  perkChoices: string[];
  souls: number; kills: number; turn: number; nextId: number;
}

export type Action =
  | { t: 'move'; dx: number; dy: number }
  | { t: 'wait' } | { t: 'shoot' } | { t: 'potion' } | { t: 'descend' } | { t: 'bomb' }
  | { t: 'skill'; i: number } | { t: 'perk'; i: number };

const FOV_R = 8;
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const xpNeed = (lvl: number) => 8 + lvl * 6;
export const playerAtk = (p: Player) => p.atk + (p.st.stark ? 3 : 0);

function say(run: Run, s: string) { run.log.push(s); if (run.log.length > 40) run.log.shift(); }
const mobAt = (run: Run, x: number, y: number) => run.mobs.find(m => m.x === x && m.y === y);
const isFree = (run: Run, x: number, y: number) =>
  x >= 0 && y >= 0 && x < W && y < H && walkable(run.tiles[y * W + x]) && !mobAt(run, x, y) && !(run.p.x === x && run.p.y === y);

export function newRun(seed: number, cls: ClassId, meta: Meta): Run {
  const c = CLASSES[cls];
  const hp = c.hp + 3 * meta.upg.vit;
  const p: Player = {
    id: 0, kind: cls, name: c.name, x: 0, y: 0, hp, maxHp: hp, atk: c.atk + meta.upg.atk, def: c.def,
    st: {}, xp: 0, cd: 0, awake: true,
    cls, lvl: 1, exp: 0, res: c.resStart, resMax: c.resMax, potions: 1 + meta.upg.trank, bombs: 1,
    crit: 0.05, pow: 1, vamp: 0, thorns: 0, soulMul: 1, dir: [1, 0], perks: [], relics: [], hits: 0,
  };
  const run: Run = {
    seed, rng: new RNG(seed), floor: 0,
    tiles: new Uint8Array(W * H), seen: new Uint8Array(W * H), vis: new Uint8Array(W * H),
    p, mobs: [], traps: [], fire: new Map(), fuses: new Map(), cracks: new Map(), puzzle: null, willUsed: false, log: [], fx: [], mode: 'play', perkChoices: [],
    souls: 0, kills: 0, turn: 0, nextId: 1,
  };
  nextFloor(run);
  return run;
}

function spawnMob(run: Run, kind: string, x: number, y: number): Actor {
  const d = MOBS[kind];
  const s = 1 + 0.22 * (run.floor - 1);
  const hp = d.boss ? d.hp : Math.round(d.hp * s);
  const m: Actor = {
    id: run.nextId++, kind, name: d.name, x, y, hp, maxHp: hp,
    atk: d.boss ? d.atk : d.atk + Math.round(run.floor * 0.7), def: d.def,
    st: {}, xp: d.xp, cd: 0, awake: false, boss: d.boss,
  };
  run.mobs.push(m);
  return m;
}

function freeInRoom(run: Run, r: Room): [number, number] | null {
  for (let i = 0; i < 30; i++) {
    const x = run.rng.int(r.x, r.x + r.w - 1), y = run.rng.int(r.y, r.y + r.h - 1);
    if (run.tiles[y * W + x] === T.FLOOR && isFree(run, x, y)) return [x, y];
  }
  return null;
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- Rätselkammern ----------

export const RUNE_NAMES = ['Sonne', 'Mond', 'Stern', 'Auge'];
const has = (p: Player, id: string) => p.relics.includes(id);
export const skillCost = (p: Player, i: number) => Math.max(1, CLASSES[p.cls].skills[i].cost - (has(p, 'echo') ? 1 : 0));
const fovR = (run: Run) => FOV_R + (has(run.p, 'geisterlicht') ? 3 : 0);

// Sucht 9x9 massiven Fels, höhlt 7x7 aus und gräbt von der Tür (unten Mitte) einen Gang zum Rest der Ebene.
function addVault(run: Run, rooms: Room[]): boolean {
  const t = run.tiles, rng = run.rng;
  for (let n = 0; n < 150; n++) {
    const x0 = rng.int(1, W - 10), y0 = rng.int(1, H - 11);
    let solid = true;
    for (let y = y0; y < y0 + 9 && solid; y++) for (let x = x0; x < x0 + 9; x++) if (t[y * W + x] !== T.WALL) { solid = false; break; }
    if (!solid) continue;
    const dx = x0 + 4, dy = y0 + 8, start = (dy + 1) * W + dx;
    const inRing = (x: number, y: number) => x >= x0 && x < x0 + 9 && y >= y0 && y < y0 + 9;
    const from = new Map<number, number>([[start, -1]]);
    let end = -1;
    if (walkable(t[start])) from.clear();
    else if (t[start] !== T.WALL) continue;
    else {
      const q = [start];
      for (let h = 0; h < q.length && end < 0; h++) {
        const c = q[h], cx = c % W, cy = (c / W) | 0;
        for (const [ox, oy] of DIRS4) {
          const nx = cx + ox, ny = cy + oy, ni = ny * W + nx;
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || inRing(nx, ny) || from.has(ni)) continue;
          if (walkable(t[ni])) { end = c; break; }
          if (t[ni] !== T.WALL) continue;
          from.set(ni, c);
          q.push(ni);
        }
      }
      if (end < 0) continue;
      for (let c = end; c !== -1; c = from.get(c)!) t[c] = T.FLOOR;
    }
    t[dy * W + dx] = T.FLOOR;
    const ix = x0 + 1, iy = y0 + 1;
    const pz: Puzzle = { kind: rng.pick(['crates', 'runes', 'ice'] as const), x: ix, y: iy, solved: false, dead: false, entered: false, layout: [], order: [], runes: {}, pressed: [], fails: 0 };
    const put = (x: number, y: number, tile: number) => { t[(iy + y) * W + ix + x] = tile; };
    if (pz.kind === 'crates') {
      let tpl = rng.pick(CRATE_TEMPLATES);
      if (rng.chance(0.5)) tpl = mirror(tpl);
      const map: Record<string, number> = { '.': T.FLOOR, '#': T.WALL, c: T.CRATE, p: T.PLATE, L: T.LEVER };
      for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) { put(x, y, map[tpl[y][x]]); pz.layout.push(map[tpl[y][x]]); }
    } else if (pz.kind === 'ice') {
      const grid = genIce(rng);
      for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) put(x, y, grid[y][x] === '#' ? T.WALL : grid[y][x] === 'g' ? T.GOAL : T.ICE);
    } else {
      for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) put(x, y, T.FLOOR);
      const kinds = rng.shuffle([0, 1, 2, 3]);
      [[1, 1], [5, 1], [1, 4], [5, 4]].forEach(([x, y], k) => { put(x, y, T.RUNE); pz.runes[(iy + y) * W + ix + x] = kinds[k]; });
      pz.order = rng.shuffle([0, 1, 2, 3]);
      // Die Tafel mit der Reihenfolge steht in einem anderen Raum
      let placed = false;
      for (const r of rng.shuffle(rooms.slice(1))) {
        if (tryBlock(run, r.x, r.y, T.TABLET) || tryBlock(run, r.x + r.w - 1, r.y, T.TABLET)) { placed = true; break; }
      }
      if (!placed) put(3, 0, T.TABLET);
    }
    run.puzzle = pz;
    return true;
  }
  return false;
}

function inVault(run: Run, x: number, y: number): boolean {
  const z = run.puzzle;
  return !!z && x >= z.x && x < z.x + VS && y >= z.y && y < z.y + VS;
}

function solve(run: Run) {
  const z = run.puzzle!, p = run.p;
  z.solved = true;
  say(run, 'Das Rätsel ist gelöst!');
  run.souls += Math.round(15 * p.soulMul);
  run.fx.push({ k: 'shake', n: 3 });
  const pool = run.rng.shuffle(Object.keys(RELICS).filter(id => !has(p, id)));
  if (!pool.length) { p.potions += 2; return; }
  run.perkChoices = pool.slice(0, 2);
  run.mode = 'perk';
}

// Wird nach jedem Schritt des Spielers aufgerufen.
function afterStep(run: Run) {
  const z = run.puzzle, p = run.p;
  if (!z) return;
  const i = p.y * W + p.x, t = run.tiles[i];
  if (!z.entered && inVault(run, p.x, p.y)) {
    z.entered = true;
    say(run, z.kind === 'crates' ? 'Rätsel: Schiebe jede Kiste auf eine Platte. Der Hebel setzt zurück.'
      : z.kind === 'ice' ? 'Rätsel: Auf dem Eis rutschst du. Erreiche die leuchtende Platte.'
      : 'Rätsel: Betritt die Runen in der richtigen Reihenfolge. Eine Tafel kennt sie.');
  }
  if (z.solved || z.dead) return;
  if (t === T.GOAL) solve(run);
  else if (t === T.RUNE) {
    const k = z.runes[i];
    if (z.pressed.includes(k)) return;
    if (k === z.order[z.pressed.length]) {
      z.pressed.push(k);
      say(run, `${RUNE_NAMES[k]} leuchtet auf.`);
      if (z.pressed.length === z.order.length) solve(run);
    } else {
      z.pressed = [];
      z.fails++;
      for (const m of run.mobs) m.awake = true;
      run.fx.push({ k: 'shake', n: 5 });
      if (z.fails >= 3) { z.dead = true; say(run, 'Falsch! Die Runen zerfallen zu Staub.'); }
      else say(run, 'Falsch! Die Runen erlöschen – und die ganze Ebene erwacht.');
    }
  }
}

function checkCrates(run: Run) {
  const z = run.puzzle;
  if (!z || z.solved || z.kind !== 'crates') return;
  for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) if (run.tiles[(z.y + y) * W + z.x + x] === T.PLATE) return;
  solve(run);
}

function resetCrates(run: Run) {
  const z = run.puzzle;
  if (!z || z.kind !== 'crates') return;
  if (z.solved) { say(run, 'Das Rätsel ist bereits gelöst.'); return; }
  if (run.mobs.some(m => inVault(run, m.x, m.y))) { say(run, 'Der Hebel klemmt, solange Gegner im Raum sind.'); return; }
  z.layout.forEach((tile, k) => { run.tiles[(z.y + ((k / VS) | 0)) * W + z.x + (k % VS)] = tile; });
  say(run, 'Die Kisten rumpeln zurück an ihren Platz.');
}



// Setzt ein blockierendes Objekt nur, wenn danach noch alles erreichbar bleibt.
function tryBlock(run: Run, x: number, y: number, tile: number): boolean {
  const i = y * W + x;
  if (run.tiles[i] !== T.FLOOR || !isFree(run, x, y)) return false;
  const reach = (d: Int16Array) => d.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
  const before = reach(distMap(run.tiles, run.p.x, run.p.y));
  run.tiles[i] = tile;
  if (reach(distMap(run.tiles, run.p.x, run.p.y)) === before - 1) return true;
  run.tiles[i] = T.FLOOR;
  return false;
}

// Versteck hinter einer rissigen Wand: 3x3-Kammer mit Truhe, ringsum massiver Fels.
function addSecret(run: Run, rooms: Room[]): boolean {
  const t = run.tiles;
  for (let n = 0; n < 40; n++) {
    const r = run.rng.pick(rooms), [ox, oy] = run.rng.pick(DIRS4);
    const wx = ox ? (ox > 0 ? r.x + r.w : r.x - 1) : run.rng.int(r.x, r.x + r.w - 1);
    const wy = oy ? (oy > 0 ? r.y + r.h : r.y - 1) : run.rng.int(r.y, r.y + r.h - 1);
    const cx = wx + ox * 2, cy = wy + oy * 2; // Mitte der Kammer
    if (cx < 3 || cy < 3 || cx >= W - 3 || cy >= H - 3) continue;
    let solid = true;
    for (let y = cy - 2; y <= cy + 2 && solid; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      const inner = x === wx - ox && y === wy - oy; // das Raumfeld vor der Wand
      if (!inner && t[y * W + x] !== T.WALL) { solid = false; break; }
    }
    if (!solid) continue;
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) t[y * W + x] = T.FLOOR;
    t[cy * W + cx] = T.CHEST;
    t[wy * W + wx] = T.CRACKED;
    return true;
  }
  return false;
}

function nextFloor(run: Run) {
  run.floor++;
  if (run.floor > 1) run.souls += Math.round(5 * run.p.soulMul);
  const { tiles, rooms } = genDungeon(run.rng);
  const rng = run.rng, biome = biomeOf(run.floor);
  run.tiles = tiles;
  run.seen = new Uint8Array(W * H);
  run.mobs = [];
  run.traps = [];
  run.fire = new Map(); run.fuses = new Map(); run.cracks = new Map();
  run.puzzle = null; run.willUsed = false;
  if (has(run.p, 'sprengmeister') && run.floor > 1) run.p.bombs++;
  [run.p.x, run.p.y] = center(rooms[0]);
  const last = rooms[rooms.length - 1];
  const bossFloor = run.floor % FLOORS_PER_BIOME === 0;
  if (bossFloor) {
    const [bx, by] = center(last);
    spawnMob(run, BOSS_BY_BIOME[biome], bx, by);
  } else {
    const [sx, sy] = center(last);
    run.tiles[sy * W + sx] = T.STAIRS;
  }
  if (!bossFloor && rng.chance(0.6)) addVault(run, rooms);
  // Bewuchs (brennbar): Moos in der Gruft, Pilzrasen in der Höhle, Kohlenstaub in der Schmiede
  for (const r of rooms) {
    if (!rng.chance([0.3, 0.6, 0.35][biome])) continue;
    let x = rng.int(r.x, r.x + r.w - 1), y = rng.int(r.y, r.y + r.h - 1);
    for (let k = rng.int(4, 12); k > 0; k--) {
      if (run.tiles[y * W + x] === T.FLOOR) run.tiles[y * W + x] = T.GRASS;
      const [ox, oy] = rng.pick(DIRS4);
      x = Math.max(r.x, Math.min(r.x + r.w - 1, x + ox)); y = Math.max(r.y, Math.min(r.y + r.h - 1, y + oy));
    }
  }
  const table = spawnTable(run.floor);
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    const n = (bossFloor && r === last) ? 0 : rng.int(1, 2) + Math.floor(run.floor / 4);
    for (let k = 0; k < n; k++) {
      const f = freeInRoom(run, r);
      if (f) spawnMob(run, rng.pick(table), f[0], f[1]);
    }
    if (rng.chance(0.4)) {
      const cx = rng.chance(0.5) ? r.x : r.x + r.w - 1, cy = rng.chance(0.5) ? r.y : r.y + r.h - 1;
      tryBlock(run, cx, cy, rng.chance(0.25) ? T.ALTAR : T.CHEST);
    }
    // Säulen in großen Räumen, Fässer verstreut
    if (r.w >= 6 && r.h >= 5 && rng.chance(0.5)) {
      for (const [px, py] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) tryBlock(run, px, py, T.PILLAR);
    }
    if (rng.chance(0.35)) {
      for (let k = rng.int(1, 2); k > 0; k--) tryBlock(run, rng.int(r.x, r.x + r.w - 1), rng.int(r.y, r.y + r.h - 1), T.BARREL);
    }
  }
  // Brüchiger Boden: Abkürzung nach unten, nie an einem Boss vorbei
  if (!bossFloor && run.floor < LAST_FLOOR && rng.chance(0.4)) {
    // nur dort, wo man auch außen herum käme
    const f = freeInRoom(run, rng.pick(rooms.slice(1)));
    if (f && tryBlock(run, f[0], f[1], T.BARREL)) run.tiles[f[1] * W + f[0]] = T.FRAGILE;
  }
  if (rng.chance(0.65)) addSecret(run, rooms);
  computeFov(run.tiles, run.p.x, run.p.y, fovR(run), run.vis, run.seen);
  say(run, `Ebene ${run.floor} – ${BIOME_NAMES[biome]}`);
  if (bossFloor) say(run, 'Etwas Mächtiges lauert hier ...');
}

// ---------- Zerstörung und Feuer ----------

function ignite(run: Run, x: number, y: number, turns = 3) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x, t = run.tiles[i];
  if (t === T.BARREL) { if (!run.fuses.has(i)) run.fuses.set(i, 1); return; }
  if (!walkable(t) || t === T.STAIRS) return;
  run.fire.set(i, Math.max(run.fire.get(i) ?? 0, t === T.GRASS ? turns + 1 : turns));
}

export function explode(run: Run, x: number, y: number, r = 1) {
  const p = run.p;
  run.fx.push({ k: 'boom', x, y, r }, { k: 'shake', n: 6 });
  const chain: number[] = [];
  for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
    if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
    const i = yy * W + xx, t = run.tiles[i];
    if (t === T.CRACKED) breakWall(run, i);
    else if (t === T.PILLAR) collapse(run, xx, yy);
    else if (t === T.BARREL) chain.push(i);
    else if (t === T.GRASS) ignite(run, xx, yy);
  }
  const dmg = 9 + run.floor;
  for (const m of run.mobs.filter(m => Math.abs(m.x - x) <= r && Math.abs(m.y - y) <= r)) damage(run, m, dmg, '#ef7d57');
  if (!has(p, 'pulverfass') && Math.abs(p.x - x) <= r && Math.abs(p.y - y) <= r) damage(run, p, Math.ceil(dmg / 2), '#b13e53');
  for (const i of chain) if (run.tiles[i] === T.BARREL) burst(run, i);
}

function breakWall(run: Run, i: number) {
  run.tiles[i] = T.RUBBLE;
  run.cracks.delete(i);
  run.fx.push({ k: 'debris', x: i % W, y: (i / W) | 0 });
  say(run, 'Die Wand bricht ein!');
}

function burst(run: Run, i: number) {
  run.tiles[i] = T.BURNT;
  run.fuses.delete(i);
  explode(run, i % W, (i / W) | 0, 1);
}

// Eine Säule stürzt ein und begräbt, was direkt daneben steht.
function collapse(run: Run, x: number, y: number) {
  run.tiles[y * W + x] = T.RUBBLE;
  run.fx.push({ k: 'debris', x, y });
  say(run, 'Eine Säule stürzt ein!');
  for (const [ox, oy] of DIRS4) {
    const m = mobAt(run, x + ox, y + oy);
    if (m) { stun(run, m, 2); damage(run, m, 8 + run.floor, '#94b0c2'); }
    else if (run.p.x === x + ox && run.p.y === y + oy) damage(run, run.p, 4 + Math.floor(run.floor / 2), '#b13e53');
  }
}

function tickWorld(run: Run) {
  for (const [i, t] of [...run.fuses]) {
    if (run.tiles[i] !== T.BARREL) { run.fuses.delete(i); continue; }
    if (t <= 1) burst(run, i); else run.fuses.set(i, t - 1);
  }
  // Feuer breitet sich über Bewuchs aus und brennt herunter
  for (const [i, t] of [...run.fire]) {
    const x = i % W, y = (i / W) | 0;
    for (const [ox, oy] of DIRS4) {
      const n = (y + oy) * W + x + ox, nt = run.tiles[n];
      if (nt === T.BARREL) ignite(run, x + ox, y + oy);
      else if (nt === T.GRASS && !run.fire.has(n) && run.rng.chance(0.55)) ignite(run, x + ox, y + oy);
    }
    if (t <= 1) { run.fire.delete(i); if (run.tiles[i] === T.GRASS) run.tiles[i] = T.BURNT; }
    else run.fire.set(i, t - 1);
  }
}

// ---------- Schaden ----------

// Betäubt ein Ziel. Danach ist es kurz immun, Bosse nur einen Zug lang betäubt.
function stun(run: Run, a: Actor, turns: number) {
  if (a.st.immun) return;
  a.st.stun = (a.boss ? 1 : turns) + (has(run.p, 'frostkern') ? 1 : 0);
}


function damage(run: Run, dst: Actor, amt: number, col = '#f4f4f4', crit = false) {
  amt = Math.max(1, Math.round(amt));
  dst.hp -= amt;
  run.fx.push({ k: 'flash', id: dst.id });
  run.fx.push({ k: 'num', x: dst.x, y: dst.y, s: crit ? `${amt}!` : `${amt}`, col: crit ? '#ffcd75' : col });
  if (dst !== run.p && dst.hp <= 0) kill(run, dst);
}

function playerHit(run: Run, dst: Actor, base: number) {
  const p = run.p;
  if (dst.boss && has(p, 'jaeger')) base *= 1.5;
  const crit = run.rng.chance(p.crit);
  if (has(p, 'giftzahn')) dst.st.gift = 3;
  damage(run, dst, (crit ? base * 2 : base) - dst.def, '#f4f4f4', crit);
  if (has(p, 'donnerfaust') && ++p.hits % 5 === 0) {
    run.fx.push({ k: 'shake', n: 4 });
    for (const m of run.mobs.filter(m => m !== dst && cheb(m, dst) <= 1)) damage(run, m, base * 0.6, '#ffcd75');
  }
}

// Tödlicher Treffer? Eisenwille rettet einmal pro Ebene.
function fatal(run: Run) {
  const p = run.p;
  if (p.hp > 0) return;
  if (has(p, 'eisenwille') && !run.willUsed) { run.willUsed = true; p.hp = 1; say(run, 'Eisenwille hält dich am Leben!'); return; }
  p.hp = 0;
  run.mode = 'dead';
  say(run, 'Du bist gefallen.');
}

function kill(run: Run, m: Actor) {
  const p = run.p;
  run.mobs = run.mobs.filter(o => o !== m);
  run.fx.push({ k: 'die', x: m.x, y: m.y, kind: m.kind });
  run.kills++;
  p.exp += m.xp;
  run.souls += Math.max(1, Math.round((m.xp / 3) * p.soulMul));
  if (p.vamp) p.hp = Math.min(p.maxHp, p.hp + p.vamp);
  if (p.cls === 'waldlaeufer') gain(p, 1);
  if (m.boss) {
    say(run, `${m.name} ist besiegt!`);
    run.souls += Math.round(25 * p.soulMul);
    run.fx.push({ k: 'shake', n: 8 });
    if (run.floor >= LAST_FLOOR) { run.mode = 'win'; return; }
    run.tiles[m.y * W + m.x] = T.STAIRS;
    p.potions++;
  } else if (run.rng.chance(0.08)) {
    p.potions++;
    say(run, `${m.name} lässt einen Heiltrank fallen.`);
  }
  checkLevel(run);
}

function checkLevel(run: Run) {
  const p = run.p;
  if (run.mode !== 'play' || p.exp < xpNeed(p.lvl)) return;
  p.exp -= xpNeed(p.lvl);
  p.lvl++;
  p.maxHp += 2;
  p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.2));
  say(run, `Stufe ${p.lvl} erreicht!`);
  offerPerks(run);
}

function offerPerks(run: Run) {
  run.perkChoices = run.rng.shuffle(Object.keys(PERKS)).slice(0, 3);
  run.mode = 'perk';
}

function applyPerk(run: Run, id: string) {
  const p = run.p;
  if (RELICS[id]) {
    p.relics.push(id);
    if (id === 'blutpakt') { p.atk += 4; p.maxHp = Math.max(5, p.maxHp - 8); p.hp = Math.min(p.hp, p.maxHp); }
    say(run, `Reliquie: ${RELICS[id].name}`);
    return;
  }
  p.perks.push(id);
  switch (id) {
    case 'zaeh': p.maxHp += 6; p.hp = Math.min(p.maxHp, p.hp + 6); break;
    case 'scharf': p.atk += 1; break;
    case 'panzer': p.def += 1; break;
    case 'vampir': p.vamp += 2; break;
    case 'krit': p.crit += 0.12; break;
    case 'quelle': p.resMax += 3; break;
    case 'meister': p.pow += 0.25; break;
    case 'vorrat': p.potions += 2; break;
    case 'dornen': p.thorns += 2; break;
    case 'seelen': p.soulMul += 0.5; break;
  }
  say(run, `Neue Gabe: ${PERKS[id].name}`);
}

// ---------- Spieleraktionen ----------

function nearestMob(run: Run, range: number): Actor | undefined {
  let best: Actor | undefined, bd = 99;
  for (const m of run.mobs) {
    if (!run.vis[m.y * W + m.x]) continue;
    const d = cheb(m, run.p);
    if (d <= range && d < bd) { bd = d; best = m; }
  }
  return best;
}

function gain(p: Player, n: number) { p.res = Math.max(0, Math.min(p.resMax, p.res + n)); }

function openChest(run: Run, i: number) {
  const p = run.p;
  run.tiles[i] = T.CHEST_OPEN;
  for (let k = has(p, 'muenze') ? 2 : 1; k > 0; k--) {
    const r = run.rng.next();
    if (r < 0.3) { p.potions++; say(run, 'Truhe: ein Heiltrank.'); }
    else if (r < 0.5) { p.bombs += 2; say(run, 'Truhe: zwei Bomben.'); }
    else if (r < 0.7) { p.atk++; say(run, 'Truhe: bessere Waffe (+1 Angriff).'); }
    else if (r < 0.87) { p.def++; say(run, 'Truhe: bessere Rüstung (+1 Verteidigung).'); }
    else { const n = Math.round(10 * p.soulMul); run.souls += n; say(run, `Truhe: ${n} Seelensplitter.`); }
  }
}

function useSkill(run: Run, i: number): boolean {
  const p = run.p, sk = CLASSES[p.cls].skills[i];
  if (!sk) return false;
  const cost = skillCost(p, i);
  if (p.res < cost) { say(run, `Nicht genug ${CLASSES[p.cls].resName}.`); return false; }
  const atk = playerAtk(p);
  const around = (r: number) => run.mobs.filter(m => cheb(m, p) <= r && run.vis[m.y * W + m.x]);
  const noTarget = () => { say(run, 'Kein Ziel in Reichweite.'); return false; };
  switch (`${p.cls}${i}`) {
    case 'krieger0': {
      const t = nearestMob(run, 1);
      if (!t) return noTarget();
      stun(run, t, 2);
      run.fx.push({ k: 'lunge', id: 0, dx: Math.sign(t.x - p.x), dy: Math.sign(t.y - p.y) });
      playerHit(run, t, atk * p.pow + 1);
      break;
    }
    case 'krieger1': {
      const ts = around(1);
      if (!ts.length) return noTarget();
      for (const t of ts) playerHit(run, t, atk * 1.5 * p.pow);
      run.fx.push({ k: 'shake', n: 3 });
      break;
    }
    case 'krieger2': p.st.stark = 7; say(run, 'Kriegsschrei!'); break;
    case 'magier0': {
      const t = nearestMob(run, 7);
      if (!t) return noTarget();
      run.fx.push({ k: 'bolt', x0: p.x, y0: p.y, x1: t.x, y1: t.y, col: '#ef7d57' }, { k: 'shake', n: 3 });
      for (let y = t.y - 1; y <= t.y + 1; y++) for (let x = t.x - 1; x <= t.x + 1; x++) ignite(run, x, y, 2);
      for (const m of run.mobs.filter(m => cheb(m, t) <= 1)) {
        m.st.brand = 2;
        damage(run, m, (m === t ? 6 + p.lvl * 0.5 : 3) * p.pow - m.def, '#ef7d57');
      }
      break;
    }
    case 'magier1': {
      const ts = around(2);
      if (!ts.length) return noTarget();
      for (const i of [...run.fire.keys()]) if (cheb({ x: i % W, y: (i / W) | 0 }, p) <= 2) run.fire.delete(i);
      for (const t of ts) { stun(run, t, 2); delete t.st.brand; damage(run, t, 3 * p.pow, '#73eff7'); }
      break;
    }
    case 'magier2': {
      let best: [number, number] | null = null, bs = -1;
      for (let y = p.y - 6; y <= p.y + 6; y++) for (let x = p.x - 6; x <= p.x + 6; x++) {
        if (!isFree(run, x, y) || !run.vis[y * W + x]) continue;
        let s = cheb({ x, y }, p) * 0.1;
        let near = 99;
        for (const m of run.mobs) if (run.vis[m.y * W + m.x]) near = Math.min(near, cheb(m, { x, y }));
        s += near === 99 ? cheb({ x, y }, p) : near;
        if (s > bs) { bs = s; best = [x, y]; }
      }
      if (!best) return noTarget();
      [p.x, p.y] = best;
      break;
    }
    case 'waldlaeufer0': {
      const t = nearestMob(run, 8);
      if (!t) return noTarget();
      run.fx.push({ k: 'bolt', x0: p.x, y0: p.y, x1: t.x, y1: t.y, col: '#ffcd75' });
      playerHit(run, t, atk * 2.2 * p.pow);
      break;
    }
    case 'waldlaeufer1': {
      if (run.traps.some(t => t.x === p.x && t.y === p.y)) { say(run, 'Hier liegt schon eine Falle.'); return false; }
      run.traps.push({ x: p.x, y: p.y });
      break;
    }
    case 'waldlaeufer2': {
      let moved = 0;
      for (let k = 0; k < 2; k++) {
        const nx = p.x + p.dir[0], ny = p.y + p.dir[1];
        if (!isFree(run, nx, ny)) break;
        p.x = nx; p.y = ny; moved++;
      }
      if (!moved) { say(run, 'Kein Platz zum Rollen.'); return false; }
      p.st.dodge = 1;
      break;
    }
  }
  p.res -= cost;
  return true;
}

export function act(run: Run, a: Action): void {
  const p = run.p;
  if (run.mode === 'perk') {
    if (a.t === 'perk' && run.perkChoices[a.i]) {
      applyPerk(run, run.perkChoices[a.i]);
      run.mode = 'play';
      checkLevel(run);
    }
    return;
  }
  if (run.mode !== 'play') return;
  let used = false;
  switch (a.t) {
    case 'move': {
      const nx = p.x + a.dx, ny = p.y + a.dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) break;
      p.dir = [a.dx, a.dy];
      const i = ny * W + nx, t = run.tiles[i], m = mobAt(run, nx, ny);
      if (m) {
        run.fx.push({ k: 'lunge', id: 0, dx: a.dx, dy: a.dy });
        playerHit(run, m, playerAtk(p) * (CLASSES[p.cls].range ? 0.6 : 1));
        if (p.cls === 'krieger') gain(p, 2);
        used = true;
      } else if (t === T.CHEST) { openChest(run, i); used = true; }
      else if (t === T.CRACKED) {
        const n = (run.cracks.get(i) ?? 0) + 1;
        run.fx.push({ k: 'lunge', id: 0, dx: a.dx, dy: a.dy }, { k: 'shake', n: 2 });
        if (n >= 3) breakWall(run, i); else { run.cracks.set(i, n); say(run, n === 1 ? 'Die Wand ist rissig – sie gibt nach.' : 'Noch ein Schlag ...'); }
        used = true;
      } else if (t === T.CRATE || t === T.CRATE_ON) {
        const bx = nx + a.dx, by = ny + a.dy, bi = by * W + bx, bt = run.tiles[bi];
        if ((bt === T.FLOOR || bt === T.PLATE) && !mobAt(run, bx, by)) {
          run.tiles[bi] = bt === T.PLATE ? T.CRATE_ON : T.CRATE;
          run.tiles[i] = t === T.CRATE_ON ? T.PLATE : T.FLOOR;
          p.x = nx; p.y = ny; used = true;
          checkCrates(run);
        } else say(run, 'Die Kiste lässt sich so nicht schieben.');
      } else if (t === T.LEVER) { resetCrates(run); used = true; }
      else if (t === T.TABLET) {
        const z = run.puzzle;
        say(run, z ? `Die Tafel zeigt: ${z.order.map(k => RUNE_NAMES[k]).join(' – ')}` : 'Die Tafel ist verwittert.');
      } else if (t === T.ICE) {
        const kind = (x: number, y: number) => {
          const tt = run.tiles[y * W + x];
          if (mobAt(run, x, y)) return 'block' as const;
          return tt === T.ICE ? 'ice' as const : walkable(tt) ? 'floor' as const : 'block' as const;
        };
        [p.x, p.y] = slide(kind, p.x, p.y, a.dx, a.dy);
        used = true;
        afterStep(run);
      } else if (t === T.BARREL) {
        if (!run.fuses.has(i)) { run.fuses.set(i, 2); say(run, 'Die Lunte brennt – weg hier!'); }
        used = true;
      }
      else if (t === T.ALTAR) {
        const cost = Math.ceil(p.maxHp * 0.25);
        if (p.hp <= cost) say(run, 'Du bist zu schwach für das Opfer.');
        else {
          p.hp -= cost;
          run.tiles[i] = T.ALTAR_USED;
          say(run, `Der Altar nimmt ${cost} Leben und gewährt eine Gabe.`);
          offerPerks(run);
          used = true;
        }
      } else if (walkable(t)) {
        p.x = nx; p.y = ny; used = true;
        if (t === T.STAIRS) say(run, 'Eine Treppe nach unten. [E] zum Abstieg.');
        else if (t === T.FRAGILE) { run.tiles[i] = T.FRAGILE2; say(run, 'Der Boden knackt unter dir ...'); }
        else if (t === T.FRAGILE2) {
          say(run, 'Der Boden bricht ein!');
          nextFloor(run);
          damage(run, p, Math.ceil(p.maxHp * 0.15), '#b13e53');
          run.fx.push({ k: 'shake', n: 8 });
          used = false;
          fatal(run);
        } else afterStep(run);
      }
      break;
    }
    case 'wait':
      if (p.cls === 'waldlaeufer') gain(p, 1);
      used = true;
      break;
    case 'shoot': {
      const c = CLASSES[p.cls];
      if (!c.range) break;
      const t = nearestMob(run, c.range);
      if (!t) { say(run, 'Kein Ziel in Reichweite.'); break; }
      run.fx.push({ k: 'bolt', x0: p.x, y0: p.y, x1: t.x, y1: t.y, col: c.resCol });
      playerHit(run, t, playerAtk(p) * (p.cls === 'waldlaeufer' ? 0.75 : 1));
      used = true;
      break;
    }
    case 'potion':
      if (p.potions <= 0) say(run, 'Keine Heiltränke mehr.');
      else if (p.hp >= p.maxHp) say(run, 'Du bist bereits bei voller Gesundheit.');
      else {
        p.potions--;
        const n = has(p, 'seelenkelch') ? p.maxHp : Math.ceil(p.maxHp * 0.45);
        p.hp = Math.min(p.maxHp, p.hp + n);
        delete p.st.gift; delete p.st.brand;
        run.fx.push({ k: 'num', x: p.x, y: p.y, s: `+${n}`, col: '#a7f070' });
        used = true;
      }
      break;
    case 'bomb': {
      if (p.bombs <= 0) { say(run, 'Keine Bomben mehr.'); break; }
      // Ziel: Hindernis in Blickrichtung, sonst nächster Gegner, sonst drei Felder voraus
      let tx = p.x, ty = p.y, found = false;
      for (let k = 1; k <= 3; k++) {
        const x = p.x + p.dir[0] * k, y = p.y + p.dir[1] * k, t = run.tiles[y * W + x];
        if (t === T.CRACKED || t === T.PILLAR || t === T.BARREL) { tx = x; ty = y; found = true; break; }
        if (opaque(t) || t === undefined) break;
        tx = x; ty = y;
      }
      const m = found ? undefined : nearestMob(run, 5);
      if (m) { tx = m.x; ty = m.y; }
      p.bombs--;
      run.fx.push({ k: 'bolt', x0: p.x, y0: p.y, x1: tx, y1: ty, col: '#1a1c2c' });
      explode(run, tx, ty, 1);
      used = true;
      break;
    }
    case 'descend':
      if (run.tiles[p.y * W + p.x] === T.STAIRS) nextFloor(run);
      break;
    case 'skill':
      used = useSkill(run, a.i);
      break;
  }
  if (used) endTurn(run);
}

// ---------- Gegnerzug ----------

function hitPlayer(run: Run, m: Actor, melee: boolean) {
  const p = run.p, d = MOBS[m.kind];
  if (melee) run.fx.push({ k: 'lunge', id: m.id, dx: Math.sign(p.x - m.x), dy: Math.sign(p.y - m.y) });
  if (p.st.dodge) { run.fx.push({ k: 'num', x: p.x, y: p.y, s: 'verfehlt', col: '#94b0c2' }); return; }
  damage(run, p, Math.max(Math.ceil(m.atk * 0.3), m.atk - p.def) - (has(p, 'steinhaut') ? 1 : 0), '#b13e53');
  run.fx.push({ k: 'shake', n: m.boss ? 5 : 2 });
  if (p.cls === 'krieger') gain(p, 1);
  if (d.poison && run.rng.chance(0.5)) p.st.gift = 4;
  if (d.burn && run.rng.chance(0.5)) p.st.brand = 3;
  if (melee && p.thorns) damage(run, m, p.thorns, '#a7f070');
}

function moveMob(run: Run, m: Actor, x: number, y: number) {
  m.x = x; m.y = y;
  const ti = run.traps.findIndex(t => t.x === x && t.y === y);
  if (ti >= 0) {
    run.traps.splice(ti, 1);
    stun(run, m, 2);
    say(run, `${m.name} tritt in die Falle!`);
    damage(run, m, 8 * run.p.pow + run.p.lvl, '#ffcd75');
  }
}

function mobAct(run: Run, m: Actor, dist: Int16Array) {
  const p = run.p, d = MOBS[m.kind];
  if (!m.awake) { if (run.vis[m.y * W + m.x]) m.awake = true; return; }
  if (d.ai === 'slow' && run.turn % 2) return;
  const man = Math.abs(p.x - m.x) + Math.abs(p.y - m.y);
  if (d.ai === 'boss' && ++m.cd >= 5) {
    m.cd = 0;
    const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oy]) => [m.x + ox, m.y + oy]).filter(([x, y]) => isFree(run, x, y));
    if (spots.length && run.mobs.length < 6) {
      const [x, y] = run.rng.pick(spots);
      spawnMob(run, d.minion!, x, y).awake = true;
      say(run, `${m.name} ruft Verstärkung!`);
      return;
    }
  }
  if (man === 1) { hitPlayer(run, m, true); return; }
  if (d.range && cheb(m, p) <= d.range && los(run.tiles, m.x, m.y, p.x, p.y)) {
    run.fx.push({ k: 'bolt', x0: m.x, y0: m.y, x1: p.x, y1: p.y, col: '#f4f4f4' });
    hitPlayer(run, m, false);
    return;
  }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (d.ai === 'erratic' && run.rng.chance(0.35)) {
    const [ox, oy] = run.rng.pick(dirs);
    if (isFree(run, m.x + ox, m.y + oy)) moveMob(run, m, m.x + ox, m.y + oy);
    return;
  }
  let best: number[] | null = null, bd = dist[m.y * W + m.x];
  if (bd < 0) return;
  for (const [ox, oy] of dirs) {
    const x = m.x + ox, y = m.y + oy;
    if (!isFree(run, x, y)) continue;
    const v = dist[y * W + x];
    if (v >= 0 && v < bd) { bd = v; best = [x, y]; }
  }
  if (best) moveMob(run, m, best[0], best[1]);
  else if (d.smash) {
    // Schwere Gegner brechen rissige Wände auf dem Weg zum Spieler ein
    for (const [ox, oy] of dirs) {
      const i = (m.y + oy) * W + m.x + ox;
      if (run.tiles[i] === T.CRACKED && Math.abs(p.x - m.x - ox) + Math.abs(p.y - m.y - oy) < man) { breakWall(run, i); break; }
    }
  }
}

function tickDots(run: Run, a: Actor) {
  if (a.st.gift) { a.st.gift--; damage(run, a, 1, '#38b764'); }
  if (a.hp > 0 && a.st.brand) {
    a.st.brand--;
    if (a === run.p && has(run.p, 'glutherz')) {
      if (a.hp < a.maxHp) { a.hp++; run.fx.push({ k: 'num', x: a.x, y: a.y, s: '+1', col: '#a7f070' }); }
    } else damage(run, a, 2, '#ef7d57');
  }
}

function endTurn(run: Run) {
  const p = run.p;
  if (run.mode === 'win') return;
  run.turn++;
  tickWorld(run);
  if (run.fire.has(p.y * W + p.x)) p.st.brand = Math.max(p.st.brand ?? 0, 2);
  for (const m of run.mobs) if (run.fire.has(m.y * W + m.x)) m.st.brand = Math.max(m.st.brand ?? 0, 2);
  tickDots(run, p);
  if (p.cls === 'magier' && run.turn % 3 === 0) gain(p, 1);
  const dist = distMap(run.tiles, p.x, p.y);
  computeFov(run.tiles, p.x, p.y, fovR(run), run.vis, run.seen);
  for (const m of [...run.mobs]) {
    if (m.hp <= 0) continue;
    tickDots(run, m);
    if (m.hp <= 0) continue;
    if (m.st.stun) { if (--m.st.stun === 0) m.st.immun = 3; continue; }
    if (m.st.immun) m.st.immun--;
    if (has(p, 'zeitsand') && run.rng.chance(0.12)) continue;
    mobAct(run, m, dist);
    if (p.hp <= 0) break;
  }
  if (p.st.stark) p.st.stark--;
  if (p.st.dodge) p.st.dodge--;
  fatal(run);
}
