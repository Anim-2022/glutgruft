import { RNG } from '../core/rng';
import type { Meta } from '../core/save';
import { W, H, T, Room, genDungeon, center, walkable, los, computeFov, distMap } from './dungeon';
import { CLASSES, ClassId, MOBS, PERKS, BOSS_BY_BIOME, BIOME_NAMES, FLOORS_PER_BIOME, LAST_FLOOR, biomeOf, spawnTable } from './content';

export interface Actor {
  id: number; kind: string; name: string;
  x: number; y: number; hp: number; maxHp: number; atk: number; def: number;
  st: Record<string, number>; // Statuseffekte -> verbleibende Züge
  xp: number; cd: number; awake: boolean; boss?: boolean;
}

export interface Player extends Actor {
  cls: ClassId; lvl: number; exp: number;
  res: number; resMax: number; potions: number;
  crit: number; pow: number; vamp: number; thorns: number; soulMul: number;
  dir: [number, number]; perks: string[];
}

export type Fx =
  | { k: 'num'; x: number; y: number; s: string; col: string }
  | { k: 'shake'; n: number }
  | { k: 'lunge'; id: number; dx: number; dy: number }
  | { k: 'flash'; id: number }
  | { k: 'die'; x: number; y: number; kind: string }
  | { k: 'bolt'; x0: number; y0: number; x1: number; y1: number; col: string };

export interface Run {
  seed: number; rng: RNG; floor: number;
  tiles: Uint8Array; seen: Uint8Array; vis: Uint8Array;
  p: Player; mobs: Actor[]; traps: { x: number; y: number }[];
  log: string[]; fx: Fx[];
  mode: 'play' | 'perk' | 'dead' | 'win';
  perkChoices: string[];
  souls: number; kills: number; turn: number; nextId: number;
}

export type Action =
  | { t: 'move'; dx: number; dy: number }
  | { t: 'wait' } | { t: 'shoot' } | { t: 'potion' } | { t: 'descend' }
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
    cls, lvl: 1, exp: 0, res: c.resStart, resMax: c.resMax, potions: 1 + meta.upg.trank,
    crit: 0.05, pow: 1, vamp: 0, thorns: 0, soulMul: 1, dir: [1, 0], perks: [],
  };
  const run: Run = {
    seed, rng: new RNG(seed), floor: 0,
    tiles: new Uint8Array(W * H), seen: new Uint8Array(W * H), vis: new Uint8Array(W * H),
    p, mobs: [], traps: [], log: [], fx: [], mode: 'play', perkChoices: [],
    souls: 0, kills: 0, turn: 0, nextId: 1,
  };
  nextFloor(run);
  return run;
}

function spawnMob(run: Run, kind: string, x: number, y: number): Actor {
  const d = MOBS[kind];
  const s = 1 + 0.12 * (run.floor - 1);
  const hp = d.boss ? d.hp : Math.round(d.hp * s);
  const m: Actor = {
    id: run.nextId++, kind, name: d.name, x, y, hp, maxHp: hp,
    atk: d.boss ? d.atk : d.atk + Math.floor(run.floor / 3), def: d.def,
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

function nextFloor(run: Run) {
  run.floor++;
  if (run.floor > 1) run.souls += Math.round(5 * run.p.soulMul);
  const { tiles, rooms } = genDungeon(run.rng);
  run.tiles = tiles;
  run.seen = new Uint8Array(W * H);
  run.mobs = [];
  run.traps = [];
  [run.p.x, run.p.y] = center(rooms[0]);
  const last = rooms[rooms.length - 1];
  const bossFloor = run.floor % FLOORS_PER_BIOME === 0;
  if (bossFloor) {
    const [bx, by] = center(last);
    spawnMob(run, BOSS_BY_BIOME[biomeOf(run.floor)], bx, by);
  } else {
    const [sx, sy] = center(last);
    run.tiles[sy * W + sx] = T.STAIRS;
  }
  const table = spawnTable(run.floor);
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    const n = (bossFloor && r === last) ? 0 : run.rng.int(1, 2) + (run.floor > 6 && run.rng.chance(0.5) ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const f = freeInRoom(run, r);
      if (f) spawnMob(run, run.rng.pick(table), f[0], f[1]);
    }
    // Truhen/Altäre nur in Ecken, damit sie keinen Durchgang versperren
    if (r.w >= 4 && r.h >= 3 && run.rng.chance(0.4)) {
      const cx = run.rng.chance(0.5) ? r.x : r.x + r.w - 1, cy = run.rng.chance(0.5) ? r.y : r.y + r.h - 1;
      if (cornerSafe(run, cx, cy)) run.tiles[cy * W + cx] = run.rng.chance(0.25) ? T.ALTAR : T.CHEST;
    }
  }
  computeFov(run.tiles, run.p.x, run.p.y, FOV_R, run.vis, run.seen);
  say(run, `Ebene ${run.floor} – ${BIOME_NAMES[biomeOf(run.floor)]}`);
  if (bossFloor) say(run, 'Etwas Mächtiges lauert hier ...');
}

// Eine Ecke ist sicher, wenn genau zwei ihrer vier Nachbarn Wände sind (kein Korridor mündet dort).
function cornerSafe(run: Run, x: number, y: number): boolean {
  if (run.tiles[y * W + x] !== T.FLOOR || !isFree(run, x, y)) return false;
  let walls = 0;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (run.tiles[(y + oy) * W + x + ox] === T.WALL) walls++;
  return walls === 2;
}

// ---------- Schaden ----------

function damage(run: Run, dst: Actor, amt: number, col = '#f4f4f4', crit = false) {
  amt = Math.max(1, Math.round(amt));
  dst.hp -= amt;
  run.fx.push({ k: 'flash', id: dst.id });
  run.fx.push({ k: 'num', x: dst.x, y: dst.y, s: crit ? `${amt}!` : `${amt}`, col: crit ? '#ffcd75' : col });
  if (dst !== run.p && dst.hp <= 0) kill(run, dst);
}

function playerHit(run: Run, dst: Actor, base: number) {
  const crit = run.rng.chance(run.p.crit);
  damage(run, dst, (crit ? base * 2 : base) - dst.def, '#f4f4f4', crit);
}

function kill(run: Run, m: Actor) {
  const p = run.p;
  run.mobs = run.mobs.filter(o => o !== m);
  run.fx.push({ k: 'die', x: m.x, y: m.y, kind: m.kind });
  run.kills++;
  p.exp += m.xp;
  run.souls += Math.max(1, Math.round((m.xp / 3) * p.soulMul));
  if (p.vamp) p.hp = Math.min(p.maxHp, p.hp + p.vamp);
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
  const p = run.p, r = run.rng.next();
  run.tiles[i] = T.CHEST_OPEN;
  if (r < 0.4) { p.potions++; say(run, 'Truhe: ein Heiltrank.'); }
  else if (r < 0.65) { p.atk++; say(run, 'Truhe: bessere Waffe (+1 Angriff).'); }
  else if (r < 0.85) { p.def++; say(run, 'Truhe: bessere Rüstung (+1 Verteidigung).'); }
  else { const n = Math.round(10 * p.soulMul); run.souls += n; say(run, `Truhe: ${n} Seelensplitter.`); }
}

function useSkill(run: Run, i: number): boolean {
  const p = run.p, sk = CLASSES[p.cls].skills[i];
  if (!sk) return false;
  if (p.res < sk.cost) { say(run, `Nicht genug ${CLASSES[p.cls].resName}.`); return false; }
  const atk = playerAtk(p);
  const around = (r: number) => run.mobs.filter(m => cheb(m, p) <= r && run.vis[m.y * W + m.x]);
  const noTarget = () => { say(run, 'Kein Ziel in Reichweite.'); return false; };
  switch (`${p.cls}${i}`) {
    case 'krieger0': {
      const t = nearestMob(run, 1);
      if (!t) return noTarget();
      t.st.stun = 2;
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
      for (const m of run.mobs.filter(m => cheb(m, t) <= 1)) {
        m.st.brand = 3;
        damage(run, m, (m === t ? 7 + p.lvl : 4) * p.pow - m.def, '#ef7d57');
      }
      break;
    }
    case 'magier1': {
      const ts = around(2);
      if (!ts.length) return noTarget();
      for (const t of ts) { t.st.stun = 3; damage(run, t, 3 * p.pow, '#73eff7'); }
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
      playerHit(run, t, atk * 2.5 * p.pow);
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
  p.res -= sk.cost;
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
      playerHit(run, t, playerAtk(p));
      if (p.cls === 'waldlaeufer') gain(p, 1);
      used = true;
      break;
    }
    case 'potion':
      if (p.potions <= 0) say(run, 'Keine Heiltränke mehr.');
      else if (p.hp >= p.maxHp) say(run, 'Du bist bereits bei voller Gesundheit.');
      else {
        p.potions--;
        const n = Math.ceil(p.maxHp * 0.45);
        p.hp = Math.min(p.maxHp, p.hp + n);
        delete p.st.gift; delete p.st.brand;
        run.fx.push({ k: 'num', x: p.x, y: p.y, s: `+${n}`, col: '#a7f070' });
        used = true;
      }
      break;
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
  damage(run, p, m.atk - p.def, '#b13e53');
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
    m.st.stun = 2;
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
}

function tickDots(run: Run, a: Actor) {
  if (a.st.gift) { a.st.gift--; damage(run, a, 1, '#38b764'); }
  if (a.hp > 0 && a.st.brand) { a.st.brand--; damage(run, a, 2, '#ef7d57'); }
}

function endTurn(run: Run) {
  const p = run.p;
  if (run.mode === 'win') return;
  run.turn++;
  tickDots(run, p);
  if (p.cls === 'magier') gain(p, 1);
  const dist = distMap(run.tiles, p.x, p.y);
  computeFov(run.tiles, p.x, p.y, FOV_R, run.vis, run.seen);
  for (const m of [...run.mobs]) {
    if (m.hp <= 0) continue;
    tickDots(run, m);
    if (m.hp <= 0) continue;
    if (m.st.stun) { m.st.stun--; continue; }
    mobAct(run, m, dist);
    if (p.hp <= 0) break;
  }
  if (p.st.stark) p.st.stark--;
  if (p.st.dodge) p.st.dodge--;
  if (p.hp <= 0) {
    p.hp = 0;
    run.mode = 'dead';
    say(run, 'Du bist gefallen.');
  }
}
