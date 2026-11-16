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
  // Ganzzahliger Maßstab, wenn er das Fenster fast füllt – sonst stufenlos
  const fit = Math.min(innerWidth / VW, innerHeight / VH), int = Math.floor(fit);
  const s = int >= 1 && int / fit >= 0.85 ? int : fit;
  cv.style.width = `${Math.floor(VW * s)}px`; cv.style.height = `${Math.floor(VH * s)}px`;
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
  if (k === 'v') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => { /* nicht erlaubt */ });
    return true;
  }
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

const embers = Array.from({ length: 70 }, () => ({ x: Math.random() * VW, y: Math.random() * VH, v: 8 + Math.random() * 22, p: Math.random() * 6 }));

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
  text(ctx, 'GLUTGRUFT', VW / 2 + 2, 82, '#b13e53', 44, 'center', false);
  text(ctx, 'GLUTGRUFT', VW / 2, 80, '#ffcd75', 44, 'center', false);
  text(ctx, 'Ein Abstieg in fünfzehn Ebenen', VW / 2, 134, '#94b0c2', 10, 'center');
  CLASS_ORDER.forEach((c, i) => {
    const f = Math.floor(time * 2.5 + i * 0.4) % 2 ? c + '_b' : c;
    ctx.drawImage(sprites[f], VW / 2 - 128 + i * 96, 172, 64, 64);
  });
  if (Math.floor(time * 2) % 2) text(ctx, '[LEERTASTE] Start', VW / 2, 270, '#f4f4f4', 10, 'center');
  text(ctx, 'Pfeile/WASD bewegen · Leertaste warten · 1-3 Fähigkeiten · F schießen · Q Trank · E Treppe', VW / 2, 322, '#566c86', 8, 'center');
  text(ctx, 'V: Vollbild', VW / 2, 336, '#566c86', 8, 'center');
}

function drawLager(time: number, dt: number) {
  backdrop(time, dt);
  text(ctx, 'LAGER', 24, 16, '#ffcd75', 24);
  const sw = text(ctx, `${meta.souls} Seelensplitter`, VW - 24, 20, '#73eff7', 10, 'right');
  ctx.drawImage(sprites.soul, VW - 40 - sw, 17);
  if (meta.best) text(ctx, meta.best > LAST_FLOOR ? 'Gruft bezwungen' : `Tiefste Ebene: ${meta.best}`, VW - 24, 34, '#94b0c2', 8, 'right');

  const id = CLASS_ORDER[clsIdx], c = CLASSES[id], lock = locked();
  panel(ctx, 24, 56, 286, 256, row === 0 ? '#ffcd75' : '#566c86');
  ctx.globalAlpha = lock ? 0.35 : 1;
  ctx.drawImage(sprites[Math.floor(time * 2.5) % 2 ? id + '_b' : id], 36, 66, 96, 96);
  ctx.globalAlpha = 1;
  text(ctx, `< ${c.name} >`, 146, 74, '#ffcd75', 16);
  text(ctx, `Leben ${c.hp + 3 * meta.upg.vit}`, 146, 100, '#b13e53', 8);
  text(ctx, `Angriff ${c.atk + meta.upg.atk}   Verteidigung ${c.def}`, 146, 112, '#94b0c2', 8);
  text(ctx, `${c.resName} ${c.resMax}`, 146, 124, c.resCol, 8);
  if (c.range) text(ctx, `Fernkampf ${c.range} Felder`, 146, 136, '#94b0c2', 8);
  wrap(c.desc, 44).forEach((l, i) => text(ctx, l, 36, 174 + i * 11, '#f4f4f4', 8));
  c.skills.forEach((s, i) => {
    const y = 208 + i * 32;
    panel(ctx, 36, y, 22, 22, '#566c86');
    ctx.drawImage(sprites[`i_${id}${i}`], 41, y + 5);
    text(ctx, `${i + 1}  ${s.name}`, 66, y + 2, '#ffcd75', 8);
    text(ctx, s.desc, 66, y + 13, '#94b0c2', 8);
    text(ctx, `${s.cost} ${c.resName}`, 298, y + 2, c.resCol, 8, 'right');
  });
  if (lock) {
    panel(ctx, 60, 96, 214, 36, '#b13e53', 'rgba(13,14,23,0.95)');
    text(ctx, 'GESPERRT', 167, 102, '#b13e53', 10, 'center');
    text(ctx, `[ENTER] freischalten: ${RANGER_COST} Splitter`, 167, 116, '#f4f4f4', 8, 'center');
  }

  const ux = 330, uw = VW - ux - 24;
  text(ctx, 'VERBESSERUNGEN', ux + 2, 58, '#94b0c2', 8);
  UPGRADES.forEach((u, i) => {
    const y = 72 + i * 46, sel = row === i + 1, lvl = meta.upg[u.id], max = lvl >= u.max;
    panel(ctx, ux, y, uw, 40, sel ? '#ffcd75' : '#566c86');
    text(ctx, u.name, ux + 10, y + 8, sel ? '#ffcd75' : '#f4f4f4', 10);
    text(ctx, u.desc, ux + 10, y + 23, '#94b0c2', 8);
    for (let k = 0; k < u.max; k++) { ctx.fillStyle = k < lvl ? '#73eff7' : '#333c57'; ctx.fillRect(ux + 150 + k * 10, y + 9, 7, 7); }
    text(ctx, max ? 'MAX' : `${upgCost(u, lvl)}`, ux + uw - 10, y + 8, max ? '#566c86' : meta.souls >= upgCost(u, lvl) ? '#73eff7' : '#b13e53', 10, 'right');
  });
  const sy = 72 + UPGRADES.length * 46 + 10, sel = row === ROWS - 1;
  panel(ctx, ux, sy, uw, 36, sel ? '#ffcd75' : '#566c86', sel ? 'rgba(177,62,83,0.5)' : 'rgba(13,14,23,0.88)');
  text(ctx, 'ABSTIEG BEGINNEN', ux + uw / 2, sy + 11, sel ? '#ffcd75' : '#f4f4f4', 16, 'center');

  if (noteT > 0) { noteT -= dt; text(ctx, note, ux + uw / 2, sy + 46, '#ffcd75', 8, 'center'); }
  text(ctx, 'Pfeile: wählen · ENTER: kaufen/bestätigen · LEERTASTE: Abstieg · V: Vollbild', VW / 2, 336, '#566c86', 8, 'center');
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
(window as unknown as { __g: unknown }).__g = { get run() { return run; }, get scene() { return scene; }, meta, sprites };
