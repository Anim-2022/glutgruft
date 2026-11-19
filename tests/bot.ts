// Einfacher Autospieler für Balance- und Stabilitätsläufe.
import { W, H, T, walkable } from '../src/game/dungeon';
import { hunterWarn } from '../src/game/run';
import { Run, Action, act, playerAtk, itemScore, availableNodes, maxTraps, skillReady, skillCost, lineFrom, forgeTarget } from '../src/game/run';
import { CLASSES, MOBS } from '../src/game/content';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Breitensuche vom Spieler; liefert den ersten Schritt zum nächsten Feld, das `goal` erfüllt.
// Entdeckte Fallen meidet der Bot, solange es einen anderen Weg gibt – sonst geht er darüber.
function stepTo(run: Run, goal: (x: number, y: number, i: number) => boolean, avoidFire = true, brittle = false): [number, number] | null {
  const known = run.hazards.some(h => h.seen) ? new Set(run.hazards.filter(h => h.seen).map(h => h.y * W + h.x)) : null;
  return (known && search(run, goal, avoidFire, brittle, known)) || search(run, goal, avoidFire, brittle, null);
}

function search(run: Run, goal: (x: number, y: number, i: number) => boolean, avoidFire: boolean, brittle: boolean, knownTraps: Set<number> | null): [number, number] | null {
  const p = run.p, start = p.y * W + p.x;
  const from = new Int32Array(W * H).fill(-1);
  const hw = run.hunt ? hunterWarn(run) : [];
  const warned = run.warn?.length || hw.length ? new Set([...(run.warn ?? []), ...hw]) : null;
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
      const passable = walkable(t) && (brittle || t !== T.FRAGILE2) && !(avoidFire && (run.fire.has(n) || warned?.has(n))) && !(knownTraps && knownTraps.has(n));
      // Ziele dürfen auch nicht begehbar sein (Gegner, Truhen)
      if (!passable || run.mobs.some(m => m.x === nx && m.y === ny && run.vis[n])) { if (goal(nx, ny, n) && from[n] === -1) { from[n] = c; q.push(n); } continue; }
      from[n] = c;
      q.push(n);
    }
  }
  return null;
}

// Wahl im Fertigkeitsbaum: BUILD=heur (Zweig nach Seed, erst in die Tiefe) oder BUILD=random
// BUILD=feuer|eis|arkan (Magier), schild|klinge|schlachtruf (Krieger), scharf|fallen|pirscher (Waldläufer): fester Zweig
export type Build = 'heur' | 'random' | 'feuer' | 'eis' | 'arkan' | 'schild' | 'klinge' | 'schlachtruf' | 'scharf' | 'fallen' | 'pirscher';
const FORCED: Record<string, [string, number]> = { feuer: ['magier', 0], eis: ['magier', 1], arkan: ['magier', 2], schild: ['krieger', 0], klinge: ['krieger', 1], schlachtruf: ['krieger', 2], scharf: ['waldlaeufer', 0], fallen: ['waldlaeufer', 1], pirscher: ['waldlaeufer', 2] };
const envBuild = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BUILD ?? 'heur';
let build: Build = (envBuild in FORCED || envBuild === 'random' ? envBuild : 'heur') as Build;
export const setBuild = (b: Build) => { build = b; };
const TIER_ORDER = (ab: string) => ['1', '3', `4${ab}`, '5', '2a', '2b'];

export function pickNode(run: Run): string {
  const av = availableNodes(run);
  if (build === 'random') {
    // eigener Zufall, damit der Zufall des Laufs unberührt bleibt
    const h = (Math.imul(run.seed, 73856093) ^ Math.imul(run.p.lvl, 19349663) ^ Math.imul(run.p.tree.length + 1, 83492791)) >>> 0;
    return av[h % av.length];
  }
  const focus = build in FORCED && run.p.cls === FORCED[build][0] ? FORCED[build][1] : run.seed % 3, ab = Math.floor(run.seed / 3) % 2 ? 'b' : 'a';
  for (let k = 0; k < 3; k++) for (const t of TIER_ORDER(ab)) { const id = `n${(focus + k) % 3}_${t}`; if (av.includes(id)) return id; }
  return av[0];
}

const shopped = new Set<number>();
const trail: number[] = [];
let visitFloor = 0, wander = 0, loops = 0;
// fehlgeschlagene neue Fähigkeit (kein Ziel, kein Weg): in diesem Zug nicht noch einmal
let failTurn = -1, failSkill = -1, lastTurn = -1, lastSkill = -1;

export function botAction(run: Run): Action {
  if (run.mode === 'shop') shopped.add(run.floor);
  if (run.turn === 0) shopped.clear();
  if (run.turn === 0 || visitFloor !== run.floor) { trail.length = 0; wander = 0; loops = 0; visitFloor = run.floor; }
  if (wander > 0 && run.mode === 'play') {
    wander--; const d = DIRS[(wander * 7 + run.turn) % 4];
    const danger = [...(run.warn ?? []), ...(run.hunt ? hunterWarn(run) : [])];
    if (!danger.length) return { t: 'move', dx: d[0], dy: d[1] };
    wander = 0; // bei roten Feldern nicht ziellos laufen
  }
  if (lastSkill >= 0 && run.turn === lastTurn) { failTurn = run.turn; failSkill = lastSkill; }
  const a = decide(run);
  lastTurn = run.turn; lastSkill = a.t === 'skill' && a.i >= 3 ? a.i : -1;
  // Gegen Pendeln: wechselt der Bot nur noch zwischen zwei Feldern, läuft er kurz ziellos
  if (a.t === 'move' && run.mode === 'play') {
    trail.push(run.p.y * W + run.p.x);
    if (trail.length > 14) trail.shift();
    if (trail.length === 14 && new Set(trail).size <= 4) { trail.length = 0; wander = 8 * ++loops; } // jede weitere Schleife auf derselben Ebene: länger umherlaufen
  } else trail.length = 0;
  return a;
}

function decide(run: Run): Action {
  if (run.mode === 'play' && run.p.bag.length) {
    // Rucksack: Besseres anlegen, den Rest verkaufen
    const held = (slot: number) => { const g = run.p.gear[slot]; return !!g?.cursed && g.lock === run.floor; };
    const i = run.p.bag.findIndex(it => it.slot < 4 && !held(it.slot) && itemScore(it) > itemScore(run.p.gear[it.slot]!));
    if (i >= 0) return { t: 'equip', i };
    const j = run.p.bag.findIndex(it => !it.use);
    if (j >= 0) return { t: 'sell', i: j };
  }
  const p = run.p, c = CLASSES[p.cls];
  if (run.mode === 'perk') return { t: 'perk', i: 0 };
  if (run.mode === 'tree') return { t: 'learn', id: pickNode(run) };
  if (run.mode === 'shop') {
    const i = run.shop.findIndex(o => !o.sold && o.price <= p.gold && o.kind !== 'bomb' && (o.kind !== 'forge' || !!forgeTarget(p)));
    return i >= 0 ? { t: 'buy', i } : { t: 'leave' };
  }
  // Ereignis: rot gewarnte Felder sofort verlassen
  const danger = [...(run.warn ?? []), ...(run.hunt ? hunterWarn(run) : [])];
  if (danger.includes(p.y * W + p.x)) {
    const foe = run.mobs.filter(m => m.awake && run.vis[m.y * W + m.x]).sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - Math.abs(b.x - p.x) - Math.abs(b.y - p.y))[0];
    const near = (dx: number, dy: number) => (foe ? Math.abs(foe.x - p.x - dx) + Math.abs(foe.y - p.y - dy) : 0) * (CLASSES[p.cls].range ? -1 : 1);
    for (const [dx, dy] of [...DIRS].sort((a, b) => near(a[0], a[1]) - near(b[0], b[1]))) {
      const x = p.x + dx, y = p.y + dy, i = y * W + x;
      if (walkable(run.tiles[i]) && !danger.includes(i) && !run.mobs.some(m => m.x === x && m.y === y)) return { t: 'move', dx, dy };
    }
  }
  if (p.hp < p.maxHp * 0.4 && p.potions > 0) return { t: 'potion' };
  const dist = (m: { x: number; y: number }) => Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y));
  // weit entfernte Gegner ignoriert der Bot zunächst und erkundet weiter
  const vis = run.mobs.filter(m => run.vis[m.y * W + m.x] && dist(m) <= 7);
  if (vis.length) {
    const near = vis.reduce((a, b) => (dist(a) <= dist(b) ? a : b));
    const d = dist(near), adj = Math.abs(near.x - p.x) + Math.abs(near.y - p.y) === 1;
    const can = (i: number) => p.res >= c.skills[i].cost;
    const carries = (id: string) => p.bag.some(it => it.use === id);
    if (near.boss && carries('kraft') && !p.st.stark) return { t: 'use', id: 'kraft' };
    if (p.res < 2 && carries('quell')) return { t: 'use', id: 'quell' };
    if (p.lvl >= 5 && !p.ultCd && (near.boss || vis.length >= 3) && d <= (p.cls === 'krieger' ? 2 : 7)) return { t: 'ult' };
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && walkable(run.tiles[y * W + x]) && !run.mobs.some(m => m.x === x && m.y === y);
    // ein Schritt weg vom Gegner (vierseitig), sonst null
    const away = (): [number, number] | null => {
      const sx = Math.sign(p.x - near.x), sy = Math.sign(p.y - near.y);
      for (const [dx, dy] of [[sx, 0], [0, sy], [0, sx ? 1 : 0], [0, sx ? -1 : 0], [sy ? 1 : 0, 0], [sy ? -1 : 0, 0]] as [number, number][]) {
        if ((dx || dy) && free(p.x + dx, p.y + dy) && Math.max(Math.abs(p.x + dx - near.x), Math.abs(p.y + dy - near.y)) >= d) return [dx, dy];
      }
      return null;
    };
    if (p.cls === 'krieger') {
      const node = (id: string) => p.tree.includes(id);
      // Blutzorn: mit Leben zahlen nur oberhalb von 40 % Leben
      const kc = (i: number) => p.res >= skillCost(p, i) || (node('n2_5') && skillReady(p, i) && p.hp - 2 * (skillCost(p, i) - p.res) > p.maxHp * 0.4);
      const kcan = (i: number) => (node('n2_5') ? kc(i) : can(i));
      const spell = (id: string) => { const k = (p.spells ?? []).indexOf(id); return k >= 0 && kc(3 + k) && !(failTurn === run.turn && failSkill === 3 + k) ? 3 + k : -1; };
      const ranged = vis.filter(m => m.awake && MOBS[m.kind].range && dist(m) <= 6);
      const adjN = vis.filter(m => dist(m) <= 1).length;
      // Kriegsschrei zu Beginn eines Kampfs gegen mehrere oder einen Boss
      if (!p.st.stark && kcan(2) && (vis.filter(m => dist(m) <= 3).length >= 2 || (near.boss && d <= 3))) return { t: 'skill', i: 2 };
      // Herausforderung: Schützen in Sicht, noch niemand direkt daneben
      const hf = spell('herausforderung');
      if (hf >= 0 && ranged.some(m => dist(m) <= 4) && adjN === 0 && !ranged.some(m => m.st.taunt)) return { t: 'skill', i: hf };
      // Schildwurf: Schütze auf 2–4 Feldern
      const sw = spell('schildwurf');
      if (sw >= 0) { const t = ranged.filter(m => dist(m) >= 2 && dist(m) <= 4 && !m.st.stun)[0]; if (t) { if (run.target !== t.id) return { t: 'target', x: t.x, y: t.y }; return { t: 'skill', i: sw }; } }
      // Sturmangriff: wacher Gegner auf 2–5 Feldern
      const sa = spell('sturmangriff');
      if (sa >= 0 && d >= 2 && d <= 5 && near.awake) return { t: 'skill', i: sa };
      // Vergelter: Schildstoß betäubt alle Nachbarn
      if (node('n0_5') && adjN >= 2 && kcan(0) && !near.st.stun) return { t: 'skill', i: 0 };
      if (d <= 1 && adjN >= 2 && kcan(1)) return { t: 'skill', i: 1 };
      if (d <= 1 && kcan(0) && !near.st.stun && near.hp > playerAtk(p)) return { t: 'skill', i: 0 };
      if (adj) return { t: 'move', dx: near.x - p.x, dy: near.y - p.y };
    } else if (p.cls === 'magier') {
      const ready = (i: number) => skillReady(p, i), node = (id: string) => p.tree.includes(id);
      const spell = (id: string) => { const k = (p.spells ?? []).indexOf(id); return k >= 0 && ready(3 + k) ? 3 + k : -1; };
      // Kryomant: betäubte Gegner zuerst angreifen
      if (node('n1_5')) {
        const st = vis.filter(m => m.st.stun && dist(m) <= 6).sort((a, b) => dist(a) - dist(b))[0];
        if (st && run.target !== st.id) return { t: 'target', x: st.x, y: st.y };
      }
      // Arkanschild: Gegner direkt daneben oder wenig Leben, Schild nicht aktiv
      const sh = spell('arkanschild');
      if (sh >= 0 && !p.shield && (d <= 1 || p.hp < p.maxHp * 0.6)) return { t: 'skill', i: sh };
      if (d <= 2 && ready(1) && !near.st.stun) return { t: 'skill', i: 1 };
      // Eislanze bevorzugt: betäubtes Ziel oder 2+ Gegner auf einer Linie
      const la = spell('eislanze');
      if (la >= 0) {
        const onLine = (m: typeof near) => lineFrom(run, m.x, m.y, 6).filter(([x, y]) => run.mobs.some(o => o.x === x && o.y === y)).length;
        const best = vis.filter(m => dist(m) <= 6 && (m.st.stun || onLine(m) >= 2)).sort((a, b) => (b.st.stun ? 1 : 0) - (a.st.stun ? 1 : 0) || onLine(b) - onLine(a) || dist(a) - dist(b))[0];
        if (best) { if (run.target !== best.id) return { t: 'target', x: best.x, y: best.y }; return { t: 'skill', i: la }; }
      }
      // Flammenwand: 2+ Gegner kommen heran, noch keiner direkt daneben
      const wa = spell('flammenwand');
      if (wa >= 0 && d >= 2 && vis.filter(m => m.awake && dist(m) <= 5).length >= 2) return { t: 'skill', i: wa };
      // Flächenbrand: erst anzünden, Brennende mit dem Funken erledigen
      if (node('n0_5') && near.st.brand && d <= c.range) return { t: 'shoot' };
      // Feuerball geht den übrigen neuen Zaubern vor
      if (d <= 7 && d >= 2 && ready(0)) return { t: 'skill', i: 0 };
      // Zeitriss: Blinzeln kostet keinen Zug – direkt danach angreifen
      if (d <= 1 && ready(2) && (!near.st.stun || node('n2_5'))) return { t: 'skill', i: 2 };
      if (la >= 0 && d <= 6) return { t: 'skill', i: la };
      if (d <= c.range) return { t: 'shoot' };
    } else {
      const node = (id: string) => p.tree.includes(id);
      const spell = (id: string) => { const k = (p.spells ?? []).indexOf(id); return k >= 0 && skillReady(p, 3 + k) && !(failTurn === run.turn && failSkill === 3 + k) ? 3 + k : -1; };
      const adjN = vis.filter(m => dist(m) <= 1).length, ranged = vis.filter(m => m.awake && MOBS[m.kind].range && dist(m) <= 6);
      // Rauchbombe: zwei Schützen oder bedrängt mit wenig Leben, noch kein Rauch
      const rb = spell('rauchbombe');
      if (rb >= 0 && !p.st.rauch && (ranged.length >= 2 || (adjN >= 1 && p.hp < p.maxHp * 0.5))) return { t: 'skill', i: rb };
      // Neue Fähigkeiten nur, wenn danach noch ein Zielschuss bezahlbar bleibt
      const spare = (i: number) => p.res - skillCost(p, i) >= skillCost(p, 0);
      // Fangnetz: zäher Nahkämpfer kommt auf 2–4 Felder heran
      const fn = spell('fangnetz');
      if (fn >= 0 && spare(fn)) { const t = vis.find(m => m.awake && !MOBS[m.kind].range && !m.st.netz && !m.st.stun && dist(m) >= 2 && dist(m) <= 4 && m.hp >= 2 * playerAtk(p)); if (t) { if (run.target !== t.id) return { t: 'target', x: t.x, y: t.y }; return { t: 'skill', i: fn }; } }
      // Markieren: Boss, Elite oder sehr zäher Gegner ohne Markierung
      const mk = spell('markieren');
      if (mk >= 0 && spare(mk) && !vis.some(m => m.st.mark)) { const t = vis.find(m => m.boss || m.elite || m.hp >= 5 * playerAtk(p)); if (t && dist(t) <= 7) { if (run.target !== t.id) return { t: 'target', x: t.x, y: t.y }; return { t: 'skill', i: mk }; } }
      // Anlegen: niemand daneben, Gegner noch fern – zielen statt schießen
      if (node('n0_5') && adjN === 0 && d >= 3 && (p.st.aim ?? 0) < 2) return { t: 'wait' };
      const onTrap = run.traps.some(t => t.x === p.x && t.y === p.y);
      // Ausweichrolle: Gegner direkt daneben, wenig Leben oder genug Fokus für Rolle und Zielschuss
      if (d <= 1 && can(2) && (p.hp < p.maxHp * 0.6 || p.res >= c.skills[2].cost + c.skills[0].cost)) {
        const fx = p.x + p.dir[0], fy = p.y + p.dir[1];
        if (Math.max(Math.abs(fx - near.x), Math.abs(fy - near.y)) > d && free(fx, fy)) return { t: 'skill', i: 2 };
        const st = away();
        if (st) return { t: 'move', dx: st[0], dy: st[1] }; // Blickrichtung weg vom Gegner, dann rollen
      }
      // Falle: ein wacher Gegner kommt in gerader Linie auf 2–4 Felder heran
      if (!onTrap && near.awake && d >= 2 && d <= 4 && (near.x === p.x || near.y === p.y) && run.traps.length < maxTraps(p) && skillReady(p, 1)) return { t: 'skill', i: 1 };
      // auf der eigenen Falle: einen Schritt zurück, damit der Gegner hineinläuft
      if (onTrap && near.awake && d >= 2 && d <= 3) { const st = away(); if (st) return { t: 'move', dx: st[0], dy: st[1] }; }
      if (d <= 8 && can(0)) return { t: 'skill', i: 0 };
      // Rückzugsgefecht: statt Schuss aus nächster Nähe wegtreten – der freie Schuss folgt
      if (node('n2_5') && adjN === 1 && d <= 1) { const st = away(); if (st) return { t: 'move', dx: st[0], dy: st[1] }; }
      if (d <= c.range) return { t: 'shoot' };
    }
    if (p.bombs > 0 && d >= 2 && d <= 5 && (near.boss || vis.length >= 3)) return { t: 'bomb' };
    const s = stepTo(run, (x, y) => x === near.x && y === near.y);
    if (s) return { t: 'move', dx: s[0], dy: s[1] };
    return { t: 'wait' };
  }
  if (run.tiles[p.y * W + p.x] === T.STAIRS) return { t: 'descend' };
  // Ereignisziel (Geist, leuchtende Truhe) steht auf der Karte – hinlaufen
  const marks = run.ev?.mark !== undefined ? [run.ev.mark] : run.ev?.marks ?? [];
  const toMark = marks.length ? stepTo(run, (_x, _y, i) => marks.includes(i)) : null;
  if (toMark) return { t: 'move', dx: toMark[0], dy: toMark[1] };
  // Truhen mitnehmen, dann Treppe, sonst erkunden
  const s =
    stepTo(run, (_x, _y, i) => run.seen[i] === 1 && (run.tiles[i] === T.CHEST || run.tiles[i] === T.MIMIC || (run.tiles[i] === T.TRADER && p.gold >= 25 && !shopped.has(run.floor)))) ??
    stepTo(run, (_x, _y, i) => run.seen[i] === 1 && run.tiles[i] === T.STAIRS) ??
    stepTo(run, (_x, _y, i) => walkable(run.tiles[i]) && !run.seen[i]) ??
    stepTo(run, (_x, _y, i) => run.mobs.some(m => m.y * W + m.x === i), false) ??
    // eingesperrt: dann eben durch den brüchigen Boden
    stepTo(run, (_x, _y, i) => run.tiles[i] === T.FRAGILE2, false, true);
  return s ? { t: 'move', dx: s[0], dy: s[1] } : { t: 'wait' };
}

export function botRun(run: Run, maxActions = 12000): Run {
  for (let i = 0; i < maxActions && run.mode !== 'dead' && run.mode !== 'win'; i++) act(run, botAction(run));
  return run;
}

void MOBS;
