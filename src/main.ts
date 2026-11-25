import { drawIcon, UPG_ICON } from './render/icons';
import { titleScene, drawLogo, drawTitleMenu, menuStep, menuHit } from './render/title';
import { VW, VH, bake, sprites, tilesets, text, panel, wrap, figure } from './render/gfx';
import { getLang, setLang } from './core/i18n';
import { drawRun, drawCard, setTutStep, drawTree, treeMove, treeFocus, treeCursor, resetView, setMouse, toggleMap, setTutorial, tileAt, getOverlay, setOverlay, invMove, invAction, invDrop, invClick, lootIndex, lootDone } from './render/draw';
import { sfx, soundOn, toggleSound, wakeAudio } from './core/audio';
import { reducedFx, setReducedFx } from './render/deaths';
import { loadMeta, saveMeta } from './core/save';
import { W } from './game/dungeon';
import { newRun, act, serialize, deserialize, availableNodes, Run, Action } from './game/run';
import { snap, stepsDone, currentStep, runCard, resetMoves, STEPS, STEP_COUNT, CARDS, TutCard } from './game/tutorial';
import { CLASSES, CLASS_ORDER, UPGRADES, RANGER_COST, upgCost, LAST_FLOOR, USE_ORDER, treeNode } from './game/content';

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

let scene: 'title' | 'lager' | 'baum' | 'run' = 'title';
const meta = loadMeta();
let run: Run | null = null;
let row = 0, clsIdx = 0, note = '', noteT = 0;
const ROWS = 4 + UPGRADES.length; // Klasse, Fertigkeitsbaum, Upgrades..., Tageslauf, Start
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

// ENTER (oder Mausklick) auf der gewählten Zeile des Lagers
function lagerEnter() {
  if (row === 0) {
    if (locked()) {
      if (meta.souls >= RANGER_COST) { meta.souls -= RANGER_COST; meta.ranger = true; saveMeta(meta); flash('Waldläufer freigeschaltet!'); sfx('level'); }
      else flash('Nicht genug Seelensplitter.');
    }
  } else if (row === 1) { scene = 'baum'; treeFocus(CLASS_ORDER[clsIdx], 'n0_1'); }
  else if (row === ROWS - 1) startRun();
  else if (row === ROWS - 2) startRun(true);
  else {
    const u = UPGRADES[row - 2], lvl = meta.upg[u.id] ?? 0;
    if (lvl >= u.max) flash('Bereits auf höchster Stufe.');
    else if (meta.souls < upgCost(u, lvl)) flash('Nicht genug Seelensplitter.');
    else { meta.souls -= upgCost(u, lvl); meta.upg[u.id] = lvl + 1; saveMeta(meta); sfx('pick'); }
  }
}
function endSaved() {
  if (!saved) return;
  meta.souls += saved.souls; saveMeta(meta); saved = null; run = null; storeRun(); flash('Lauf beendet – Splitter gutgeschrieben.');
}
// Klickflächen des Lagers, beim Zeichnen gesammelt: Zeile (Auswahl + ENTER) oder eigene Aktion
type Hit = { x: number; y: number; w: number; h: number; row?: number; act?: () => void };
let lagerHits: Hit[] = [];
const locked = () => CLASS_ORDER[clsIdx] === 'waldlaeufer' && !meta.ranger;

function startRun(daily = false) {
  resetView();
  if (saved && !daily) { run = saved; saved = null; setTutorial(!meta.tutOff); resetMoves(); scene = 'run'; return; }
  if (locked()) { flash('Diese Klasse ist noch gesperrt.'); return; }
  saved = null;
  setTutorial(!meta.tutOff);
  resetMoves();
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

// Lehrgang: offene Karte hält das Spiel an
let card: TutCard | null = null;
const tutDone = (id: string) => { if (!meta.tut.includes(id)) { meta.tut.push(id); saveMeta(meta); } };

function onKey(k: string): boolean {
  wakeAudio();
  if (card) {
    if (k === 'enter' || k === ' ' || k === 'escape') { tutDone(card.id); card = null; }
    return true;
  }
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
    if (MOVES[k] && (MOVES[k][0] || MOVES[k][1])) { tRow = menuStep(tRow, MOVES[k][0], MOVES[k][1], TITLE_ITEMS); return true; }
    if (k === ' ' || k === 'enter') { titleAction(); return true; }
    if (k === 'l') { setLang(getLang() === 'de' ? 'en' : 'de'); return true; }
    return false;
  }
  if (scene === 'baum') {
    const mv = MOVES[k], cls = CLASS_ORDER[clsIdx];
    if (mv) { treeMove(cls, mv[0], mv[1]); return true; }
    if (k === 'escape' || k === 'backspace') { scene = 'lager'; return true; }
    if (k === 'enter') {
      const n = treeNode(cls, treeCursor())!, own = meta.tree[cls] ?? [];
      if (!n.cost || own.includes(n.id)) flash(n.cost ? 'Schon freigeschaltet.' : 'Immer verfügbar.');
      else if (n.parent && treeNode(cls, n.parent)!.cost && !own.includes(n.parent)) flash('Erst den vorigen Knoten freischalten.');
      else if (meta.souls < n.cost) flash('Nicht genug Seelensplitter.');
      else { meta.souls -= n.cost; meta.tree[cls] = [...own, n.id]; saveMeta(meta); }
      return true;
    }
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
    if (k === 'x' && saved) { endSaved(); return true; }
    if (k === 'enter') {
      lagerEnter();
      return true;
    }
    return false;
  }
  if (!run) return false;
  if (k === 'l') { setLang(getLang() === 'de' ? 'en' : 'de'); return true; } // Sprache auch im Lauf
  if (run.mode === 'dead' || run.mode === 'win') {
    if (k === ' ' || k === 'enter') { endRun(); return true; }
    return false;
  }
  let a: Action | null = null;
  if (run.mode === 'perk') { if (k >= '1' && k <= '4') a = { t: 'perk', i: +k - 1 }; }
  else if (run.mode === 'tree') {
    if (MOVES[k]) { treeMove(run.p.cls, MOVES[k][0], MOVES[k][1]); return true; }
    if (k === 'enter' || k === ' ') a = { t: 'learn', id: treeCursor() };
    else if (k === 'k' || k === 'escape') a = { t: 'later' };
  }
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
  else if (k === 'k') a = { t: 'tree' };
  else if (k === 't' && !meta.tutOff) { const s = currentStep(meta.tut, run); if (s) tutDone(s.id); return true; }
  else if (k === 'q') a = { t: 'potion' };
  else if (k === 'b') a = { t: 'bomb' };
  else if (k === 'e' || k === 'enter') a = { t: 'descend' };
  else if (k >= '1' && k <= '6') a = { t: 'skill', i: +k - 1 };
  else if (k === 'u') a = { t: 'ult' };
  else if (k >= '7' && k <= '9') a = { t: 'use', id: USE_ORDER[+k - 7] };
  else if (k === '0') a = { t: 'use', id: USE_ORDER[3] };
  if (!a) return false;
  const before: string = run.mode, solved = !!run.puzzle?.solved, items = run.p.potions + run.p.bombs, b = snap(run);
  act(run, a);
  if (!meta.tutOff) for (const id of stepsDone(meta.tut, run, a, b)) tutDone(id);
  const mode: string = run.mode;
  // Baum: Auswahl auf den ersten lernbaren Knoten setzen
  if (mode === 'tree' && (before !== 'tree' || !availableNodes(run).includes(treeCursor()))) { const av = availableNodes(run); if (av.length) treeFocus(run.p.cls, av[0]); }
  if (mode !== before) {
    if (mode === 'dead') sfx('death');
    else if (mode === 'win' || (mode === 'perk' && !solved && run.puzzle?.solved)) sfx('solve');
    else if (mode === 'perk' || mode === 'tree') sfx('level');
  } else if (run.p.potions + run.p.bombs > items) sfx('pick');
  storeRun();
  return true;
}

cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  const mx = ((e.clientX - r.left) * VW) / r.width, my = ((e.clientY - r.top) * VH) / r.height;
  setMouse(mx, my);
  if (scene === 'title') { const i = menuHit(mx, my, TITLE_ITEMS); if (i >= 0) tRow = i; }
  if (scene === 'lager' && !card) { const h = lagerHit(mx, my); if (h && h.row !== undefined) row = h.row; }
  cv.style.cursor = (scene === 'title' && menuHit(mx, my, TITLE_ITEMS) >= 0) || (scene === 'lager' && lagerHit(mx, my)) ? 'pointer' : '';
});
// oberste Klickfläche unter dem Zeiger (später gezeichnet = oben)
function lagerHit(mx: number, my: number): Hit | undefined {
  for (let i = lagerHits.length - 1; i >= 0; i--) { const h = lagerHits[i]; if (mx >= h.x && mx < h.x + h.w && my >= h.y && my < h.y + h.h) return h; }
  return undefined;
}
cv.addEventListener('mouseleave', () => setMouse(-1, -1));
cv.addEventListener('click', e => {
  const r = cv.getBoundingClientRect();
  const mx = ((e.clientX - r.left) * VW) / r.width, my = ((e.clientY - r.top) * VH) / r.height;
  wakeAudio();
  if (card) { tutDone(card.id); card = null; return; }   // Lehrgangskarte: Klick wie ENTER
  if (scene === 'lager') { const h = lagerHit(mx, my); if (h?.act) h.act(); else if (h?.row !== undefined) { row = h.row; lagerEnter(); } return; }
  if (scene === 'title') { const i = menuHit(mx, my, TITLE_ITEMS); if (i >= 0) { tRow = i; titleAction(); } return; }
  if (scene !== 'run' || !run) return;
  // Im Rucksack wählt und benutzt die Maus dieselben Zeilen wie die Tastatur
  if (getOverlay() === 'inv') {
    if (run.mode !== 'play') return;
    const a = invClick(run, mx, my);
    if (a) { act(run, a); sfx('pick'); storeRun(); }
    return;
  }
  const [x, y] = tileAt(mx, my);
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
const TITLE_ITEMS = 7;
let tRow = 0;

function titleAction() {
  if (tRow === 0) { scene = 'lager'; row = ROWS - 1; }
  else if (tRow === 1) setLang(getLang() === 'de' ? 'en' : 'de');
  else if (tRow === 2) toggleSound();
  else if (tRow === 3) { meta.tutOff = !meta.tutOff; saveMeta(meta); }
  else if (tRow === 4) { meta.tut = []; meta.tutOff = false; saveMeta(meta); flash('Lehrgang beginnt von vorn.'); }
  else if (tRow === 5) setReducedFx(!reducedFx()); // niedrig: kein Nachglühen, keine Teilchen, kein Nebel, keine Schlagschatten, kein Wackeln
  else if (document.fullscreenElement) void document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => { /* nicht erlaubt */ });
}

function drawTitle(time: number, dt: number) {
  void time;
  // ruhendes Bild über den ganzen Schirm (einmal gemalt), darüber Schriftzug und Menü
  ctx.drawImage(titleScene(), 0, 0);
  drawLogo(ctx, 'Ein Abstieg in fünfzehn Ebenen');
  if (noteT > 0) noteT -= dt;
  drawTitleMenu(ctx, titleItems(), tRow, 'Pfeile wählen · ENTER bestätigen · Maus: klicken', noteT > 0 ? note : '');
}
// Einträge mit ihren aktuellen Werten; Reihenfolge = titleAction
function titleItems() {
  return [
    { label: 'SPIEL STARTEN', icon: '' },
    { label: 'SPRACHE: DEUTSCH', icon: 'globe' },
    { label: soundOn() ? 'TON: AN' : 'TON: AUS', icon: soundOn() ? 'sound' : 'mute' },
    { label: meta.tutOff ? 'LEHRGANG: AUS' : 'LEHRGANG: AN', icon: 'book' },
    { label: 'LEHRGANG NEU', icon: 'restart' },
    { label: reducedFx() ? 'GRAFIK: NIEDRIG' : 'GRAFIK: HOCH', icon: 'screen' },
    { label: document.fullscreenElement ? 'VOLLBILD: AN' : 'VOLLBILD: AUS', icon: 'full' },
  ];
}

// Platte im Stil des Hauptmenüs: dunkler Grund, feiner Rand, Lichtkante; gewählt mit Goldrand
function plate(x: number, y: number, w: number, h: number, on: boolean, tone: 'stone' | 'red' | 'dark' = 'stone') {
  x |= 0; y |= 0;
  const T = { stone: ['#221d33', '#2f2846', '#3b3256', '#5a4f78'], red: ['#4a1830', '#7d2b45', '#6b1d2a', '#b13e53'], dark: ['rgba(13,11,22,0.92)', '#262038', '#221d33', '#3b3256'] }[tone];
  ctx.fillStyle = '#0d0e17'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = on && tone !== 'dark' ? T[2] : T[0]; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = on && tone !== 'dark' ? T[3] : T[1]; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillStyle = on ? '#ffcd75' : tone === 'red' ? '#7d2b45' : '#3b3256';
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  if (on) { ctx.fillStyle = '#c98a3a'; ctx.fillRect(x + 1, y + h - 2, w - 2, 1); }
}
// kleiner Goldpfeil links neben der gewählten Zeile
function pointer(x: number, y: number) {
  ctx.fillStyle = '#ffcd75'; ctx.fillRect(x, y - 2, 1, 5); ctx.fillRect(x + 1, y - 1, 1, 3); ctx.fillRect(x + 2, y, 1, 1);
}
let lagerBg: HTMLCanvasElement | null = null;

function drawLager(time: number, dt: number) {
  const hits: Hit[] = [];
  // Hintergrund: derselbe Saal wie im Titel, stark abgedunkelt
  if (!lagerBg) {
    lagerBg = document.createElement('canvas'); lagerBg.width = VW; lagerBg.height = VH;
    const g = lagerBg.getContext('2d')!;
    g.drawImage(titleScene(), 0, 0);
    g.fillStyle = 'rgba(8,7,14,0.78)'; g.fillRect(0, 0, VW, VH);
    const v = g.createLinearGradient(0, 0, 0, VH); v.addColorStop(0, 'rgba(8,7,14,0.4)'); v.addColorStop(0.5, 'rgba(8,7,14,0)'); v.addColorStop(1, 'rgba(8,7,14,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, VW, VH);
  }
  ctx.drawImage(lagerBg, 0, 0);

  // ---------- Kopfzeile ----------
  text(ctx, 'LAGER', 26, 12, '#5d275d', 24, 'left', false);
  text(ctx, 'LAGER', 24, 10, '#ffcd75', 24);
  ctx.fillStyle = '#c98a3a'; ctx.fillRect(24, 36, 120, 1); ctx.fillStyle = '#ffcd75'; ctx.fillRect(144, 35, 3, 3);
  const souls = `${meta.souls}`, sw = text(ctx, souls, -999, 0, '#000', 10) + 34;
  plate(VW - 20 - sw, 10, sw, 20, false, 'dark');
  ctx.drawImage(sprites.soul, VW - 20 - sw + 6, 14);
  text(ctx, souls, VW - 28, 15, '#73eff7', 10, 'right');
  text(ctx, 'Seelensplitter', VW - 24 - sw, 16, '#566c86', 8, 'right');
  if (meta.best) text(ctx, meta.best > LAST_FLOOR ? 'Gruft bezwungen' : `Tiefste Ebene: ${meta.best}`, VW - 20, 34, '#94b0c2', 8, 'right');

  // ---------- Klasse ----------
  const id = CLASS_ORDER[clsIdx], c = CLASSES[id], lock = locked();
  const L = { x: 20, y: 46, w: 296, h: 266 };
  plate(L.x, L.y, L.w, L.h, row === 0, 'dark');
  hits.push({ ...L, row: 0, act: () => { row = 0; if (lock) lagerEnter(); } });
  // Umschalter: Pfeiltasten links/rechts, Name, Punkte
  for (const [dir, ax] of [[-1, L.x + 8], [1, L.x + L.w - 26]] as [number, number][]) {
    plate(ax, L.y + 7, 18, 16, false);
    text(ctx, dir < 0 ? '<' : '>', ax + 6, L.y + 11, '#ffcd75', 8);
    hits.push({ x: ax, y: L.y + 7, w: 18, h: 16, row: 0, act: () => { row = 0; clsIdx = (clsIdx + dir + CLASS_ORDER.length) % CLASS_ORDER.length; sfx('pick'); } });
  }
  text(ctx, c.name, L.x + L.w / 2, L.y + 8, '#ffcd75', 16, 'center');
  CLASS_ORDER.forEach((_, i) => { ctx.fillStyle = i === clsIdx ? '#ffcd75' : '#3b3256'; ctx.fillRect(L.x + L.w / 2 - 10 + i * 8, L.y + 28, 4, 2); });
  // Bildnis auf beleuchtetem Sockel
  const fx = L.x + 10, fy = L.y + 36, fw = 104, fh = 100;
  plate(fx, fy, fw, fh, false, 'stone');
  const spot = ctx.createRadialGradient(fx + fw / 2, fy + 30, 4, fx + fw / 2, fy + 50, 70);
  spot.addColorStop(0, lock ? 'rgba(86,108,134,0.18)' : 'rgba(255,205,117,0.2)'); spot.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = spot; ctx.fillRect(fx + 1, fy + 1, fw - 2, fh - 2);
  ctx.fillStyle = '#3b3256'; ctx.beginPath(); ctx.ellipse(fx + fw / 2, fy + fh - 12, 32, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a4f78'; ctx.fillRect(fx + fw / 2 - 30, fy + fh - 13, 60, 1);
  ctx.globalAlpha = lock ? 0.35 : 1;
  figure(ctx, `${id}:${['f', 'f', 's', 'b', 's'][Math.floor(time * 0.6) % 5]}${Math.floor(time * 2.5) % 2}`, fx + 4, fy + 2, 96, 92);
  ctx.globalAlpha = 1;
  // Werte mit Symbolen
  const stats: [string, string, string, string][] = [
    ['heart', 'Leben', `${c.hp + 2 * (meta.upg.vit ?? 0)}`, '#b13e53'],
    ['sword', 'Angriff', `${c.atk + (c.id === 'magier' ? 0 : meta.upg.atk ?? 0)}`, '#f4f4f4'],
    ['shield', 'Verteidigung', `${c.def}`, '#f4f4f4'],
    [id === 'krieger' ? 'flame' : id === 'magier' ? 'manaorb' : 'target', c.resName, `${c.resMax + (meta.upg.fokus ?? 0)}`, c.resCol],
  ];
  if (c.range) stats.push(['bow', 'Fernkampf', `${c.range} Felder`, '#94b0c2']);
  const sx = fx + fw + 10, sxr = L.x + L.w - 10;
  stats.forEach(([ic, label, val, col], i) => {
    const y = fy + 2 + i * 17;
    ctx.fillStyle = 'rgba(34,29,51,0.8)'; ctx.fillRect(sx, y, sxr - sx, 14);
    drawIcon(ctx, [ic], sx + 3, y + 3, '#94b0c2');
    text(ctx, label, sx + 16, y + 3, '#c9d4dc', 8);
    text(ctx, val, sxr - 5, y + 3, col, 8, 'right');
  });
  wrap(c.desc, 46).slice(0, 2).forEach((l, i) => text(ctx, l, L.x + 10, fy + fh + 8 + i * 10, '#e8e4d8', 8));
  // Fähigkeiten
  const ky = fy + fh + 36;
  text(ctx, 'FÄHIGKEITEN', L.x + 10, ky - 2, '#566c86', 8);
  ctx.fillStyle = '#3b3256'; ctx.fillRect(L.x + 80, ky + 2, L.w - 90, 1);
  c.skills.forEach((sk, i) => {
    const y = ky + 9 + i * 26;
    plate(L.x + 10, y, 22, 22, false);
    ctx.drawImage(sprites[`i_${id}${i}`], L.x + 15, y + 5);
    text(ctx, `${i + 1}  ${sk.name}`, L.x + 40, y + 2, '#ffcd75', 8);
    text(ctx, sk.desc, L.x + 40, y + 13, '#94b0c2', 8);
    text(ctx, `${sk.cost} ${c.resName}`, L.x + L.w - 10, y + 2, c.resCol, 8, 'right');
  });
  if (lock) {
    plate(L.x + 36, fy + 30, L.w - 72, 40, true, 'red');
    text(ctx, 'GESPERRT', L.x + L.w / 2, fy + 36, '#ffcd75', 10, 'center');
    text(ctx, `Klick oder ENTER: ${RANGER_COST} Splitter`, L.x + L.w / 2, fy + 52, meta.souls >= RANGER_COST ? '#73eff7' : '#f4f4f4', 8, 'center');
  }
  if (row === 0) pointer(L.x - 7, L.y + 15);
  // Fertigkeitsbaum
  const tsel = row === 1, T = { x: L.x, y: L.y + L.h + 6, w: L.w, h: 17 };
  plate(T.x, T.y, T.w, T.h, tsel);
  drawIcon(ctx, ['book'], T.x + 6, T.y + 4, tsel ? '#ffcd75' : '#94b0c2');
  text(ctx, 'Fertigkeitsbaum', T.x + 20, T.y + 5, tsel ? '#ffcd75' : '#f4f4f4', 8);
  text(ctx, `${(meta.tree[id] ?? []).length} freigeschaltet  >`, T.x + T.w - 8, T.y + 5, '#94b0c2', 8, 'right');
  if (tsel) pointer(T.x - 7, T.y + 8);
  hits.push({ ...T, row: 1, act: () => { row = 1; lagerEnter(); } });

  // ---------- Verbesserungen ----------
  const ux = 332, uw = VW - ux - 20;
  text(ctx, 'VERBESSERUNGEN', ux, 48, '#94b0c2', 8);
  if (saved) {
    const xw = text(ctx, 'X: gespeicherten Lauf beenden', ux + uw, 48, '#566c86', 8, 'right');
    hits.push({ x: ux + uw - xw, y: 46, w: xw, h: 11, act: endSaved });
  }
  UPGRADES.forEach((u, i) => {
    const y = 60 + i * 17, sel = row === i + 2, lvl = meta.upg[u.id] ?? 0, max = lvl >= u.max, cost = upgCost(u, lvl), can = !max && meta.souls >= cost;
    plate(ux, y, uw, 15, sel);
    drawIcon(ctx, UPG_ICON[u.id], ux + 4, y + 3, sel ? '#ffcd75' : '#94b0c2');
    text(ctx, u.name, ux + 17, y + 4, sel ? '#ffcd75' : '#e8e4d8', 8);
    for (let k = 0; k < u.max; k++) {
      const px = ux + 128 + k * 8;
      ctx.fillStyle = '#0d0e17'; ctx.fillRect(px - 1, y + 4, 7, 7);
      ctx.fillStyle = k < lvl ? '#73eff7' : '#2f2846'; ctx.fillRect(px, y + 5, 5, 5);
      if (k < lvl) { ctx.fillStyle = '#c9f6ff'; ctx.fillRect(px, y + 5, 5, 1); }
    }
    // Preis und Kaufknopf
    const bx = ux + uw - 20;
    if (max) text(ctx, 'MAX', bx - 4, y + 4, '#566c86', 8, 'right');
    else {
      const cw = text(ctx, `${cost}`, bx - 4, y + 4, can ? '#73eff7' : '#b13e53', 8, 'right');
      ctx.drawImage(sprites.soul, bx - 18 - cw, y + 1);
    }
    plate(bx, y + 2, 16, 11, false, can ? 'red' : 'stone');
    ctx.fillStyle = max ? '#3b3256' : can ? '#ffcd75' : '#566c86';
    ctx.fillRect(bx + 5, y + 7, 6, 1); if (!max) ctx.fillRect(bx + 7, y + 5, 2, 5); // Plus; voll ausgebaut nur ein Strich
    if (sel) pointer(ux - 7, y + 7);
    hits.push({ x: ux, y, w: uw - 22, h: 15, row: i + 2, act: () => { row = i + 2; } });
    hits.push({ x: bx, y, w: 18, h: 15, row: i + 2, act: () => { row = i + 2; lagerEnter(); } });
  });
  // Beschreibung der gewählten Verbesserung
  const dy0 = 60 + UPGRADES.length * 17 + 2;
  ctx.fillStyle = 'rgba(13,11,22,0.85)'; ctx.fillRect(ux, dy0, uw, 14);
  const up = row >= 2 && row <= UPGRADES.length + 1 ? UPGRADES[row - 2] : null;
  text(ctx, up ? up.desc : 'Seelensplitter kaufen dauerhafte Verbesserungen.', ux + 6, dy0 + 3, up ? '#c9d4dc' : '#566c86', 8);
  // Tageslauf
  const D = { x: ux, y: dy0 + 20, w: uw, h: 27 }, dsel = row === ROWS - 2, dbest = meta.daily.date === today() ? meta.daily.best : 0;
  plate(D.x, D.y, D.w, D.h, dsel);
  drawIcon(ctx, ['target'], D.x + 6, D.y + 9, dsel ? '#ffcd75' : '#94b0c2');
  text(ctx, 'Tageslauf', D.x + 20, D.y + 4, dsel ? '#ffcd75' : '#f4f4f4', 10);
  text(ctx, 'Heute für alle dieselbe Gruft', D.x + 20, D.y + 16, '#94b0c2', 8);
  text(ctx, dbest ? (dbest > LAST_FLOOR ? 'bezwungen' : `Ebene ${dbest}`) : 'offen', D.x + D.w - 10, D.y + 10, dbest ? '#73eff7' : '#566c86', 8, 'right');
  if (dsel) pointer(D.x - 7, D.y + 13);
  hits.push({ ...D, row: ROWS - 2, act: () => { row = ROWS - 2; lagerEnter(); } });
  // Abstieg
  const S = { x: ux, y: D.y + D.h + 7, w: uw, h: 38 }, ssel = row === ROWS - 1;
  plate(S.x, S.y, S.w, S.h, ssel, 'red');
  if (ssel) {
    const gl = ctx.createRadialGradient(S.x + S.w / 2, S.y + S.h / 2, 4, S.x + S.w / 2, S.y + S.h / 2, 150);
    gl.addColorStop(0, 'rgba(239,125,87,0.16)'); gl.addColorStop(1, 'rgba(239,125,87,0)');
    ctx.fillStyle = gl; ctx.fillRect(S.x + 1, S.y + 1, S.w - 2, S.h - 2);
    pointer(S.x - 7, S.y + S.h / 2);
  }
  text(ctx, saved ? `FORTSETZEN · EBENE ${saved.floor}` : 'ABSTIEG BEGINNEN', S.x + S.w / 2, S.y + 8, ssel ? '#ffcd75' : '#f4e4c8', 16, 'center');
  text(ctx, saved ? 'gespeicherter Lauf' : 'LEERTASTE', S.x + S.w / 2, S.y + 27, ssel ? '#ef7d57' : '#7d2b45', 8, 'center');
  hits.push({ ...S, row: ROWS - 1, act: () => { row = ROWS - 1; lagerEnter(); } });

  if (noteT > 0) { noteT -= dt; text(ctx, note, S.x + S.w / 2, S.y + S.h + 5, '#ffcd75', 8, 'center'); }
  // Hinweise, zurückhaltend
  text(ctx, 'Pfeile/Maus: wählen · ENTER/Klick: kaufen · LEERTASTE: Abstieg · ESC: Titel', VW / 2, 341, '#566c86', 8, 'center');
  text(ctx, 'L: Sprache · V: Vollbild · M: Ton', VW / 2, 351, '#3b3256', 8, 'center');
  lagerHits = hits;
}

function drawLagerTree(time: number, dt: number) {
  backdrop(time, dt);
  const cls = CLASS_ORDER[clsIdx], own = meta.tree[cls] ?? [];
  const stateOf = (id: string) => { const n = treeNode(cls, id)!; return !n.cost ? 'free' : own.includes(id) ? 'owned' : meta.souls >= n.cost ? 'open' : 'buy'; };
  drawTree(ctx, cls, `FERTIGKEITSBAUM – ${CLASSES[cls].name.toUpperCase()}`, stateOf,
    id => { const n = treeNode(cls, id)!; return !n.cost ? '#free' : own.includes(id) ? 'freigeschaltet' : `${n.cost} Splitter`; },
    `Pfeile: wählen · ENTER: freischalten · ESC: zurück · ${meta.souls} Seelensplitter`,
    id => { const n = treeNode(cls, id)!; return !n.cost ? 'Ohne Seelensplitter, steht in jedem Lauf zur Wahl.' : own.includes(id) ? 'Steht in jedem Lauf zur Wahl.' : 'Freischalten: kommt in die Auswahl der Läufe.'; });
  if (noteT > 0) { noteT -= dt; text(ctx, note, VW / 2, 346, '#ffcd75', 8, 'center'); }
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000), time = now / 1000;
  last = now;
  if (scene === 'title') drawTitle(time, dt);
  else if (scene === 'lager') drawLager(time, dt);
  else if (scene === 'baum') drawLagerTree(time, dt);
  else if (run) drawRun(ctx, run, dt, time);
  // Lehrgang: Schritt im Lauf, Karten beim ersten Kennenlernen
  if (!meta.tutOff && !card) {
    if (scene === 'run' && run) card = runCard(meta.tut, run);
    else if (scene === 'lager' && !meta.tut.includes('lager')) card = CARDS.lager;
  }
  if (scene === 'run' && run) {
    const s = meta.tutOff ? null : currentStep(meta.tut, run);
    setTutStep(s ? { text: s.text(run), k: STEPS.filter(q => meta.tut.includes(q.id)).length + 1, n: STEP_COUNT } : null);
  }
  if (card) drawCard(ctx, card);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Für automatisierte Tests
(window as unknown as { __g: unknown }).__g = { get run() { return run; }, get scene() { return scene; }, meta, sprites,
  start(seed: number, cls: 'krieger' | 'magier' | 'waldlaeufer') { resetView(); run = newRun(seed, cls, meta); scene = 'run'; return run; },
  act(a: Action) { if (run) act(run, a); },
  // Abstieg bis Ebene n (für Bildschirmfotos): Treppe unter den Helden legen und hinabsteigen
  goto(n: number) {
    if (!run) return;
    while (run.floor < n) { run.mode = 'play'; run.tiles[run.p.y * W + run.p.x] = 2; act(run, { t: 'descend' }); }
    run.mode = 'play'; resetView();
  },
};
