import { VW, VH, bake, sprites, text, panel, wrap } from './render/gfx';
import { drawRun, resetView } from './render/draw';
import { loadMeta, saveMeta } from './core/save';
import { newRun, act, Run, Action } from './game/run';
import { CLASSES, CLASS_ORDER, UPGRADES, RANGER_COST, upgCost, LAST_FLOOR } from './game/content';

const cv = document.getElementById('c') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
cv.width = VW; cv.height = VH;
ctx.imageSmoothingEnabled = false;

function resize() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / VW, innerHeight / VH)));
  cv.style.width = `${VW * s}px`; cv.style.height = `${VH * s}px`;
}
addEventListener('resize', resize);
resize();
bake();

let scene: 'title' | 'lager' | 'run' = 'title';
const meta = loadMeta();
let run: Run | null = null;
let row = 0, clsIdx = 0, note = '', noteT = 0;
const ROWS = 2 + UPGRADES.length; // Klasse, Upgrades..., Start

const MOVES: Record<string, [number, number]> = {
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
};

function flash(s: string) { note = s; noteT = 2; }
const locked = () => CLASS_ORDER[clsIdx] === 'waldlaeufer' && !meta.ranger;

function startRun() {
  if (locked()) { flash('Diese Klasse ist noch gesperrt.'); return; }
  resetView();
  run = newRun((Math.random() * 2 ** 31) | 0, CLASS_ORDER[clsIdx], meta);
  scene = 'run';
}

function endRun() {
  if (!run) return;
  meta.souls += run.souls;
  meta.best = Math.max(meta.best, run.mode === 'win' ? LAST_FLOOR + 1 : run.floor);
  saveMeta(meta);
  run = null;
  scene = 'lager';
  row = ROWS - 1;
}

function onKey(k: string): boolean {
  if (scene === 'title') {
    if (k === ' ' || k === 'enter') { scene = 'lager'; row = ROWS - 1; return true; }
    return false;
  }
  if (scene === 'lager') {
    const mv = MOVES[k];
    if (mv) {
      if (mv[1]) row = (row + mv[1] + ROWS) % ROWS;
      else if (row === 0) clsIdx = (clsIdx + mv[0] + CLASS_ORDER.length) % CLASS_ORDER.length;
      return true;
    }
    if (k === ' ') { startRun(); return true; }
    if (k === 'enter') {
      if (row === 0) {
        if (locked()) {
          if (meta.souls >= RANGER_COST) { meta.souls -= RANGER_COST; meta.ranger = true; saveMeta(meta); flash('Waldläufer freigeschaltet!'); }
          else flash('Nicht genug Seelensplitter.');
        }
      } else if (row === ROWS - 1) startRun();
      else {
        const u = UPGRADES[row - 1], lvl = meta.upg[u.id];
        if (lvl >= u.max) flash('Bereits auf höchster Stufe.');
        else if (meta.souls < upgCost(u, lvl)) flash('Nicht genug Seelensplitter.');
        else { meta.souls -= upgCost(u, lvl); meta.upg[u.id]++; saveMeta(meta); }
      }
      return true;
    }
    return false;
  }
  if (!run) return false;
  if (run.mode === 'dead' || run.mode === 'win') {
    if (k === ' ' || k === 'enter') { endRun(); return true; }
    return false;
  }
  let a: Action | null = null;
  if (run.mode === 'perk') { if (k >= '1' && k <= '3') a = { t: 'perk', i: +k - 1 }; }
  else if (MOVES[k]) a = { t: 'move', dx: MOVES[k][0], dy: MOVES[k][1] };
  else if (k === ' ' || k === '.') a = { t: 'wait' };
  else if (k === 'f') a = { t: 'shoot' };
  else if (k === 'q') a = { t: 'potion' };
  else if (k === 'e' || k === 'enter') a = { t: 'descend' };
  else if (k >= '1' && k <= '3') a = { t: 'skill', i: +k - 1 };
  if (!a) return false;
  act(run, a);
  return true;
}

addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (onKey(e.key.toLowerCase())) e.preventDefault();
});

// ---------- Szenen ----------

const embers = Array.from({ length: 40 }, () => ({ x: Math.random() * VW, y: Math.random() * VH, v: 8 + Math.random() * 22, p: Math.random() * 6 }));

function backdrop(time: number, dt: number) {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#0d0e17'); g.addColorStop(0.7, '#1c1424'); g.addColorStop(1, '#3d1c26');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  for (const e of embers) {
    e.y -= e.v * dt;
    if (e.y < -2) { e.y = VH + 2; e.x = Math.random() * VW; }
    ctx.fillStyle = Math.sin(time * 4 + e.p) > 0 ? '#ef7d57' : '#ffcd75';
    ctx.globalAlpha = Math.min(1, e.y / VH + 0.15);
    ctx.fillRect((e.x + Math.sin(time + e.p) * 6) | 0, e.y | 0, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawTitle(time: number, dt: number) {
  backdrop(time, dt);
  text(ctx, 'GLUTGRUFT', VW / 2 + 2, 58, '#b13e53', 44, 'center', false);
  text(ctx, 'GLUTGRUFT', VW / 2, 56, '#ffcd75', 44, 'center', false);
  text(ctx, 'Ein Abstieg in fünfzehn Ebenen', VW / 2, 108, '#94b0c2', 10, 'center');
  CLASS_ORDER.forEach((c, i) => {
    const bob = Math.floor(time * 2.5 + i * 0.4) % 2;
    ctx.drawImage(sprites[c], VW / 2 - 96 + i * 72, 140 - bob * 3, 48, 48);
  });
  if (Math.floor(time * 2) % 2) text(ctx, '[LEERTASTE] Start', VW / 2, 214, '#f4f4f4', 10, 'center');
  text(ctx, 'Pfeile/WASD bewegen · Leertaste warten · 1-3 Fähigkeiten · F schießen · Q Trank · E Treppe', VW / 2, 250, '#566c86', 8, 'center');
}

function drawLager(time: number, dt: number) {
  backdrop(time, dt);
  text(ctx, 'LAGER', 16, 10, '#ffcd75', 20);
  const sw = text(ctx, `${meta.souls} Seelensplitter`, VW - 12, 14, '#73eff7', 10, 'right');
  ctx.drawImage(sprites.soul, VW - 30 - sw, 9);
  if (meta.best) text(ctx, meta.best > LAST_FLOOR ? 'Gruft bezwungen' : `Tiefste Ebene: ${meta.best}`, VW - 12, 28, '#94b0c2', 8, 'right');

  const id = CLASS_ORDER[clsIdx], c = CLASSES[id], lock = locked();
  panel(ctx, 12, 42, 210, 188, row === 0 ? '#ffcd75' : '#566c86');
  const bob = Math.floor(time * 2.5) % 2;
  ctx.globalAlpha = lock ? 0.35 : 1;
  ctx.drawImage(sprites[id], 24, 52 - bob * 2, 64, 64);
  ctx.globalAlpha = 1;
  text(ctx, `< ${c.name} >`, 98, 54, '#ffcd75', 10);
  text(ctx, `Leben ${c.hp + 3 * meta.upg.vit}`, 98, 70, '#b13e53', 8);
  text(ctx, `Angriff ${c.atk + meta.upg.atk}   Verteid. ${c.def}`, 98, 81, '#94b0c2', 8);
  text(ctx, `${c.resName} ${c.resMax}`, 98, 92, c.resCol, 8);
  if (c.range) text(ctx, `Fernkampf ${c.range}`, 98, 103, '#94b0c2', 8);
  wrap(c.desc, 38).forEach((l, i) => text(ctx, l, 20, 124 + i * 10, '#f4f4f4', 8));
  c.skills.forEach((s, i) => {
    text(ctx, `${i + 1} ${s.name}`, 20, 158 + i * 22, '#ffcd75', 8);
    text(ctx, s.desc, 28, 168 + i * 22, '#94b0c2', 8);
  });
  if (lock) {
    panel(ctx, 30, 70, 174, 30, '#b13e53', 'rgba(13,14,23,0.95)');
    text(ctx, 'GESPERRT', 117, 74, '#b13e53', 10, 'center');
    text(ctx, `[ENTER] freischalten: ${RANGER_COST} Splitter`, 117, 87, '#f4f4f4', 8, 'center');
  }

  text(ctx, 'VERBESSERUNGEN', 236, 44, '#94b0c2', 8);
  UPGRADES.forEach((u, i) => {
    const y = 56 + i * 38, sel = row === i + 1, lvl = meta.upg[u.id], max = lvl >= u.max;
    panel(ctx, 234, y, 234, 33, sel ? '#ffcd75' : '#566c86');
    text(ctx, u.name, 242, y + 5, sel ? '#ffcd75' : '#f4f4f4', 10);
    text(ctx, u.desc, 242, y + 19, '#94b0c2', 8);
    for (let k = 0; k < u.max; k++) { ctx.fillStyle = k < lvl ? '#73eff7' : '#333c57'; ctx.fillRect(360 + k * 8, y + 8, 6, 6); }
    text(ctx, max ? 'MAX' : `${upgCost(u, lvl)}`, 460, y + 5, max ? '#566c86' : meta.souls >= upgCost(u, lvl) ? '#73eff7' : '#b13e53', 10, 'right');
  });
  const sy = 56 + UPGRADES.length * 38 + 8, sel = row === ROWS - 1;
  panel(ctx, 234, sy, 234, 30, sel ? '#ffcd75' : '#566c86', sel ? 'rgba(177,62,83,0.5)' : 'rgba(13,14,23,0.88)');
  text(ctx, 'ABSTIEG BEGINNEN', 351, sy + 9, sel ? '#ffcd75' : '#f4f4f4', 10, 'center');

  if (noteT > 0) { noteT -= dt; text(ctx, note, 351, sy + 38, '#ffcd75', 8, 'center'); }
  text(ctx, 'Pfeile: wählen · ENTER: kaufen/bestätigen · LEERTASTE: Abstieg', VW / 2, 252, '#566c86', 8, 'center');
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000), time = now / 1000;
  last = now;
  if (scene === 'title') drawTitle(time, dt);
  else if (scene === 'lager') drawLager(time, dt);
  else if (run) drawRun(ctx, run, dt, time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Für automatisierte Tests
(window as unknown as { __g: unknown }).__g = { get run() { return run; }, get scene() { return scene; }, meta };
