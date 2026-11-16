// Einfacher Autospieler für Balance- und Stabilitätsläufe.
import { W, H, T, walkable } from '../src/game/dungeon';
import { Run, Action, act, playerAtk, itemScore } from '../src/game/run';
import { CLASSES, MOBS } from '../src/game/content';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Breitensuche vom Spieler; liefert den ersten Schritt zum nächsten Feld, das `goal` erfüllt.
function stepTo(run: Run, goal: (x: number, y: number, i: number) => boolean, avoidFire = true): [number, number] | null {
  const p = run.p, start = p.y * W + p.x;
  const from = new Int32Array(W * H).fill(-1);
  const q = [start];
  from[start] = start;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % W, cy = (c / W) | 0;
    if (c !== start && goal(cx, cy, c)) {
      let n = c;
      while (from[n] !== start) n = from[n];
      return [(n % W) - p.x, ((n / W) | 0) - p.y];
    }
    for (const [ox, oy] of DIRS) {
      const nx = cx + ox, ny = cy + oy, n = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || from[n] !== -1) continue;
      const t = run.tiles[n];
      const passable = walkable(t) && t !== T.FRAGILE2 && !(avoidFire && run.fire.has(n));
      // Ziele dürfen auch nicht begehbar sein (Gegner, Truhen)
      if (!passable || run.mobs.some(m => m.x === nx && m.y === ny && run.vis[n])) { if (goal(nx, ny, n) && from[n] === -1) { from[n] = c; q.push(n); } continue; }
      from[n] = c;
      q.push(n);
    }
  }
  return null;
}

const shopped = new Set<number>();
const trail: number[] = [];
let visitFloor = 0, wander = 0;

export function botAction(run: Run): Action {
  if (run.mode === 'shop') shopped.add(run.floor);
  if (run.turn === 0) shopped.clear();
  if (run.turn === 0 || visitFloor !== run.floor) { trail.length = 0; wander = 0; visitFloor = run.floor; }
  if (wander > 0 && run.mode === 'play') { wander--; const d = DIRS[(wander * 7 + run.turn) % 4]; return { t: 'move', dx: d[0], dy: d[1] }; }
  const a = decide(run);
  // Gegen Pendeln: wechselt der Bot nur noch zwischen zwei Feldern, läuft er kurz ziellos
  if (a.t === 'move' && run.mode === 'play') {
    trail.push(run.p.y * W + run.p.x);
    if (trail.length > 14) trail.shift();
    if (trail.length === 14 && new Set(trail).size <= 2) { trail.length = 0; wander = 8; }
  } else trail.length = 0;
  return a;
}

function decide(run: Run): Action {
  if (run.mode === 'play' && run.p.bag.length) {
    // Rucksack: Besseres anlegen, den Rest verkaufen
    const i = run.p.bag.findIndex(it => itemScore(it) > itemScore(run.p.gear[it.slot]!));
    return i >= 0 ? { t: 'equip', i } : { t: 'sell', i: 0 };
  }
  const p = run.p, c = CLASSES[p.cls];
  if (run.mode === 'perk') return { t: 'perk', i: 0 };
  if (run.mode === 'shop') {
    const i = run.shop.findIndex(o => !o.sold && o.price <= p.gold && (o.kind !== 'bomb'));
    return i >= 0 ? { t: 'buy', i } : { t: 'leave' };
  }
  if (p.hp < p.maxHp * 0.4 && p.potions > 0) return { t: 'potion' };
  const dist = (m: { x: number; y: number }) => Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y));
  // weit entfernte Gegner ignoriert der Bot zunächst und erkundet weiter
  const vis = run.mobs.filter(m => run.vis[m.y * W + m.x] && dist(m) <= 7);
  if (vis.length) {
    const near = vis.reduce((a, b) => (dist(a) <= dist(b) ? a : b));
    const d = dist(near), adj = Math.abs(near.x - p.x) + Math.abs(near.y - p.y) === 1;
    const can = (i: number) => p.res >= c.skills[i].cost;
    if (p.cls === 'krieger') {
      if (d <= 1 && vis.filter(m => dist(m) <= 1).length >= 2 && can(1)) return { t: 'skill', i: 1 };
      if (d <= 1 && can(0) && !near.st.stun && near.hp > playerAtk(p)) return { t: 'skill', i: 0 };
      if (adj) return { t: 'move', dx: near.x - p.x, dy: near.y - p.y };
    } else if (p.cls === 'magier') {
      if (d <= 2 && can(1) && !near.st.stun) return { t: 'skill', i: 1 };
      if (d <= 7 && d >= 2 && can(0)) return { t: 'skill', i: 0 };
      if (d <= 1 && can(2) && !near.st.stun) return { t: 'skill', i: 2 };
      if (d <= c.range) return { t: 'shoot' };
    } else {
      if (d <= 8 && can(0)) return { t: 'skill', i: 0 };
      if (d <= c.range) return { t: 'shoot' };
    }
    if (p.bombs > 0 && d >= 2 && d <= 5 && (near.boss || vis.length >= 3)) return { t: 'bomb' };
    const s = stepTo(run, (x, y) => x === near.x && y === near.y);
    if (s) return { t: 'move', dx: s[0], dy: s[1] };
    return { t: 'wait' };
  }
  if (run.tiles[p.y * W + p.x] === T.STAIRS) return { t: 'descend' };
  // Truhen mitnehmen, dann Treppe, sonst erkunden
  const s =
    stepTo(run, (_x, _y, i) => run.seen[i] === 1 && (run.tiles[i] === T.CHEST || (run.tiles[i] === T.TRADER && p.gold >= 25 && !shopped.has(run.floor)))) ??
    stepTo(run, (_x, _y, i) => run.seen[i] === 1 && run.tiles[i] === T.STAIRS) ??
    stepTo(run, (_x, _y, i) => walkable(run.tiles[i]) && !run.seen[i]) ??
    stepTo(run, (_x, _y, i) => run.mobs.some(m => m.y * W + m.x === i), false);
  return s ? { t: 'move', dx: s[0], dy: s[1] } : { t: 'wait' };
}

export function botRun(run: Run, maxActions = 12000): Run {
  for (let i = 0; i < maxActions && run.mode !== 'dead' && run.mode !== 'win'; i++) act(run, botAction(run));
  return run;
}

void MOBS;
