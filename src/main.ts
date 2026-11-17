import { drawIcon, UPG_ICON } from './render/icons';
import { VW, VH, bake, sprites, tilesets, text, panel, wrap, figure } from './render/gfx';
import { getLang, setLang } from './core/i18n';
import { drawRun, resetView, setMouse, toggleMap, setTutorial, tileAt, getOverlay, setOverlay, invMove, invAction, invDrop, lootIndex, lootDone } from './render/draw';
import { sfx, soundOn, toggleSound, wakeAudio } from './core/audio';
import { loadMeta, saveMeta } from './core/save';
import { W } from './game/dungeon';
import { newRun, act, serialize, deserialize, Run, Action } from './game/run';
import { CLASSES, CLASS_ORDER, UPGRADES, RANGER_COST, upgCost, LAST_FLOOR, USE_ORDER } from './game/content';

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
const ROWS = 3 + UPGRADES.length; // Klasse, Upgrades..., Tageslauf, Start
const RUN_KEY = 'glutgruft.lauf';
const today = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

// Ein unterbrochener Abstieg wird nach jedem Zug gesichert und im Lager wieder angeboten.
let saved: Run | null = null;
try { const raw = localStorage.getItem(RUN_KEY); if (raw) saved = deserialize(raw); } catch { /* kein Speicher */ }
function storeRun() {
  try {
    if (run && run.mode !== 'dead' && run.mode !== 'win') localStorage.setItem(RUN_KEY, serialize(run));
    else localStorage.removeItem(RUN_KEY);
  } catch { /* egal */ }
}

const MOVES: Record<string, [number, number]> = {
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
};

function flash(s: string) { note = s; noteT = 2; }
const locked = () => CLASS_ORDER[clsIdx] === 'waldlaeufer' && !meta.ranger;

function startRun(daily = false) {
  resetView();
  if (saved && !daily) { run = saved; saved = null; setTutorial(false); scene = 'run'; return; }
  if (locked()) { flash('Diese Klasse ist noch gesperrt.'); return; }
  saved = null;
  setTutorial(meta.best === 0);
  run = newRun(daily ? today() : (Math.random() * 2 ** 31) | 0, CLASS_ORDER[clsIdx], meta);
  run.daily = daily;
  scene = 'run';
  storeRun();
}

function endRun() {
  if (!run) return;
  meta.souls += run.souls;
  const depth = run.mode === 'win' ? LAST_FLOOR + 1 : run.floor;
  meta.best = Math.max(meta.best, depth);
  if (run.daily) meta.daily = { date: today(), best: Math.max(meta.daily.date === today() ? meta.daily.best : 0, depth) };
  saveMeta(meta);
  run = null;
  storeRun();
  scene = 'lager';
  row = ROWS - 1;
}

function onKey(k: string): boolean {
  wakeAudio();
  if (k === 'm') { flash(toggleSound() ? 'Ton an' : 'Ton aus'); return true; }
  if (k === 'n' && scene === 'run') { toggleMap(); return true; }
  if (scene === 'run' && run && run.mode === 'play') {
    // Charakterbogen und Hilfe halten das Spiel an
    if (getOverlay() === 'inv') {
      if (k === 'escape' || k === 'i') { setOverlay('none'); for (const it of run.p.bag) delete it.neu; }
      else if (MOVES[k]) invMove(run, MOVES[k][0], MOVES[k][1]);
      else if (k === 'enter' || k === 'x') { const a = invAction(run, k === 'x'); if (a) { act(run, a); sfx('pick'); storeRun(); } }
      else if (k === 'delete' || k === 'backspace') { const a = invDrop(run); if (a) { act(run, a); storeRun(); } }
      else if (k === 'o') act(run, { t: 'sort' });
      return true;
    }
    if (getOverlay() !== 'none') { if (k === 'escape' || k === 'c' || k === 'h' || k === 'j') setOverlay('none'); return true; }
    if (k === 'i') { setOverlay('inv'); return true; }
    if (k === 'r') { const i = lootIndex(run); if (i >= 0 && !run.p.bag[i].use) { act(run, { t: 'equip', i }); lootDone(); sfx('pick'); storeRun(); } return true; }
    if (k === 'c') { setOverlay('char'); return true; }
    if (k === 'h') { setOverlay('help'); return true; }
    if (k === 'j') { setOverlay('log'); return true; }
  }
  if (k === 'v') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => { /* nicht erlaubt */ });
    return true;
  }
  if (scene === 'title') {
    if (MOVES[k] && MOVES[k][1]) { tRow = (tRow + MOVES[k][1] + TITLE_ITEMS) % TITLE_ITEMS; return true; }
    if (k === ' ' || k === 'enter') { titleAction(); return true; }
    if (k === 'l') { setLang(getLang() === 'de' ? 'en' : 'de'); return true; }
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
    if (k === 'escape') { scene = 'title'; return true; }
    if (k === 'l') { setLang(getLang() === 'de' ? 'en' : 'de'); return true; }
    if (k === 'x' && saved) { meta.souls += saved.souls; saveMeta(meta); saved = null; run = null; storeRun(); flash('Lauf beendet – Splitter gutgeschrieben.'); return true; }
    if (k === 'enter') {
      if (row === 0) {
        if (locked()) {
          if (meta.souls >= RANGER_COST) { meta.souls -= RANGER_COST; meta.ranger = true; saveMeta(meta); flash('Waldläufer freigeschaltet!'); }
          else flash('Nicht genug Seelensplitter.');
        }
      } else if (row === ROWS - 1) startRun();
      else if (row === ROWS - 2) startRun(true);
      else {
        const u = UPGRADES[row - 1], lvl = meta.upg[u.id] ?? 0;
        if (lvl >= u.max) flash('Bereits auf höchster Stufe.');
        else if (meta.souls < upgCost(u, lvl)) flash('Nicht genug Seelensplitter.');
        else { meta.souls -= upgCost(u, lvl); meta.upg[u.id] = lvl + 1; saveMeta(meta); }
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
  if (run.mode === 'perk') { if (k >= '1' && k <= '4') a = { t: 'perk', i: +k - 1 }; }
  else if (run.mode === 'shop') {
    if (k >= '1' && k <= '9') a = { t: 'buy', i: +k - 1 };
    else if (k === ' ' || k === 'escape' || k === 'enter') a = { t: 'leave' };
  }
  else if (k === 'tab') {
    // nächstes sichtbares Ziel anwählen
    const r = run, vis = r.mobs.filter(m => r.vis[m.y * W + m.x]);
    if (!vis.length) return true;
    const n = vis[(vis.findIndex(m => m.id === r.target) + 1) % vis.length];
    a = { t: 'target', x: n.x, y: n.y };
  }
  else if (MOVES[k]) a = { t: 'move', dx: MOVES[k][0], dy: MOVES[k][1] };
  else if (k === ' ' || k === '.') a = { t: 'wait' };
  else if (k === 'f') a = { t: 'shoot' };
  else if (k === 'q') a = { t: 'potion' };
  else if (k === 'b') a = { t: 'bomb' };
  else if (k === 'e' || k === 'enter') a = { t: 'descend' };
  else if (k >= '1' && k <= '3') a = { t: 'skill', i: +k - 1 };
  else if (k === '4') a = { t: 'ult' };
  else if (k >= '5' && k <= '8') a = { t: 'use', id: USE_ORDER[+k - 5] };
  if (!a) return false;
  const before: string = run.mode, solved = !!run.puzzle?.solved, items = run.p.potions + run.p.bombs;
  act(run, a);
  const mode: string = run.mode;
  if (mode !== before) {
    if (mode === 'dead') sfx('death');
    else if (mode === 'win' || (mode === 'perk' && !solved && run.puzzle?.solved)) sfx('solve');
    else if (mode === 'perk') sfx('level');
  } else if (run.p.potions + run.p.bombs > items) sfx('pick');
  storeRun();
  return true;
}

cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  setMouse(((e.clientX - r.left) * VW) / r.width, ((e.clientY - r.top) * VH) / r.height);
});
cv.addEventListener('mouseleave', () => setMouse(-1, -1));
cv.addEventListener('click', e => {
  if (scene !== 'run' || !run) return;
  const r = cv.getBoundingClientRect();
  const [x, y] = tileAt(((e.clientX - r.left) * VW) / r.width, ((e.clientY - r.top) * VH) / r.height);
  act(run, { t: 'target', x, y });
});

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

// ---------- Titelbild ----------
const TITLE_ITEMS = 4;
let tRow = 0;
let stageDark: HTMLCanvasElement | null = null;

function titleAction() {
  if (tRow === 0) { scene = 'lager'; row = ROWS - 1; }
  else if (tRow === 1) setLang(getLang() === 'de' ? 'en' : 'de');
  else if (tRow === 2) toggleSound();
  else if (document.fullscreenElement) void document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => { /* nicht erlaubt */ });
}

function drawTitle(time: number, dt: number) {
  backdrop(time, dt);
  // Bühne: ein Stück Gruft mit Fackeln, davor die Helden, im Dunkeln lauern Gegner
  const ts = tilesets[0], top = 132, floorY = top + 48;
  for (let x = 0; x < VW; x += 16) {
    for (let r = 0; r < 3; r++) ctx.drawImage(ts.wall, x, top + r * 16);
    for (let r = 0; r < 4; r++) ctx.drawImage(ts.floor[((x >> 4) * 7 + r * 5) % 4], x, floorY + r * 16);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, floorY, VW, 4);
  const torches = [112, 320, 528];
  for (const tx of torches) ctx.drawImage(sprites[`torch${Math.floor(time * 7 + tx) % 2}`], tx - 16, top + 12, 32, 32);
  const fig = (name: string, x: number, view: string, scale: number, mirror = false) => {
    const img = sprites[`${name}:${view}${Math.floor(time * 2.5 + x) % 2}`], w = img.width * scale, h = img.height * scale, y = floorY + 46 - h;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x - w / 2 + scale * 3, floorY + 43, w - scale * 6, scale);
    if (!mirror) { ctx.drawImage(img, x - w / 2, y, w, h); return; }
    ctx.save(); ctx.translate(x + w / 2, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); ctx.restore();
  };
  fig('skelett', 52, 's', 3); fig('golem', 150, 's', 3); fig('fledermaus', 214, 'f', 2);
  fig('sporling', 470, 's', 3, true); fig('glutgeist', 560, 's', 3, true);
  fig('koenig', 608, 'f', 2);
  fig('krieger', 276, 'f', 3); fig('magier', 322, 'f', 3); fig('waldlaeufer', 368, 'f', 3);
  // Dunkelheit mit Lichtkegeln
  if (!stageDark) { stageDark = document.createElement('canvas'); stageDark.width = VW >> 1; stageDark.height = 60; }
  const g = stageDark.getContext('2d')!;
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, VW >> 1, 60);
  g.fillStyle = 'rgba(5,6,12,0.82)'; g.fillRect(0, 0, VW >> 1, 60);
  g.globalCompositeOperation = 'destination-out';
  const hole = (x: number, y: number, r: number) => {
    const gr = g.createRadialGradient(x / 2, y / 2, r * 0.1, x / 2, y / 2, r / 2);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x / 2 - r, y / 2 - r, r * 2, r * 2);
  };
  torches.forEach((tx, i) => hole(tx, 44, 118 * (0.94 + 0.06 * Math.sin(time * 9 + i * 2))));
  hole(560, 80, 90 * (0.9 + 0.1 * Math.sin(time * 13)));
  ctx.drawImage(stageDark, 0, top, VW, 120);
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r] of [...torches.map(tx => [tx, top + 30, 110]), [560, top + 84, 60]]) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(239,125,87,0.2)'); gr.addColorStop(1, 'rgba(239,125,87,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  // Ränder der Bühne ausblenden
  for (const [x0, x1] of [[0, 90], [VW, VW - 90]]) {
    const gr = ctx.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, 'rgba(13,14,23,1)'); gr.addColorStop(1, 'rgba(13,14,23,0)');
    ctx.fillStyle = gr; ctx.fillRect(Math.min(x0, x1), top - 2, 90, 124);
  }
  ctx.fillStyle = '#566c86'; ctx.fillRect(0, top - 2, VW, 1); ctx.fillRect(0, top + 120, VW, 1);

  // Schriftzug mit Glut
  const glow = ctx.createRadialGradient(VW / 2, 60, 10, VW / 2, 60, 240);
  glow.addColorStop(0, `rgba(239,125,87,${0.16 + 0.04 * Math.sin(time * 2)})`); glow.addColorStop(1, 'rgba(239,125,87,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, VW, 130);
  text(ctx, 'GLUTGRUFT', VW / 2 + 3, 39, '#5d275d', 44, 'center', false);
  text(ctx, 'GLUTGRUFT', VW / 2 + 1, 37, '#b13e53', 44, 'center', false);
  text(ctx, 'GLUTGRUFT', VW / 2, 35, '#ef7d57', 44, 'center', false);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 35, VW, 20); ctx.clip();
  text(ctx, 'GLUTGRUFT', VW / 2, 35, '#ffcd75', 44, 'center', false);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(0, 35, VW, 6); ctx.clip();
  text(ctx, 'GLUTGRUFT', VW / 2, 35, '#fff3c4', 44, 'center', false);
  ctx.restore();
  text(ctx, 'Ein Abstieg in fünfzehn Ebenen', VW / 2, 86, '#94b0c2', 10, 'center');
  ctx.fillStyle = '#566c86'; ctx.fillRect(VW / 2 - 150, 104, 300, 1);
  ctx.fillStyle = '#ffcd75'; ctx.fillRect(VW / 2 - 3, 102, 6, 5);

  // Menü
  const items = ['SPIEL STARTEN', 'SPRACHE: DEUTSCH', soundOn() ? 'TON: AN' : 'TON: AUS', 'VOLLBILD'];
  items.forEach((label, i) => {
    const y = 264 + i * 17, sel = i === tRow;
    if (sel) { panel(ctx, VW / 2 - 100, y - 4, 200, 16, '#ffcd75', 'rgba(177,62,83,0.45)'); text(ctx, '>', VW / 2 - 92, y, '#ffcd75'); text(ctx, '<', VW / 2 + 88, y, '#ffcd75'); }
    text(ctx, label, VW / 2, y, sel ? '#ffcd75' : '#94b0c2', 10, 'center');
  });
  text(ctx, 'Pfeile wählen · ENTER bestätigen', VW / 2, 336, '#566c86', 8, 'center');
  text(ctx, 'Bewegen: Pfeile/WASD · Fähigkeiten: 1-3 · Rucksack: I · Hilfe: H', VW / 2, 347, '#333c57', 8, 'center');
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
  panel(ctx, 34, 64, 100, 100, '#333c57', '#1c2033');
  figure(ctx, `${id}:${['f', 'f', 's', 'b', 's'][Math.floor(time * 0.6) % 5]}${Math.floor(time * 2.5) % 2}`, 36, 66, 96, 96);
  ctx.globalAlpha = 1;
  text(ctx, `< ${c.name} >`, 146, 74, '#ffcd75', 16);
  text(ctx, `Leben ${c.hp + 2 * (meta.upg.vit ?? 0)}`, 146, 100, '#b13e53', 8);
  text(ctx, `Angriff ${c.atk + (meta.upg.atk ?? 0)}   Verteidigung ${c.def}`, 146, 112, '#94b0c2', 8);
  text(ctx, `${c.resName} ${c.resMax + (meta.upg.fokus ?? 0)}`, 146, 124, c.resCol, 8);
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
    const y = 70 + i * 19, sel = row === i + 1, lvl = meta.upg[u.id] ?? 0, max = lvl >= u.max;
    panel(ctx, ux, y, uw, 16, sel ? '#ffcd75' : '#566c86', sel ? 'rgba(60,50,40,0.9)' : 'rgba(13,14,23,0.88)');
    drawIcon(ctx, UPG_ICON[u.id], ux + 5, y + 4, sel ? '#ffcd75' : '#94b0c2');
    text(ctx, u.name, ux + 18, y + 4, sel ? '#ffcd75' : '#f4f4f4', 8);
    for (let k = 0; k < u.max; k++) { ctx.fillStyle = k < lvl ? '#73eff7' : '#333c57'; ctx.fillRect(ux + 100 + k * 9, y + 5, 6, 6); }
    text(ctx, max ? 'MAX' : `${upgCost(u, lvl)}`, ux + uw - 8, y + 4, max ? '#566c86' : meta.souls >= upgCost(u, lvl) ? '#73eff7' : '#b13e53', 8, 'right');
    if (!max) ctx.drawImage(sprites.soul, ux + uw - 24 - `${upgCost(u, lvl)}`.length * 6, y + 2);
  });
  const ly = 70 + UPGRADES.length * 19 + 2;
  if (row >= 1 && row <= UPGRADES.length) text(ctx, UPGRADES[row - 1].desc, ux + 2, ly, '#94b0c2', 8);
  const dy = ly + 13, dsel = row === ROWS - 2, dbest = meta.daily.date === today() ? meta.daily.best : 0;
  panel(ctx, ux, dy, uw, 26, dsel ? '#ffcd75' : '#566c86');
  text(ctx, 'Tageslauf', ux + 10, dy + 4, dsel ? '#ffcd75' : '#f4f4f4', 10);
  text(ctx, 'Heute für alle dieselbe Gruft', ux + 10, dy + 16, '#94b0c2', 8);
  text(ctx, dbest ? (dbest > LAST_FLOOR ? 'bezwungen' : `Ebene ${dbest}`) : 'offen', ux + uw - 10, dy + 6, dbest ? '#73eff7' : '#566c86', 10, 'right');
  const sy = dy + 32, sel = row === ROWS - 1;
  panel(ctx, ux, sy, uw, 36, sel ? '#ffcd75' : '#566c86', sel ? 'rgba(177,62,83,0.5)' : 'rgba(13,14,23,0.88)');
  text(ctx, saved ? `FORTSETZEN · EBENE ${saved.floor}` : 'ABSTIEG BEGINNEN', ux + uw / 2, sy + 11, sel ? '#ffcd75' : '#f4f4f4', 16, 'center');
  if (saved) text(ctx, 'X: gespeicherten Lauf beenden', ux + uw, 58, '#566c86', 8, 'right');

  text(ctx, 'L: Sprache · ESC: Titel', VW / 2, 347, '#333c57', 8, 'center');
  if (noteT > 0) { noteT -= dt; text(ctx, note, ux + uw / 2, sy + 46, '#ffcd75', 8, 'center'); }
  text(ctx, 'Pfeile: wählen · ENTER: kaufen/bestätigen · LEERTASTE: Abstieg · V: Vollbild · M: Ton', VW / 2, 336, '#566c86', 8, 'center');
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
(window as unknown as { __g: unknown }).__g = { get run() { return run; }, get scene() { return scene; }, meta, sprites,
  start(seed: number, cls: 'krieger' | 'magier' | 'waldlaeufer') { resetView(); run = newRun(seed, cls, meta); scene = 'run'; return run; },
};
