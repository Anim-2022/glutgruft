import { VW, VH, TS, sprites, masks, tilesets, text, panel, bar, heroLook, figure } from './gfx';
import { GLOW } from './sprites';
import { W, H, T, wallLike, walkable } from '../game/dungeon';
import { threatOf, statusMarks } from './warn';
import { onDeath, drawDecals, drawDying, resetDeaths, reducedFx } from './deaths';
import { drawItemIcon, drawIcon, PERK_ICON } from './icons';
import { Light, applyLight, AMBIENTS } from './light';
import { dropShadow, drawAO } from './shade';
import { floorTint, softEdged } from './tiles';
import { propsFor, drawProp, recolor } from './props';
import { stepAmbient, drawAmbient, drawFog, resetAmbient, postFx } from './ambient';

// Arena des Bosses: Fackeln brennen in seiner Farbe [außen, Kern], dazu eine Aura um ihn
const BOSS_FLAME: [string, string][] = [['#9a4fc0', '#c9d4dc'], ['#38b764', '#a7f070'], ['#ef7d57', '#f4f4f4']];
const bossTorch: HTMLCanvasElement[][] = [];
const torchOf = (bi: number, f: number) => (bossTorch[bi] ??= [0, 1].map(k => recolor(sprites[`torch${k}`], { '#ef7d57': BOSS_FLAME[bi][0], '#ffcd75': BOSS_FLAME[bi][1] })))[f];
import { sfx } from '../core/audio';
import { tr } from '../core/i18n';
import { Run, Actor, xpNeed, skillCost, skillReady, spellAt, itemText, itemValue, itemScore, perkInfo, skillModName, shotRange, RANKS, SORT_NAMES, BAG_MAX, RUNE_NAMES, availableNodes } from '../game/run';
import { ClassId, treeNodes, NEW_SKILLS, TUNE, BRANCH_NAMES, SKILL_UP, treeNode, nodeText, CLASSES, MOBS, PERKS, RELICS, RARITY, RARITY_COL, BIOME_NAMES, biomeOf, Item, AFFIX, CONSUMABLES, SLOT_NAMES, ULT, ULT_LEVEL, USE_ORDER, SYNERGIES } from '../game/content';

const pos = new Map<number, { x: number; y: number }>();
const lunges = new Map<number, { dx: number; dy: number; t: number }>();
const flashes = new Map<number, number>();
const nums: { x: number; y: number; s: string; col: string; t: number }[] = [];
const bolts: { x0: number; y0: number; x1: number; y1: number; col: string; t: number }[] = [];
const booms: { x: number; y: number; r: number; t: number }[] = [];
const bits: { x: number; y: number; vx: number; vy: number; col: string; t: number; g?: number }[] = [];
let shake = 0;
// Fähigkeitseffekte (nur Darstellung)
type Shot = { x0: number; y0: number; x1: number; y1: number; col: string; kind: 'fire' | 'arrow' | 'heavy'; r: number; t: number; dur: number };
const shots: Shot[] = [];
const rings: { x: number; y: number; r: number; t: number }[] = [];
const sparks: { x: number; y: number; col: string; big: boolean; t: number }[] = [];
const bashes: { x: number; y: number; dx: number; dy: number; t: number }[] = [];
const swipes: { x: number; y: number; dx: number; dy: number; big: boolean; t: number }[] = [];
let deathT = -1; // Zeit seit dem Tod des Helden, -1 = lebt
const SWIPE_T = 0.2, DEATH_T = 1.3;
// Posen der Figuren: a Angriff, c Zauber (Bild aus poses.ts), Restdauer in Sekunden
const poses = new Map<number, { k: string; t: number }>();
const pose = (id: number, k: string, t = 0.22) => poses.set(id, { k, t });
const RING_T = 0.38, SPARK_T = 0.18, BASH_T = 0.22;
const burstBits = (x: number, y: number, n: number, cols: string[], v0: number, v1: number, up = 30, g?: number) => {
  for (let k = 0; k < n; k++) {
    const ang = Math.random() * Math.PI * 2, v = v0 + Math.random() * (v1 - v0);
    bits.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - up, col: cols[k % cols.length], t: 0, g });
  }
};
const cam = { x: 0, y: 0 };
const view = { ox: 0, oy: 0 };
// Bildschirmpunkt -> Kartenfeld (für Mausklicks)
export const tileAt = (mx: number, my: number): [number, number] => [Math.floor((mx - view.ox) / TS), Math.floor((my - view.oy) / TS)];

const LUNGE_T = 0.16, FLASH_T = 0.12;

// ---- Anzeigeoptionen ----
const mouse = { x: -1, y: -1 };
let mapMode = 1, tutorial = false; // 0 aus, 1 klein, 2 groß
export const setMouse = (x: number, y: number) => { mouse.x = x; mouse.y = y; };
export const toggleMap = () => { mapMode = (mapMode + 1) % 3; };
export const setTutorial = (on: boolean) => { tutorial = on; };
// Lehrgang: aktueller Schritt (vom Hauptprogramm gesetzt) und Karte beim ersten Kennenlernen
let tutStep: { text: string; k: number; n: number } | null = null;
export const setTutStep = (s: typeof tutStep) => { tutStep = s; };
export function drawCard(ctx: CanvasRenderingContext2D, card: { title: string; lines: string[] }) {
  const lines = card.lines.flatMap(l => wrapText(l, 66)), w = 420, h = 52 + lines.length * 12, x = (VW - w) >> 1, y = (VH - h) >> 1;
  ctx.fillStyle = 'rgba(13,14,23,0.7)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#73eff7');
  text(ctx, 'LEHRGANG', x + 10, y + 8, '#566c86', 8);
  text(ctx, card.title, VW / 2, y + 8, '#73eff7', 10, 'center');
  lines.forEach((l, k) => text(ctx, l, x + 14, y + 28 + k * 12, '#f4f4f4', 8));
  text(ctx, '[ENTER] weiter', VW / 2, y + h - 14, '#ffcd75', 8, 'center');
}

// ---- Fackeln: Positionen werden einmal pro Ebene bestimmt ----
const torches = new Set<number>();
let lightKey = '';
const hash = (x: number, y: number, s: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0;

function buildLight(run: Run) {
  const key = `${run.seed}:${run.floor}`;
  if (key === lightKey) return;
  lightKey = key;
  torches.clear();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (run.tiles[i] === T.WALL && walkable(run.tiles[i + W]) && hash(x, y, run.seed + run.floor) % 7 === 0) torches.add(i);
  }
}

export function resetView() {
  pos.clear(); lunges.clear(); flashes.clear();
  nums.length = 0; bolts.length = 0; bits.length = 0; booms.length = 0; shake = 0;
  shots.length = 0; rings.length = 0; sparks.length = 0; bashes.length = 0; swipes.length = 0; deathT = -1; poses.clear();
  resetDeaths(); resetAmbient();
}

function smooth(a: Actor, dt: number) {
  let p = pos.get(a.id);
  if (!p || Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 3) { p = { x: a.x, y: a.y }; pos.set(a.id, p); }
  const k = Math.min(1, dt * 11);
  p.x += (a.x - p.x) * k; p.y += (a.y - p.y) * k;
  return p;
}


// Bodenschatten unter Gegenständen: [Fußzeile im Feld, Breite]
const OBJ_SHADOW: Record<number, [number, number]> = {
  [T.PILLAR]: [15, 14], [T.BARREL]: [14, 13], [T.CHEST]: [13, 16], [T.CHEST_OPEN]: [13, 16], [T.ALTAR]: [15, 14], [T.ALTAR_USED]: [15, 14],
  [T.TRADER]: [15, 14], [T.CRATE]: [15, 16], [T.CRATE_ON]: [15, 16], [T.TABLET]: [15, 14], [T.LEVER]: [14, 10], [T.CURSED]: [14, 15],
  [T.FOUNTAIN]: [15, 15], [T.FOUNTAIN_DRY]: [15, 15],
};
const FLY = new Set(['fledermaus', 'glutgeist']);

const TILE_SPR: Record<number, string> = {
  [T.STAIRS]: 'stairs', [T.CHEST]: 'chest', [T.CHEST_OPEN]: 'chest_open', [T.ALTAR]: 'altar', [T.ALTAR_USED]: 'altar_used',
  [T.CRATE]: 'crate', [T.CRATE_ON]: 'crate', [T.PLATE]: 'plate', [T.LEVER]: 'lever', [T.TABLET]: 'tablet', [T.GOAL]: 'goal',
  [T.CURSED]: 'cursed', [T.TRADER]: 'trader', [T.FOUNTAIN]: 'fountain', [T.FOUNTAIN_DRY]: 'fountain_dry', [T.GATE]: 'gate',
  [T.BARREL]: 'barrel', [T.PILLAR]: 'pillar', [T.RUBBLE]: 'rubble', [T.FRAGILE]: 'crack', [T.FRAGILE2]: 'crack2',
};

export function drawRun(ctx: CanvasRenderingContext2D, run: Run, dt: number, time: number) {
  for (const f of run.fx.splice(0)) {
    switch (f.k) {
      case 'num': nums.push({ x: f.x * TS + 8, y: f.y * TS - nums.filter(n => n.t < 0.1).length * 8, s: f.s, col: f.col, t: 0 }); break;
      case 'shake': shake = Math.max(shake, f.n); break;
      case 'bolt': bolts.push({ ...f, t: 0 }); sfx('zap'); if (f.x0 === run.p.x && f.y0 === run.p.y) pose(0, 'a'); break;
      case 'lunge': lunges.set(f.id, { dx: f.dx, dy: f.dy, t: 0 }); sfx('hit'); pose(f.id, 'a'); break;
      case 'flash': flashes.set(f.id, FLASH_T); if (f.id === 0) sfx('hurt'); break;
      case 'die': shake = Math.max(shake, onDeath(run, f.kind, f.x, f.y)); sfx('kill'); break;
      case 'loot': loot = { item: f.item, how: f.how, t: 0 }; sfx('pick'); break;
      case 'boom': booms.push({ x: f.x, y: f.y, r: f.r, t: 0 }); sfx('boom'); break;
      case 'fireball': case 'arrow': {
        // Schütze: Held oder Gegner auf dem Startfeld zeigt seine Angriffs- bzw. Zauberpose
        if (f.x0 === run.p.x && f.y0 === run.p.y) pose(0, f.k === 'fireball' ? 'c' : 'a', 0.26);
        else { const m = run.mobs.find(o => o.x === f.x0 && o.y === f.y0); if (m) pose(m.id, 'a', 0.26); }
        const fire = f.k === 'fireball', d = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
        shots.push({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, t: 0, col: fire ? '#ef7d57' : f.col, r: fire ? f.r : 0,
          kind: fire ? 'fire' : f.heavy ? 'heavy' : 'arrow', dur: Math.min(fire ? 0.3 : 0.18, (fire ? 0.06 : 0.03) + d * (fire ? 0.03 : 0.018)) });
        sfx('zap');
        break;
      }
      case 'nova':
        pose(0, 'c', 0.32);
        rings.push({ x: f.x, y: f.y, r: f.r, t: 0 });
        burstBits(f.x * TS + 8, f.y * TS + 8, 26, ['#73eff7', '#c9d4dc', '#f4f4f4', '#41a6f6'], 40, 110, 10, 40);
        shake = Math.max(shake, 3); sfx('zap');
        break;
      case 'bash':
        bashes.push({ x: f.x, y: f.y, dx: f.dx, dy: f.dy, t: 0 });
        burstBits(f.x * TS + 8 - f.dx * 6, f.y * TS + 10 - f.dy * 6, 10, ['#94b0c2', '#c9d4dc', '#566c86'], 20, 60, 25);
        shake = Math.max(shake, 4);
        break;
      case 'swipe':
        swipes.push({ x: f.x, y: f.y, dx: f.dx, dy: f.dy, big: f.big, t: 0 });
        if (f.big) shake = Math.max(shake, 6);
        break;
      case 'pdeath': {
        deathT = 0;
        burstBits(f.x * TS + 8, f.y * TS + 8, 18, ['#b13e53', '#7d2b45', '#ef7d57'], 30, 90, 40);
        shake = Math.max(shake, 8);
        break;
      }
      case 'debris':
        sfx('crack');
        for (let k = 0; k < 14; k++) {
          const ang = Math.random() * Math.PI * 2, v = 20 + Math.random() * 60;
          bits.push({ x: f.x * TS + 8, y: f.y * TS + 8, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 40, col: Math.random() < 0.5 ? '#94b0c2' : '#566c86', t: 0 });
        }
        break;
    }
  }
  for (const [id, l] of lunges) { l.t += dt; if (l.t > LUNGE_T) lunges.delete(id); }
  for (const [id, q] of poses) { q.t -= dt; if (q.t <= 0) poses.delete(id); }
  for (const [id, t] of flashes) { if (t - dt <= 0) flashes.delete(id); else flashes.set(id, t - dt); }

  const p = run.p, pp = smooth(p, dt);
  // Held bleibt immer in der Bildmitte; jenseits des Kartenrands ist es einfach dunkel
  const tx = pp.x * TS + 8 - VW / 2, ty = pp.y * TS + 8 - VH / 2;
  if (Math.abs(tx - cam.x) > 220 || Math.abs(ty - cam.y) > 220) { cam.x = tx; cam.y = ty; }
  cam.x += (tx - cam.x) * Math.min(1, dt * 10); cam.y += (ty - cam.y) * Math.min(1, dt * 10);
  shake = reducedFx() ? 0 : Math.max(0, shake - dt * 30);
  const sx = shake ? Math.round((Math.random() - 0.5) * shake) : 0, sy = shake ? Math.round((Math.random() - 0.5) * shake) : 0;
  const ox = -Math.round(cam.x) + sx, oy = -Math.round(cam.y) + sy;

  view.ox = ox - sx; view.oy = oy - sy;
  ctx.fillStyle = '#08090f'; ctx.fillRect(0, 0, VW, VH);
  const bio = biomeOf(run.floor), ts = tilesets[bio], boss = run.floor % 5 === 0, fx = !reducedFx();
  const props = propsFor(run.tiles, run.seed + run.floor);
  buildLight(run);
  const lights: Light[] = [], floorTiles: number[] = [];
  const flick = (n: number) => 0.92 + 0.08 * Math.sin(time * 9 + n) + 0.04 * Math.sin(time * 23 + n * 1.7);
  const x0 = Math.max(0, Math.floor(cam.x / TS) - 1), x1 = Math.min(W - 1, x0 + VW / TS + 2);
  const y0 = Math.max(0, Math.floor(cam.y / TS) - 1), y1 = Math.min(H - 1, y0 + Math.ceil(VH / TS) + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (!run.seen[i]) continue;
    const t = run.tiles[i], dx = x * TS + ox, dy = y * TS + oy;
    if (wallLike(t)) {
      const front = y + 1 < H && !wallLike(run.tiles[i + W]);
      const open = (ox2: number, oy2: number) => x + ox2 >= 0 && x + ox2 < W && y + oy2 >= 0 && y + oy2 < H && !wallLike(run.tiles[i + oy2 * W + ox2]);
      const l = open(-1, 0), r = open(1, 0), u = open(0, -1);
      // Wandspielart fest am Feld (Hash der Koordinaten, kein Zufall): meist die Grundwand
      const hv = hash(x, y, 101) % 7;
      if (front) ctx.drawImage(ts.walls[hv < 5 ? 0 : hv - 4], dx, dy);
      else {
        const c = [open(-1, -1), open(1, -1), open(-1, 1), open(1, 1)];
        const bits = (u ? 1 : 0) | (l ? 2 : 0) | (r ? 4 : 0), inner = !(bits || c.some(Boolean));
        // Glutschmiede: in der Mauerkrone fließt hier und da Lava (vier Bilder, Phase je Feld versetzt)
        if (!inner && ts.lava.length && hash(x, y, 202) % 5 === 0) {
          ctx.drawImage(ts.lava[(Math.floor(time * 5) + x) % 4], dx, dy);
          ctx.drawImage(ts.capEdge[bits], dx, dy);
          lights.push({ x, y, r: 1.8 * flick(i), col: '#ef7d57', a: 0.6 });
        } else ctx.drawImage(inner ? ts.top : ts.caps[bits], dx, dy); // Kanten nur zu offenen Seiten, Mitte dunkler
        ctx.fillStyle = ts.hi;
        if (c[0] && !l && !u) ctx.fillRect(dx, dy, 2, 2);
        if (c[1] && !r && !u) ctx.fillRect(dx + TS - 2, dy, 2, 2);
        if (c[2] && !l) ctx.fillRect(dx, dy + TS - 2, 2, 2);
        if (c[3] && !r) ctx.fillRect(dx + TS - 2, dy + TS - 2, 2, 2);
      }
      // Wandfront: helle Kante zur offenen Seite, der Raumumriss bleibt rundum lesbar
      if (front) { ctx.fillStyle = ts.hi; if (l) ctx.fillRect(dx, dy, 2, 12); if (r) ctx.fillRect(dx + TS - 2, dy, 2, 12); }
      if (t === T.CRACKED) ctx.drawImage(sprites[(run.cracks.get(i) ?? 0) >= 2 ? 'crack2' : 'crack'], dx, dy);
      if (front && torches.has(i)) {
        const tf = Math.floor(time * 7 + x) % 2;
        ctx.drawImage(boss ? torchOf(bio, tf) : sprites[`torch${tf}`], dx, dy);
        lights.push({ x, y: y + 0.6, r: (boss ? 5.5 : 5) * flick(i), col: boss ? BOSS_FLAME[bio][0] : '#ef7d57' });
      } else if (front && hv < 5 && t === T.WALL && !torches.has(i - 1) && !torches.has(i + 1)) {
        // Wanddekor (Ketten, Banner, Wurzeln …) nur auf der schlichten Grundwand
        const pr = props[i];
        if (pr) drawProp(ctx, bio, pr, x, y, dx, dy, time, lights);
      }
    } else {
      // Boden: Muster über 2×2 Felder, selten eine Sonderplatte; dazu eine weiche Helligkeitswelle
      const hf = hash(x, y, 303);
      ctx.drawImage(bio && hf % 9 === 0 ? ts.floorX[(hf >>> 4) % ts.floorX.length] : ts.floorM[hash(x >> 1, y >> 1, 404) % ts.floorM.length][(y & 1) * 2 + (x & 1)], dx, dy);
      const tv = floorTint(x, y);
      ctx.fillStyle = tv > 0 ? `rgba(255,255,255,${(tv * 0.045).toFixed(3)})` : `rgba(0,0,0,${(-tv * 0.11).toFixed(3)})`; ctx.fillRect(dx, dy, TS, TS);
      // Ränder von Eis, Rasen und Brandfläche laufen gerastert in den Boden aus
      const edge = (k: number) => { let e = 0; [[0, -1, 1], [-1, 0, 2], [1, 0, 4], [0, 1, 8]].forEach(([ex, ey, bit]) => { const n = run.tiles[i + ey * W + ex]; if (n !== k && !wallLike(n)) e |= bit; }); return e; };
      if (t === T.ICE) ctx.drawImage(softEdged(sprites.ice, edge(T.ICE)), dx, dy);
      if (t === T.GRASS) ctx.drawImage(softEdged(ts.bed, edge(T.GRASS)), dx, dy);
      drawAO(ctx, run.tiles, x, y, dx, dy);
      if (t === T.FLOOR) {
        const pr = props[i];
        if (pr) drawProp(ctx, bio, pr, x, y, dx, dy, time, lights);
        else { const h = hash(x, y, run.seed + run.floor * 7); if (h % 9 === 0) ctx.drawImage(ts.decals[(h >>> 8) % ts.decals.length], dx, dy); }
      }
      if (t === T.GRASS) ctx.drawImage(ts.grass[(x * 5 + y * 3) % 3], dx, dy);
      else if (t === T.BURNT) ctx.drawImage(softEdged(ts.burnt, edge(T.BURNT)), dx, dy);
      floorTiles.push(i);
    }
  }
  // Spuren am Boden liegen über dem Boden, aber unter Gegenständen, Fallen und Figuren
  drawDecals(ctx, run, ox, oy, lights, time, dt);
  if (fx) drawFog(ctx, bio, run.tiles, run.vis, x0, y0, x1, y1, ox, oy, time, VW, VH);
  for (const i of floorTiles) {
    const x = i % W, y = (i / W) | 0, t = run.tiles[i], dx = x * TS + ox, dy = y * TS + oy;
    const s = TILE_SPR[t];
    if (t === T.CRATE_ON) ctx.drawImage(sprites.plate, dx, dy);
    const sh = OBJ_SHADOW[t];
    if (sh) dropShadow(ctx, dx + 8, dy + sh[0], sh[1]);
    if (s) ctx.drawImage(sprites[s], dx, dy);
    if (t === T.CRATE_ON) { ctx.fillStyle = 'rgba(255,205,117,0.3)'; ctx.fillRect(dx + 1, dy + 1, 14, 14); }
    if (t === T.GOAL) { ctx.fillStyle = `rgba(115,239,247,${0.15 + 0.1 * Math.sin(time * 4)})`; ctx.fillRect(dx, dy, TS, TS); lights.push({ x, y, r: 2.2, col: '#73eff7', a: 0.8 }); }
    if (t === T.FOUNTAIN) lights.push({ x, y, r: 2.4, col: '#41a6f6', a: 0.7 });
    if (t === T.RUNE && run.puzzle) {
      const z = run.puzzle, k = z.runes[i];
      ctx.globalAlpha = z.dead ? 0.3 : 1;
      ctx.drawImage(sprites[`rune${k}${z.pressed.includes(k) || z.solved ? '_on' : ''}`], dx, dy);
      ctx.globalAlpha = 1;
    }
    if (t === T.BARREL && run.fuses.has(i) && Math.floor(time * 10) % 2) {
      ctx.fillStyle = '#ffcd75'; ctx.fillRect(dx + 7, dy - 1, 2, 2);
      ctx.fillStyle = '#ef7d57'; ctx.fillRect(dx + 6, dy, 1, 1); ctx.fillRect(dx + 9, dy - 2, 1, 1);
    }
    if (run.fire.has(i) && run.vis[i]) {
      ctx.drawImage(sprites[Math.floor(time * 8 + x + y) % 2 ? 'fire_a' : 'fire_b'], dx, dy - 2);
      lights.push({ x, y, r: 3 * flick(i), col: '#ef7d57' });
    }
    if (t === T.ALTAR) lights.push({ x, y, r: 2.6 + 0.3 * Math.sin(time * 3), col: '#73eff7', a: 0.8 });
    if (t === T.STAIRS) lights.push({ x, y, r: 1.9 + 0.2 * Math.sin(time * 2), col: '#94b0c2', a: 0.8 }); // Wegweiser nach unten
  }
  for (const t of run.traps) ctx.drawImage(sprites.trap, t.x * TS + ox, t.y * TS + oy);
  drawDying(ctx, run, ox, oy, lights, dt);

  // Status auf dem Sprite: Betäubung, Brand, Gift, Spröde, Schutzwall
  const statusFx = (a: Actor, isP: boolean, dx: number, dy: number, w: number, h: number, q: { x: number; y: number }) => {
    const cx = dx + w / 2, mk = new Set(statusMarks(a, isP));
    if (mk.has('stun')) {
      for (let k = 0; k < 3; k++) {
        const ang = time * 5 + (k * Math.PI * 2) / 3, sx2 = Math.round(cx + Math.cos(ang) * 6) - 1, sy2 = Math.round(dy - 3 + Math.sin(ang) * 2);
        ctx.fillStyle = Math.sin(ang) > 0 ? '#ffcd75' : '#c98a3a';
        ctx.fillRect(sx2, sy2, 3, 1); ctx.fillRect(sx2 + 1, sy2 - 1, 1, 3);
      }
    }
    if (mk.has('brand')) {
      if (Math.random() < dt * 14) bits.push({ x: q.x * TS + 3 + Math.random() * 10, y: q.y * TS + 14 - h + Math.random() * h * 0.8, vx: (Math.random() - 0.5) * 6, vy: -14 - Math.random() * 10, col: Math.random() < 0.6 ? '#ef7d57' : '#ffcd75', t: 0, g: -25 });
      lights.push({ x: q.x, y: q.y, r: 1.4, col: '#ef7d57', a: 0.5 });
    }
    if (mk.has('gift') && Math.random() < dt * 7) bits.push({ x: q.x * TS + 4 + Math.random() * 8, y: q.y * TS + 12 - Math.random() * h * 0.6, vx: (Math.random() - 0.5) * 4, vy: -8 - Math.random() * 6, col: Math.random() < 0.5 ? '#38b764' : '#a7f070', t: 0, g: -6 });
    if (mk.has('sproede')) {
      ctx.fillStyle = '#73eff7';
      ctx.fillRect(dx + 1, dy + 3, 1, 3); ctx.fillRect(dx, dy + 4, 3, 1);
      ctx.fillRect(dx + w - 2, dy + h - 6, 1, 3); ctx.fillRect(dx + w - 3, dy + h - 5, 3, 1);
    }
    if (mk.has('wall')) {
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(time * 6);
      ctx.fillStyle = '#94b0c2';
      for (let k = 0; k < 20; k++) { const ang = (k / 20) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(ang) * 10), Math.round(dy + h / 2 + 1 + Math.sin(ang) * 9), 1, 1); }
      ctx.globalAlpha = 1;
    }
  };
  // Warnung: dieser Gegner kann im nächsten Gegnerzug zuschlagen oder schießen
  const warn = (m: Actor, q: { x: number; y: number }, dx: number, dy: number, w: number) => {
    const th = threatOf(run, m);
    if (!th) return;
    const shot = th === 'shot';
    const blink = 0.55 + 0.45 * Math.sin(time * 8 + m.id);
    if (shot) {
      // gestrichelte Ziellinie vom Schützen zum Helden
      const x0 = q.x * TS + 8, y0 = q.y * TS + 6, x1 = pp.x * TS + 8, y1 = pp.y * TS + 7, n = Math.hypot(x1 - x0, y1 - y0);
      ctx.globalAlpha = 0.45 * blink + 0.3; ctx.fillStyle = '#b13e53';
      for (let k = 6; k < n - 4; k += 4) { if (((k / 4) | 0) % 2) continue; ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n) + ox, Math.round(y0 + ((y1 - y0) * k) / n) + oy, 2, 1); }
      ctx.globalAlpha = 1;
    }
    const wx = dx + w / 2 - 1, wy = dy - 12 + (m.hp < m.maxHp ? -3 : 0) + (m.st.stun ? -3 : 0);
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(wx - 1, wy - 1, 4, 9);
    ctx.fillStyle = shot ? '#ef7d57' : '#b13e53'; ctx.fillRect(wx, wy, 2, 5); ctx.fillRect(wx, wy + 6, 2, 2);
    ctx.globalAlpha = 1;
  };
  const actor = (a: Actor, q: { x: number; y: number }) => {
    // Blickrichtung wählt die Ansicht, Bewegung die Schrittbilder
    const f = a === p ? p.dir : a.f ?? [0, 1];
    const v = f[1] < 0 ? 'b' : f[1] > 0 ? 'f' : 's', mirror = v === 's' && f[0] < 0;
    const moving = Math.abs(q.x - a.x) + Math.abs(q.y - a.y) > 0.04;
    const fr = moving ? [2, 0, 3, 0][Math.floor(time * 11) % 4] : Math.floor(time * 2.5 + a.id * 0.37) % 2;
    // Bosse zeigen ab halber Lebenskraft ihre verwundete Fassung (nur gelesen, keine Logik)
    const base = a === p ? lookOf(p) : a.boss && a.hp * 2 < a.maxHp && sprites[`${a.kind}2:f0`] ? `${a.kind}2` : a.kind, ps = poses.get(a.id);
    // Tod des Helden: einknicken, kippen, liegen bleiben; sonst Pose (Angriff/Zauber) vor Schrittbild
    let frame = `${base}:${v}${fr}`;
    if (a === p && deathT >= 0) frame = `${base}:${v}d${deathT < 0.14 ? 0 : deathT < 0.3 ? 1 : 2}`;
    else if (ps && sprites[`${base}:${v}${ps.k}`]) frame = `${base}:${v}${ps.k}`;
    const img = sprites[frame];
    const l = lunges.get(a.id), k = l ? Math.sin((l.t / LUNGE_T) * Math.PI) * 6 : 0;
    const glow = GLOW[base.split(':')[0]] ?? GLOW[a.kind];
    const jx = glow ? Math.round(Math.sin(time * 17 + a.id) * 0.6) : 0;
    const bx = Math.round(q.x * TS + (l ? l.dx * k : 0)) + ox, by = Math.round(q.y * TS + (l ? l.dy * k : 0)) + oy;
    const dx = bx + 8 - img.width / 2 + jx, dy = by + 14 - img.height;
    const blit = (c: HTMLCanvasElement) => {
      if (!mirror) { ctx.drawImage(c, dx, dy); return; }
      ctx.save(); ctx.translate(dx + c.width, dy); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0); ctx.restore();
    };
    // Bodenschatten; Flieger werfen einen kleineren, atmenden Schatten
    const fly = FLY.has(a.kind), foot = by + 14;
    if (fly) dropShadow(ctx, bx + 8, foot, 8 + (Math.sin(time * 5 + a.id) > 0 ? 2 : 0), glow ? 0.5 : 0.8);
    else dropShadow(ctx, bx + 8, foot, a.boss ? 22 : 12, glow ? 0.5 : 1);
    // Ausweichen: Held flackert halbdurchsichtig
    if (statusMarks(a, a === p).includes('dodge')) ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 18);
    blit(img);
    ctx.globalAlpha = 1;
    if (glow) {
      // Feuerwesen flimmern, werfen Licht und verlieren Funken
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.07 + 0.07 * Math.sin(time * 13 + a.id);
      blit(masks[frame]);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      lights.push({ x: q.x, y: q.y, r: glow[0] * flick(a.id), col: glow[1] });
      // zweite Phase des Schmiedefürsten: dichte Feueraura um den ganzen Leib
      const aura = base === 'fuerst2';
      for (let n = aura ? 3 : 1; n > 0; n--) if (Math.random() < dt * 9) bits.push({ x: (q.x * TS) + (aura ? -4 + Math.random() * 24 : 4 + Math.random() * 8), y: q.y * TS + (aura ? -8 + Math.random() * 20 : 2 + Math.random() * 6), vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 14, col: Math.random() < 0.5 ? '#ffcd75' : '#ef7d57', t: 0, g: -10 });
    }
    if (a === p && p.gear[2] && v === 'f') { ctx.fillStyle = RARITY_COL[p.gear[2].rar]; ctx.fillRect(dx + 7, dy + 9, 2, 1); ctx.fillRect(dx + 7, dy + 10, 2, 1); }
    if (a.elite) {
      ctx.fillStyle = '#ffcd75';
      ctx.fillRect(dx + 5, dy - 3, 1, 2); ctx.fillRect(dx + 8, dy - 4, 1, 3); ctx.fillRect(dx + 11, dy - 3, 1, 2); ctx.fillRect(dx + 5, dy - 1, 7, 1);
      lights.push({ x: q.x, y: q.y, r: 1.8, col: '#ffcd75', a: 0.6 });
    }
    const fl = flashes.get(a.id);
    if (fl) { ctx.globalAlpha = Math.min(1, fl / FLASH_T + 0.2); blit(masks[frame]); ctx.globalAlpha = 1; }
    statusFx(a, a === p, dx, dy, img.width, img.height, q);
    if (a !== p) warn(a, q, dx, dy, img.width);
    if (run.target && a.id === run.target) {
      ctx.fillStyle = '#ffcd75';
      for (const [cx, cy] of [[0, 0], [13, 0], [0, 13], [13, 13]]) { ctx.fillRect(bx + cx, by + cy, 3, 1); ctx.fillRect(bx + (cx ? 15 : 0), by + cy - (cy ? 2 : 0), 1, 3); }
    }
    if (a !== p && a.hp < a.maxHp) {
      const w = a.boss ? 24 : 12, hx = bx + 8 - w / 2, hy = dy - 4;
      ctx.fillStyle = '#0d0e17'; ctx.fillRect(hx - 1, hy - 1, w + 2, 4);
      ctx.fillStyle = '#b13e53'; ctx.fillRect(hx, hy, Math.ceil(w * a.hp / a.maxHp), 2);
    }
  };
  const order = run.mobs.filter(m => run.vis[m.y * W + m.x]).map(m => [m, smooth(m, dt)] as const);
  for (const m of run.mobs) if (!run.vis[m.y * W + m.x]) smooth(m, dt);
  order.sort((a, b) => a[1].y - b[1].y);
  lights.push({ x: pp.x, y: pp.y, r: 6.4 * flick(0.5), col: p.st.stark ? '#b13e53' : undefined });
  if (p.st.stark) lights.push({ x: pp.x, y: pp.y, r: 2.5, col: '#ef7d57', a: 0 });
  let drawn = false;
  for (const [m, q] of order) {
    if (!drawn && q.y > pp.y) { actor(p, pp); drawn = true; }
    actor(m, q);
  }
  if (!drawn) actor(p, pp);
  // Bossaura (der Schmiedefürst glüht ohnehin)
  for (const [m, q] of order) if (m.boss && !GLOW[m.kind]) lights.push({ x: q.x, y: q.y, r: 3.2, col: BOSS_FLAME[bio][0], a: 0.5 });
  // Schwebeteilchen: Staub, Sporen, Asche liegen im Lichtschein
  if (fx) { stepAmbient(bio, run.tiles, run.vis, x0, y0, x1, y1, dt); drawAmbient(ctx, ox, oy, false); }

  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.t += dt;
    if (b.t > 0.55) { bits.splice(i, 1); continue; }
    b.vy += (b.g ?? 220) * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    ctx.globalAlpha = 1 - b.t / 0.55;
    ctx.fillStyle = b.col; ctx.fillRect(Math.round(b.x) + ox, Math.round(b.y) + oy, 2, 2);
  }
  ctx.globalAlpha = 1;
  for (let i = booms.length - 1; i >= 0; i--) {
    const b = booms[i];
    b.t += dt;
    if (b.t > 0.32) { booms.splice(i, 1); continue; }
    const f = b.t / 0.32, cx = b.x * TS + 8 + ox, cy = b.y * TS + 8 + oy, rad = (b.r + 0.5) * TS * (0.4 + 0.6 * f);
    for (let yy = -rad; yy <= rad; yy += 2) for (let xx = -rad; xx <= rad; xx += 2) {
      const d = Math.hypot(xx, yy) / rad;
      if (d > 1 || d < f * 0.9 - 0.25) continue;
      ctx.fillStyle = d < 0.45 ? '#f4f4f4' : d < 0.75 ? '#ffcd75' : '#ef7d57';
      ctx.globalAlpha = 1 - f * f;
      ctx.fillRect(Math.round(cx + xx), Math.round(cy + yy), 2, 2);
    }
  }
  ctx.globalAlpha = 1;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.t += dt;
    if (b.t > 0.16) { bolts.splice(i, 1); continue; }
    const steps = 18, head = b.t / 0.16;
    ctx.fillStyle = b.col;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      if (f > head || f < head - 0.45) continue;
      ctx.fillRect(Math.round((b.x0 + (b.x1 - b.x0) * f) * TS + 7) + ox, Math.round((b.y0 + (b.y1 - b.y0) * f) * TS + 6) + oy, 2, 2);
    }
  }
  // Geschosse der Fähigkeiten: Feuerball, Pfeile, Zielschuss
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.t += dt;
    const done = s.t >= s.dur, f = Math.min(1, s.t / s.dur);
    const hx = (s.x0 + (s.x1 - s.x0) * f) * TS + 8, hy = (s.y0 + (s.y1 - s.y0) * f) * TS + 7;
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0) || 1, ux = (s.x1 - s.x0) / len, uy = (s.y1 - s.y0) / len;
    if (done) {
      shots.splice(i, 1);
      if (s.kind === 'fire') {
        booms.push({ x: s.x1, y: s.y1, r: s.r, t: 0 }); sfx('boom');
        burstBits(hx, hy, 12 + s.r * 8, ['#ffcd75', '#ef7d57', '#b13e53'], 30, 90, 30);
      } else {
        sparks.push({ x: hx, y: hy, col: s.col, big: s.kind === 'heavy', t: 0 });
        burstBits(hx, hy, s.kind === 'heavy' ? 8 : 3, [s.col, '#f4f4f4'], 30, 70, 10);
      }
      continue;
    }
    if (s.kind === 'fire') {
      if (Math.random() < dt * 70) bits.push({ x: hx - ux * 3 + (Math.random() - 0.5) * 3, y: hy - uy * 3 + (Math.random() - 0.5) * 3, vx: -ux * 15 + (Math.random() - 0.5) * 12, vy: -uy * 15 - 8, col: Math.random() < 0.5 ? '#ef7d57' : '#ffcd75', t: 0, g: -20 });
      ctx.fillStyle = '#b13e53'; ctx.fillRect(Math.round(hx - 3) + ox, Math.round(hy - 3) + oy, 6, 6);
      ctx.fillStyle = '#ef7d57'; ctx.fillRect(Math.round(hx - 2) + ox, Math.round(hy - 3) + oy, 4, 6); ctx.fillRect(Math.round(hx - 3) + ox, Math.round(hy - 2) + oy, 6, 4);
      ctx.fillStyle = '#ffcd75'; ctx.fillRect(Math.round(hx - 1) + ox, Math.round(hy - 1) + oy, 3, 3);
      lights.push({ x: hx / TS - 0.5, y: hy / TS - 0.5, r: 3, col: '#ef7d57' });
    } else {
      const tail = s.kind === 'heavy' ? 26 : 10;
      for (let k = 0; k <= tail; k += 2) {
        ctx.globalAlpha = s.kind === 'heavy' ? 1 - k / tail : 1;
        ctx.fillStyle = k < 3 ? '#f4f4f4' : s.col;
        ctx.fillRect(Math.round(hx - ux * k) + ox, Math.round(hy - uy * k) + oy, s.kind === 'heavy' && k < 6 ? 2 : 1, s.kind === 'heavy' && k < 6 ? 2 : 1);
      }
      ctx.globalAlpha = 1;
      if (s.kind === 'heavy') lights.push({ x: hx / TS - 0.5, y: hy / TS - 0.5, r: 2, col: s.col, a: 0.7 });
    }
  }
  // Trefferblitz: Kreuz mit Strahlen
  for (let i = sparks.length - 1; i >= 0; i--) {
    const k = sparks[i];
    k.t += dt;
    if (k.t > SPARK_T) { sparks.splice(i, 1); continue; }
    const f = k.t / SPARK_T, n = Math.round((k.big ? 7 : 4) * (0.5 + f)), cx = Math.round(k.x) + ox, cy = Math.round(k.y) + oy;
    ctx.globalAlpha = 1 - f;
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(cx - n, cy, n * 2 + 1, 1); ctx.fillRect(cx, cy - n, 1, n * 2 + 1);
    if (k.big) { ctx.fillStyle = k.col; for (let d = 2; d < n; d += 2) for (const [sx2, sy2] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ctx.fillRect(cx + sx2 * d, cy + sy2 * d, 1, 1); ctx.fillRect(cx - 1, cy - 1, 3, 3); }
    ctx.globalAlpha = 1;
    lights.push({ x: k.x / TS - 0.5, y: k.y / TS - 0.5, r: k.big ? 2.6 : 1.4, col: k.col, a: 0.8 });
  }
  // Frostnova: wachsender Eisring
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    g.t += dt;
    if (g.t > RING_T) { rings.splice(i, 1); continue; }
    const f = g.t / RING_T, rad = (g.r + 0.5) * TS * (0.15 + 0.85 * Math.sqrt(f)), cx = g.x * TS + 8 + ox, cy = g.y * TS + 8 + oy;
    const steps = Math.max(24, Math.round(rad * 1.6));
    ctx.globalAlpha = 1 - f * f;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2, px = Math.round(cx + Math.cos(a) * rad), py = Math.round(cy + Math.sin(a) * rad);
      ctx.fillStyle = k % 3 ? '#73eff7' : '#f4f4f4'; ctx.fillRect(px, py, 2, 2);
      if (k % 4 === 0) { ctx.fillStyle = '#41a6f6'; ctx.fillRect(Math.round(cx + Math.cos(a) * (rad - 3)), Math.round(cy + Math.sin(a) * (rad - 3)), 1, 1); }
    }
    ctx.fillStyle = 'rgba(115,239,247,0.12)';
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    lights.push({ x: g.x, y: g.y, r: 2 + (g.r + 1) * f * 1.5, col: '#73eff7', a: 0.9 });
  }
  // Schildstoß: Aufprall-Halbmond und Schlaglinien
  for (let i = bashes.length - 1; i >= 0; i--) {
    const b = bashes[i];
    b.t += dt;
    if (b.t > BASH_T) { bashes.splice(i, 1); continue; }
    const f = b.t / BASH_T, base = Math.atan2(b.dy, b.dx), cx = b.x * TS + 8 - b.dx * 6 + ox, cy = b.y * TS + 8 - b.dy * 6 + oy, rad = 5 + f * 9;
    ctx.globalAlpha = 1 - f;
    for (let k = -6; k <= 6; k++) {
      const a = base + k * 0.22;
      ctx.fillStyle = Math.abs(k) < 3 ? '#f4f4f4' : '#94b0c2';
      ctx.fillRect(Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad), 2, 2);
    }
    ctx.fillStyle = '#ffcd75';
    for (const k of [-0.7, 0, 0.7]) {
      const a = base + k;
      for (let d = 0; d < 4; d++) ctx.fillRect(Math.round(cx + Math.cos(a) * (rad + 3 + d)), Math.round(cy + Math.sin(a) * (rad + 3 + d)), 1, 1);
    }
    ctx.globalAlpha = 1;
    lights.push({ x: b.x, y: b.y, r: 2, col: '#f4f4f4', a: 0.6 });
  }
  // Gegnerangriff: Krallen-/Klingenhieb über dem Helden
  for (let i = swipes.length - 1; i >= 0; i--) {
    const w = swipes[i];
    w.t += dt;
    if (w.t > SWIPE_T) { swipes.splice(i, 1); continue; }
    const f = w.t / SWIPE_T, cx = w.x * TS + 8 + ox, cy = w.y * TS + 7 + oy, len = w.big ? 11 : 7;
    // Hieb quer zur Angriffsrichtung, wandert von einer Seite zur anderen
    const px = -w.dy || 0.7, py = w.dx || 0.7, nl = Math.hypot(px, py), ux = px / nl, uy = py / nl, fx = w.dx * 0.6, fy = w.dy * 0.6;
    const head = Math.min(1, f * 2.2);
    ctx.globalAlpha = f < 0.5 ? 1 : 1 - (f - 0.5) * 2;
    for (const off of w.big ? [-4, 0, 4] : [-3, 0, 3]) {
      for (let k = -len; k <= len; k++) {
        const g = (k + len) / (2 * len);
        if (g > head) continue;
        const bend = (1 - (k / len) ** 2) * 2;
        ctx.fillStyle = Math.abs(k) < len * 0.5 ? '#f4f4f4' : '#b13e53';
        ctx.fillRect(Math.round(cx + ux * k + fx * off + w.dx * bend), Math.round(cy + uy * k + fy * off + w.dy * bend - (off * (1 - Math.abs(fx)))), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
  for (const b of booms) lights.push({ x: b.x, y: b.y, r: 6 * (1 - b.t / 0.32) + 1, col: '#ffcd75' });
  for (const b of bolts) lights.push({ x: b.x1, y: b.y1, r: 2, col: b.col === '#1a1c2c' ? undefined : b.col, a: 0.7 });
  const amb = AMBIENTS[bio];
  applyLight(ctx, run, lights, ox, oy, boss ? { ...amb, dark: Math.min(0.9, amb.dark + 0.05) } : amb, VW, VH, fx);
  if (fx) drawAmbient(ctx, ox, oy, true); // Glutfunken leuchten selbst
  postFx(ctx, bio, VW, VH);
  // Schadenszahlen über der Dunkelheit, damit sie lesbar bleiben
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i];
    n.t += dt;
    if (n.t > 0.8) { nums.splice(i, 1); continue; }
    text(ctx, n.s, n.x + ox, n.y + oy - 6 - n.t * 22, n.col, 10, 'center');
  }
  if (p.hp / p.maxHp < 0.3 && run.mode === 'play') {
    ctx.fillStyle = `rgba(177,62,83,${0.08 + 0.06 * Math.sin(time * 6)})`; ctx.fillRect(0, 0, VW, VH);
  }

  tooltip(ctx, run, ox - sx, oy - sy);
  if (loot) { loot.t += dt; if (loot.t > 7) loot = null; }
  hud(ctx, run, time);
  if (mapMode) minimap(ctx, run, time);
  if (overlay === 'char') charSheet(ctx, run);
  else if (overlay === 'help') helpSheet(ctx);
  else if (overlay === 'log') logSheet(ctx, run);
  else if (overlay === 'inv') invSheet(ctx, run, time);
  if (run.mode === 'perk') perkOverlay(ctx, run);
  if (run.mode === 'tree') treeOverlay(ctx, run);
  if (run.mode === 'shop') shopOverlay(ctx, run);
  if (deathT >= 0 && run.mode === 'dead') {
    deathT += dt;
    const f = Math.min(1, deathT / DEATH_T);
    ctx.fillStyle = `rgba(177,62,83,${Math.max(0, 0.45 - deathT * 0.9)})`; ctx.fillRect(0, 0, VW, VH);
    const g = ctx.createRadialGradient(VW / 2, VH / 2, 40, VW / 2, VH / 2, VW * 0.65);
    g.addColorStop(0, 'rgba(13,14,23,0)'); g.addColorStop(1, `rgba(13,14,23,${0.85 * f})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
  if (run.mode === 'win' || (run.mode === 'dead' && (deathT < 0 || deathT > DEATH_T))) endOverlay(ctx, run);
}

// ---- Oberfläche ----
type Overlay = 'none' | 'char' | 'help' | 'inv' | 'log';
let overlay: Overlay = 'none';
export const getOverlay = () => overlay;
export const setOverlay = (o: Overlay) => { overlay = o; };

interface Slot { key: string; icon: string; name: string; desc: string; cost: string; count: string; ok: boolean; gap?: number; }

function slots(run: Run): Slot[] {
  const p = run.p, c = CLASSES[p.cls], out: Slot[] = [];
  if (c.range) out.push({ key: 'F', icon: `i_${p.cls}_shot`, name: c.shot, desc: `Fernangriff, ${shotRange(p)} Felder. Kostet nichts.`, cost: '', count: '', ok: true });
  c.skills.forEach((s, k) => out.push({ key: `${k + 1}`, icon: `i_${p.cls}${k}`, name: p.skillLvl[k] ? `${s.name} ${RANKS[p.skillLvl[k]]}` : s.name, desc: `${s.desc}.${skillModName(p, k) ? ` ${tr(skillModName(p, k))}.` : ''} Kostet ${skillCost(p, k)} ${c.resName}.`, cost: `${skillCost(p, k)}`, count: '', ok: skillReady(p, k) }));
  (p.spells ?? []).forEach((id, k) => { const sp = NEW_SKILLS[id], i = 3 + k; out.push({ key: `${4 + k}`, icon: `i_${p.cls}${sp.branch}`, name: sp.name, desc: `${sp.desc}. Kostet ${skillCost(p, i)} ${c.resName}.`, cost: `${skillCost(p, i)}`, count: '', ok: skillReady(p, i) }); });
  if (p.lvl >= ULT_LEVEL) out.push({ key: 'U', gap: 5, icon: 'ult', name: ULT[p.cls].name, desc: `${ULT[p.cls].desc}. Danach ${ULT[p.cls].cost} Züge Pause.`, cost: '', count: p.ultCd ? `${p.ultCd}` : '', ok: !p.ultCd });
  out.push({ key: 'Q', gap: 5, icon: 'potion', name: 'Heiltrank', desc: 'Heilt einen großen Teil deines Lebens, löscht Gift und Brand.', cost: '', count: `${p.potions}`, ok: p.potions > 0 });
  out.push({ key: 'B', gap: 5, icon: 'bomb', name: 'Bombe', desc: 'Sprengt Gegner, rissige Wände und Säulen. Halte Abstand.', cost: '', count: `${p.bombs}`, ok: p.bombs > 0 });
  // Verbrauchsgegenstände erscheinen nur, solange man welche trägt
  USE_ORDER.forEach((id, k) => { const n = p.bag.filter(it => it.use === id).length; if (n) out.push({ key: `${(k + 7) % 10}`, gap: 10, icon: `i_${id}`, name: CONSUMABLES[id].name, desc: `${CONSUMABLES[id].desc}.`, cost: '', count: `${n}`, ok: true }); });
  return out;
}

const STATUS: [string, string, string][] = [['brand', 'Brand', '#ef7d57'], ['gift', 'Gift', '#38b764'], ['stark', 'Kriegsschrei', '#b13e53'], ['wall', 'Bollwerk', '#41a6f6'], ['dodge', 'Ausweichen', '#94b0c2'], ['konter', 'Konter', '#ffcd75']];

let logSeen = '', logAt = 0;

function hud(ctx: CanvasRenderingContext2D, run: Run, time: number) {
  const p = run.p, c = CLASSES[p.cls];
  // Spieler: eine schmale Zeile oben links
  ctx.globalAlpha = under(0, 0, 206, 22) ? 0.25 : 1;
  ctx.fillStyle = 'rgba(8,9,15,0.6)'; ctx.fillRect(2, 2, 202, 18);
  ctx.fillStyle = '#1c2033'; ctx.fillRect(3, 3, 16, 16);
  ctx.drawImage(sprites[lookOf(p)], 0, 1, 16, 16, 3, 3, 16, 16);
  bar(ctx, 23, 4, 82, 9, p.hp / p.maxHp, p.hp / p.maxHp < 0.3 ? '#ef7d57' : '#b13e53');
  text(ctx, `${p.hp}/${p.maxHp}`, 64, 5, '#f4f4f4', 8, 'center');
  bar(ctx, 109, 4, 62, 9, p.res / p.resMax, c.resCol);
  text(ctx, `${p.res}/${p.resMax}`, 140, 5, '#f4f4f4', 8, 'center');
  bar(ctx, 23, 16, 148, 2, p.exp / xpNeed(p.lvl), '#ffcd75');
  text(ctx, `St.${p.lvl}`, 201, 7, '#ffcd75', 8, 'right');
  ctx.globalAlpha = 1;
  if (p.pts > 0 && run.mode === 'play') {
    const label = tr(`[K] ${p.pts} Fertigkeitspunkt${p.pts > 1 ? 'e' : ''}`), w = label.length * 6 + 10;
    panel(ctx, 208, 2, w, 18, '#a7f070', `rgba(13,14,23,${0.75 + 0.2 * Math.sin(time * 4)})`);
    text(ctx, label, 213, 7, '#a7f070', 8);
  }
  // Zustände als kleine Marken
  let sx = 3;
  for (const [id, name, col] of STATUS) {
    if (!p.st[id]) continue;
    const label = tr(`${name} ${p.st[id]}`), w = label.length * 6 + 8;
    panel(ctx, sx, 24, w, 13, col);
    text(ctx, label, sx + 4, 27, col, 8);
    sx += w + 3;
  }
  const z = run.puzzle;
  if (z && z.kind === 'arena' && z.started && !z.solved && !z.dead) text(ctx, `Prüfung: noch ${z.timer} Züge`, VW / 2, 60, '#b13e53', 10, 'center');

  // Ebene und Vorräte: eine Zeile oben rechts
  const parts: [string | null, string, string][] = [[null, `[I] ${p.bag.length}/${BAG_MAX}`, p.bag.length >= BAG_MAX ? '#ef7d57' : p.bag.length ? '#ffcd75' : '#566c86']];
  if (p.keys) parts.push(['key', `${p.keys}`, '#ffcd75']);
  parts.push(['coin', `${p.gold}`, '#ffcd75'], ['soul', `${run.souls}`, '#73eff7'], [null, `Ebene ${run.floor}/15`, '#f4f4f4']);
  const widths = parts.map(([ic, s]) => (ic ? 13 : 0) + tr(s).length * 6), total = widths.reduce((a, b) => a + b + 9, 0);
  ctx.globalAlpha = under(VW - total - 4, 0, total + 4, 20) ? 0.25 : 1;
  ctx.fillStyle = 'rgba(8,9,15,0.6)'; ctx.fillRect(VW - total - 2, 2, total, 15);
  let rx = VW - 6;
  parts.forEach(([ic, s, col], k) => {
    rx -= widths[k];
    if (ic) ctx.drawImage(sprites[ic], rx, 3);
    text(ctx, s, rx + (ic ? 13 : 0), 6, col, 8);
    rx -= 9;
  });
  ctx.globalAlpha = 1;

  // Schnellleiste
  const sl = slots(run), S = 22, gap = 3, x0 = (VW - sl.length * S - (sl.length - 1) * gap) >> 1, y0 = VH - S - 4;
  let hover: Slot | null = null;
  sl.forEach((s, i) => {
    const x = x0 + i * (S + gap) + (s.gap ?? 0);
    const over = mouse.x >= x && mouse.x < x + S && mouse.y >= y0 && mouse.y < y0 + S;
    if (over) hover = s;
    panel(ctx, x, y0, S, S, over ? '#ffcd75' : s.ok ? '#566c86' : '#333c57', s.ok ? 'rgba(28,32,51,0.92)' : 'rgba(13,14,23,0.92)');
    ctx.globalAlpha = s.ok ? 1 : 0.3;
    if (s.icon === 'ult') {
      ctx.fillStyle = c.resCol; ctx.fillRect(x + 10, y0 + 4, 2, 14); ctx.fillRect(x + 4, y0 + 10, 14, 2);
      ctx.fillRect(x + 6, y0 + 6, 2, 2); ctx.fillRect(x + 14, y0 + 6, 2, 2); ctx.fillRect(x + 6, y0 + 14, 2, 2); ctx.fillRect(x + 14, y0 + 14, 2, 2);
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(x + 9, y0 + 9, 4, 4);
    } else ctx.drawImage(sprites[s.icon], x + 5, y0 + 5);
    ctx.globalAlpha = 1;
    text(ctx, s.key, x + 2, y0 + 1, s.ok ? '#ffcd75' : '#566c86', 8, 'left', false);
    const tag = s.cost || s.count;
    if (tag) {
      text(ctx, tag, x + S - 1, y0 + S - 8, !s.ok ? '#566c86' : s.cost ? c.resCol : '#f4f4f4', 8, 'right', false);
    }
  });
  if (hover) {
    const h = hover as Slot, lines = wrapText(h.desc, 44), w = Math.max(tr(h.name).length * 6, ...lines.map(l => l.length * 6)) + 14, hh = 20 + lines.length * 10;
    const x = Math.max(4, Math.min(VW - w - 4, mouse.x - w / 2));
    panel(ctx, x, y0 - hh - 4, w, hh, '#ffcd75');
    text(ctx, h.name, x + 6, y0 - hh + 1, '#ffcd75');
    lines.forEach((l, k) => text(ctx, l, x + 6, y0 - hh + 13 + k * 10, '#94b0c2', 8));
  }

  // Meldungen: ganze Sätze mit Umbruch, über der Schnellleiste; lange bleiben länger stehen
  const msgs = run.log.slice(-3), last = msgs[msgs.length - 1] ?? '', sig = `${run.log.length}:${last}`;
  if (sig !== logSeen) { logSeen = sig; logAt = time; }
  const hold = 4 + tr(last).length * 0.05, age = time - logAt, la = age < hold ? 1 : Math.max(0, 1 - (age - hold));
  if (msgs.length && la > 0) {
    let rows: [string, boolean][] = [];
    msgs.forEach((m, k) => { for (const l of wrapText(m, 56)) rows.push([l, k === msgs.length - 1]); });
    const mine = rows.filter(r => r[1]).length;
    rows = rows.slice(-Math.max(5, mine));
    const w = Math.max(...rows.map(r => r[0].length)) * 6 + 10, yy = y0 - 6 - rows.length * 10;
    ctx.globalAlpha = la * (under(0, yy - 4, w + 6, rows.length * 10 + 8) ? 0.25 : 1);
    ctx.fillStyle = 'rgba(8,9,15,0.6)'; ctx.fillRect(2, yy - 3, w, rows.length * 10 + 5);
    rows.forEach(([l, cur], k) => text(ctx, l, 6, yy + k * 10, cur ? '#f4f4f4' : '#94b0c2', 8));
    ctx.globalAlpha = 1;
  }

  if (loot && run.mode === 'play' && overlay === 'none') lootCard(ctx, run);

  if (tutorial && run.mode === 'play') {
    if (tutStep) {
      // Lehrgang: Fortschritt und Aufgabe, [T] überspringt
      const head = tr(`Lehrgang ${tutStep.k}/${tutStep.n}`), body = tr(tutStep.text), w = Math.max(head.length + 18, body.length) * 6 + 20;
      panel(ctx, (VW - w) >> 1, 36, w, 28, '#73eff7', 'rgba(13,14,23,0.85)');
      text(ctx, head, (VW - w) / 2 + 8, 40, '#73eff7', 8);
      text(ctx, '[T] überspringen', (VW + w) / 2 - 8, 40, '#566c86', 8, 'right');
      text(ctx, body, VW / 2, 52, '#ffcd75', 8, 'center');
    } else {
      const h0 = hint(run), h = h0 && tr(h0);
      if (h) { const w = h.length * 6 + 16; panel(ctx, (VW - w) >> 1, 38, w, 16, '#ffcd75'); text(ctx, h, VW / 2, 43, '#ffcd75', 8, 'center'); }
    }
  }
  const boss = run.mobs.find(m => m.boss && m.awake);
  if (boss) {
    panel(ctx, VW / 2 - 90, 4, 180, 22, '#b13e53', 'rgba(13,14,23,0.75)');
    text(ctx, boss.name, VW / 2, 7, '#ffcd75', 8, 'center');
    bar(ctx, VW / 2 - 82, 18, 164, 4, boss.hp / boss.maxHp, '#b13e53');
  }
}

// ---- Gegenstände ----
let loot: { item: Item; how: 'worn' | 'bag' | 'sold'; t: number } | null = null;
// Platz des zuletzt gefundenen Stücks im Rucksack, solange die Fundkarte sichtbar ist
export const lootIndex = (run: Run) => loot && loot.how === 'bag' ? run.p.bag.indexOf(loot.item) : -1;
export const lootDone = () => { if (loot) { loot.how = 'worn'; loot.t = Math.max(loot.t, 4.5); } };

const SLOT_ICON = [
  ['........#', '.......##', '......##.', '.....##..', '#...##...', '.#.##....', '..##.....', '.#.#.....', '#...#....'],
  ['##.....##', '###...###', '#########', '.#######.', '.#######.', '.#######.', '.#######.', '..#####..', '...###...'],
  ['.#.....#.', '#.......#', '#.......#', '.#.....#.', '..#...#..', '...###...', '..#####..', '..#####..', '...###...'],
  ['...###...', '..#####..', '...###...', '..#...#..', '.#.....#.', '.#.....#.', '.#.....#.', '..#...#..', '...###...'],
  ['...###...', '....#....', '....#....', '...###...', '..#####..', '.#######.', '.#######.', '.#######.', '..#####..'],
];
function slotIcon(ctx: CanvasRenderingContext2D, slot: number, x: number, y: number, col: string) {
  ctx.fillStyle = col;
  SLOT_ICON[slot].forEach((r, j) => { for (let i = 0; i < 9; i++) if (r[i] === '#') ctx.fillRect(x + i, y + j, 1, 1); });
}
function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, up: boolean) {
  ctx.fillStyle = up ? '#a7f070' : '#b13e53';
  for (let k = 0; k < 3; k++) ctx.fillRect(x + 2 - k, y + (up ? k : 4 - k), 1 + k * 2, 1);
  ctx.fillRect(x + 1, y + (up ? 3 : 0), 3, 2);
}
// Besser oder schlechter als das angelegte Stück? 1, 0, -1
const verdict = (run: Run, it: Item) => {
  if (it.use) return 0;
  const w = run.p.gear[it.slot], d = itemScore(it) - (w ? itemScore(w) : 0);
  return d > 0.4 ? 1 : d < -0.4 ? -1 : 0;
};
const STATS: ['atk' | 'def' | 'hp' | 'crit', string, string][] = [
  ['atk', 'Angriff', 'Mehr Schaden bei jedem Treffer.'], ['def', 'Vert.', 'Jeder Treffer gegen dich schadet weniger.'],
  ['hp', 'Leben', 'Erhöht dein maximales Leben.'], ['crit', 'Krit', 'Chance auf doppelten Schaden.'],
];
// Zeichnet Name, Art und alle Werte; "worn" ist das Vergleichsstück (null: Platz frei, undefined: kein Vergleich).
function itemDetail(ctx: CanvasRenderingContext2D, it: Item, x: number, y: number, chars: number, worn: Item | null | undefined, dry = false): number {
  const put = (s: string, px: number, py: number, col: string, al: 'left' | 'right' = 'left') => { if (!dry) text(ctx, s, px, py, col, 8, al); };
  let yy = y;
  put(it.name, x, yy, RARITY_COL[it.rar]); yy += 10;
  put(`${SLOT_NAMES[it.slot]} · ${it.uniq ? 'Einzigartig' : it.use ? 'einmalig' : RARITY[it.rar]}${it.cursed ? ' · verflucht' : ''}`, x, yy, '#566c86'); yy += 13;
  if (it.use) { for (const l of wrapText(CONSUMABLES[it.use].desc, chars)) { put(l, x, yy, '#f4f4f4'); yy += 10; } return yy - y; }
  for (const [k, label] of STATS) {
    const v = it[k], o = worn ? worn[k] : 0;
    if (!v && !o) continue;
    const fmt = (n: number) => k === 'crit' ? `${n > 0 ? '+' : ''}${Math.round(n * 100)} %` : `${n > 0 ? '+' : ''}${n}`;
    put(`${label} ${fmt(v)}`, x, yy, v ? '#f4f4f4' : '#566c86');
    const d = v - o;
    if (worn !== undefined && Math.abs(d) > 1e-9) {
      if (!dry) arrow(ctx, x + chars * 6 - 5, yy + 1, d > 0);
      put(fmt(d), x + chars * 6 - 8, yy, d > 0 ? '#a7f070' : '#b13e53', 'right');
    }
    yy += 10;
  }
  for (const [id, v] of it.aff ?? []) for (const l of wrapText(AFFIX[id](v), chars - 2)) { put(l, x, yy, '#73eff7'); yy += 10; }
  if (worn) for (const [id, v] of worn.aff ?? []) {
    if (it.aff?.some(a => a[0] === id)) continue;
    for (const l of wrapText(`Verliert: ${tr(AFFIX[id](v))}`, chars)) { put(l, x, yy, '#b13e53'); yy += 10; }
  }
  return yy - y;
}

// Kurz eingeblendete Karte für einen neuen Fund: was ist es, und ist es besser als das Angelegte?
function lootCard(ctx: CanvasRenderingContext2D, run: Run) {
  const L = loot!, it = L.item, p = run.p, w = 176, x = VW - w - 4, y = 66, chars = 27;
  const worn = L.how === 'bag' && !it.use ? p.gear[it.slot] ?? null : undefined;
  const h = 22 + itemDetail(ctx, it, 0, 0, chars, worn, true) + 14;
  ctx.globalAlpha = (L.t > 6 ? 7 - L.t : Math.min(1, L.t * 6)) * (under(x, y, w, h) ? 0.3 : 1);
  panel(ctx, x, y, w, h, RARITY_COL[it.rar], 'rgba(13,14,23,0.88)');
  if (it.use) ctx.drawImage(sprites[`i_${it.use}`], x + 4, y + 3); else drawItemIcon(ctx, it, p.cls, x + 6, y + 5, RARITY_COL[it.rar]);
  text(ctx, 'FUND', x + 20, y + 6, '#94b0c2', 8);
  const v = L.how === 'bag' ? verdict(run, it) : 0;
  if (v) { arrow(ctx, x + w - 12, y + 7, v > 0); text(ctx, v > 0 ? 'besser' : 'schlechter', x + w - 16, y + 6, v > 0 ? '#a7f070' : '#b13e53', 8, 'right'); }
  const dh = itemDetail(ctx, it, x + 7, y + 19, chars, worn);
  const foot = L.how === 'worn' ? 'Angelegt' : L.how === 'sold' ? 'Rucksack voll – verkauft' : it.use ? '[I] Rucksack: benutzen' : '[R] anlegen · [I] Rucksack';
  text(ctx, foot, x + 7, y + 22 + dh, L.how === 'worn' ? '#a7f070' : L.how === 'sold' ? '#b13e53' : '#ffcd75', 8);
  ctx.globalAlpha = 1;
}

// ---- Rucksack ----
const inv = { col: 1, row: 0 };
export function invMove(run: Run, dx: number, dy: number) {
  if (dx) inv.col = dx > 0 ? 1 : 0;
  const n = inv.col ? Math.max(1, run.p.bag.length) : 4;
  inv.row = Math.max(0, Math.min(n - 1, inv.row + dy));
}
// Aktion für die Auswahl: Eingabetaste (anlegen/ablegen/benutzen) oder Verkauf
export function invAction(run: Run, sell: boolean): import('../game/run').Action | null {
  const p = run.p;
  invMove(run, 0, 0);
  if (inv.col === 0) return !sell && p.gear[inv.row] ? { t: 'unequip', slot: inv.row } : null;
  if (!p.bag[inv.row]) return null;
  return sell ? { t: 'sell', i: inv.row } : { t: 'equip', i: inv.row };
}
export const invDrop = (run: Run): import('../game/run').Action | null => inv.col === 1 && run.p.bag[inv.row] ? { t: 'drop', i: inv.row } : null;
const lookOf = (p: Run['p']) => heroLook(p.cls, p.gear[0]?.rar ?? 0, p.gear[1]?.rar ?? -1, p.gear[0]?.wk ?? -1);
const cut = (s: string, n: number) => { s = tr(s); return s.length > n ? s.slice(0, n - 2) + '..' : s; };

function invSheet(ctx: CanvasRenderingContext2D, run: Run, time: number) {
  const p = run.p, x = 20, y = 22, w = VW - 40, h = VH - 44;
  invMove(run, 0, 0);
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#ffcd75');
  text(ctx, 'RUCKSACK', x + 14, y + 10, '#ffcd75', 16);
  ctx.drawImage(sprites.coin, x + w - 80, y + 11);
  text(ctx, `${p.gold} Gold`, x + w - 14, y + 14, '#ffcd75', 8, 'right');
  // Figur zeigt die angelegte Ausrüstung
  panel(ctx, x + 14, y + 34, 84, 84, '#333c57', '#1c2033');
  figure(ctx, `${lookOf(p)}:${['f', 's', 'b', 's'][Math.floor(time * 0.7) % 4]}${Math.floor(time * 3) % 2}`, x + 16, y + 36, 80, 80);
  const stats: [string, string, string][] = [['Leben', `${p.hp} / ${p.maxHp}`, '#b13e53'], ['Angriff', `${p.atk}`, '#f4f4f4'], ['Verteidigung', `${p.def}`, '#f4f4f4'], ['Kritisch', `${Math.round(p.crit * 100)} %`, '#f4f4f4'], ['Fähigkeiten', `${Math.round(p.pow * 100)} %`, '#f4f4f4']];
  stats.forEach(([k, v, col], i) => { text(ctx, k, x + 106, y + 38 + i * 12, '#94b0c2', 8); text(ctx, v, x + 212, y + 38 + i * 12, col, 8, 'right'); });
  text(ctx, 'ANGELEGT', x + 14, y + 127, '#94b0c2', 8);
  for (let i = 0; i < 4; i++) {
    const it = p.gear[i], gy = y + 139 + i * 25, sel = inv.col === 0 && inv.row === i, col = it ? RARITY_COL[it.rar] : '#566c86';
    panel(ctx, x + 14, gy, 200, 22, sel ? '#ffcd75' : it ? col : '#333c57', sel ? 'rgba(60,50,40,0.9)' : 'rgba(13,14,23,0.9)');
    if (it) drawItemIcon(ctx, it, p.cls, x + 20, gy + 6, col); else slotIcon(ctx, i, x + 20, gy + 6, col);
    text(ctx, it ? cut(it.name, 20) : SLOT_NAMES[i], x + 34, gy + 3, col, 8);
    text(ctx, it ? cut(itemText(it), 29) : 'leer', x + 34, gy + 12, it ? '#94b0c2' : '#333c57', 8);
  }
  // Rucksack
  const bx = x + 226, bw = 172;
  text(ctx, `Im Rucksack: ${p.bag.length} / ${BAG_MAX}`, bx, y + 34, '#94b0c2', 8);
  text(ctx, `[O] ${tr(SORT_NAMES[p.sort])}`, bx + bw, y + 34, '#566c86', 8, 'right');
  if (!p.bag.length) wrapText('Leer. Truhen und Händler füllen ihn.', 26).forEach((l, k) => text(ctx, l, bx, y + 50 + k * 10, '#566c86', 8));
  p.bag.forEach((it, i) => {
    const gy = y + 46 + i * 19, sel = inv.col === 1 && inv.row === i, v = verdict(run, it);
    panel(ctx, bx, gy, bw, 16, sel ? '#ffcd75' : '#333c57', sel ? 'rgba(60,50,40,0.9)' : 'rgba(13,14,23,0.9)');
    if (it.use) ctx.drawImage(sprites[`i_${it.use}`], bx + 3, gy + 2); else drawItemIcon(ctx, it, p.cls, bx + 5, gy + 4, RARITY_COL[it.rar]);
    text(ctx, cut(it.name, it.neu ? 19 : 23), bx + 19, gy + 4, RARITY_COL[it.rar], 8);
    if (v) arrow(ctx, bx + bw - 10, gy + 5, v > 0);
    if (it.neu) text(ctx, 'NEU', bx + bw - (v ? 14 : 5), gy + 4, '#ffcd75', 8, 'right');
  });
  // Auswahl im Detail, mit Vergleich zum angelegten Stück
  const dx = x + 410, dw = w - 424, chars = Math.floor((dw - 14) / 6);
  const cur = inv.col === 1 ? p.bag[inv.row] : p.gear[inv.row] ?? undefined;
  panel(ctx, dx, y + 34, dw, h - 78, '#333c57', 'rgba(13,14,23,0.6)');
  if (cur) {
    const worn = inv.col === 1 && !cur.use ? p.gear[cur.slot] ?? null : undefined;
    let yy = y + 42 + itemDetail(ctx, cur, dx + 7, y + 42, chars, worn) + 6;
    if (worn) { text(ctx, `Ersetzt: ${tr(worn.name)}`, dx + 7, yy, '#94b0c2', 8); yy += 14; }
    else if (worn === null) { text(ctx, 'Dieser Platz ist noch frei.', dx + 7, yy, '#a7f070', 8); yy += 14; }
    // Was bedeuten die Werte?
    for (const [k, label, help] of STATS) {
      if (!cur[k] || yy > y + h - 70) continue;
      for (const l of wrapText(`${tr(label)}: ${tr(help)}`, chars)) { text(ctx, l, dx + 7, yy, '#566c86', 8); yy += 9; }
      yy += 2;
    }
  } else text(ctx, inv.col ? '' : 'leer', dx + 7, y + 42, '#566c86', 8);
  const keys = !cur ? '' : inv.col === 0 ? '[ENTER] ablegen' : `[ENTER] ${cur.use ? 'benutzen' : 'anlegen'} · [X] verkaufen (${itemValue(cur)} Gold) · [ENTF] wegwerfen`;
  text(ctx, keys, x + 14, y + h - 28, '#ffcd75', 8);
  { arrow(ctx, x + 14, y + h - 14, true); text(ctx, 'besser als angelegt', x + 22, y + h - 15, '#566c86', 8); arrow(ctx, x + 150, y + h - 14, false); text(ctx, 'schlechter', x + 158, y + h - 15, '#566c86', 8); }
  text(ctx, 'Pfeile: wählen · [I] oder [ESC] schließen', x + w - 14, y + h - 15, '#566c86', 8, 'right');
}

function charSheet(ctx: CanvasRenderingContext2D, run: Run) {
  const p = run.p, c = CLASSES[p.cls], x = 50, y = 30, w = VW - 100, h = VH - 60;
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#ffcd75');
  panel(ctx, x + 12, y + 12, 68, 68, '#333c57', '#1c2033');
  figure(ctx, lookOf(p), x + 14, y + 14, 64, 64);
  text(ctx, c.name, x + 90, y + 14, '#ffcd75', 16);
  text(ctx, `Stufe ${p.lvl}   Ebene ${run.floor} ${BIOME_NAMES[biomeOf(run.floor)]}   Zug ${run.turn}`, x + 90, y + 34, '#94b0c2', 8);
  const stats: [string, string, string][] = [
    ['Leben', `${p.hp} / ${p.maxHp}`, '#b13e53'], [c.resName, `${p.res} / ${p.resMax}`, c.resCol], ['Angriff', `${p.atk}`, '#f4f4f4'], ['Verteidigung', `${p.def}`, '#f4f4f4'],
    ['Kritisch', `${Math.round(p.crit * 100)} %`, '#f4f4f4'], ['Fähigkeiten', `${Math.round(p.pow * 100)} %`, '#f4f4f4'], ['Besiegt', `${run.kills}`, '#94b0c2'], ['Seelensplitter', `${run.souls}`, '#73eff7'],
  ];
  stats.forEach(([k, v, col], i) => {
    const sx = x + 90 + (i % 2) * 120, sy = y + 48 + ((i / 2) | 0) * 11;
    text(ctx, k, sx, sy, '#94b0c2', 8);
    text(ctx, v, sx + 108, sy, col, 8, 'right');
  });
  // Ausrüstung
  const gx = x + 350;
  text(ctx, 'AUSRÜSTUNG', gx, y + 14, '#94b0c2', 8);
  SLOT_NAMES.slice(0, 4).forEach((slot, i) => {
    const it = p.gear[i], gy = y + 25 + i * 20;
    panel(ctx, gx, gy, w - 362, 18, it ? RARITY_COL[it.rar] : '#333c57');
    text(ctx, it ? it.name : slot, gx + 6, gy + 1, it ? RARITY_COL[it.rar] : '#566c86', 8);
    text(ctx, it ? cut(itemText(it), 28) : 'leer', gx + 6, gy + 9, it ? '#94b0c2' : '#333c57', 8);
  });
  // Reliquien und Gaben
  const ly = y + 108;
  text(ctx, 'RELIQUIEN', x + 14, ly, '#73eff7', 8);
  if (!p.relics.length) text(ctx, 'Noch keine – löse Rätselkammern.', x + 14, ly + 12, '#566c86', 8);
  p.relics.slice(0, 7).forEach((id, i) => {
    text(ctx, RELICS[id].name, x + 14, ly + 12 + i * 20, '#f4f4f4', 8);
    text(ctx, RELICS[id].desc, x + 20, ly + 21 + i * 20, '#94b0c2', 8);
  });
  const px = x + 290;
  text(ctx, 'GABEN', px, ly, '#ffcd75', 8);
  const counts = new Map<string, number>();
  for (const id of p.perks) counts.set(id, (counts.get(id) ?? 0) + 1);
  if (!counts.size) text(ctx, 'Noch keine – steige eine Stufe auf.', px, ly + 12, '#566c86', 8);
  [...counts].slice(0, 13).forEach(([id, n], i) => {
    text(ctx, `${PERKS[id].name}${n > 1 ? ` x${n}` : ''}`, px, ly + 12 + i * 11, '#f4f4f4', 8);
    text(ctx, PERKS[id].desc, px + 104, ly + 12 + i * 11, '#94b0c2', 8);
  });
  if (p.syn.length) {
    const names = p.syn.map(id => tr(SYNERGIES.find(q => q.id === id)!.name)).join(', ');
    text(ctx, `Synergien: ${names}`, x + 14, y + h - 26, '#a7f070', 8);
  }
  text(ctx, '[C] oder [ESC] schließen', VW / 2, y + h - 13, '#566c86', 8, 'center');
}

const HELP: [string, string][] = [
  ['Pfeile / WASD', 'bewegen, in Gegner laufen greift an'], ['Leertaste', 'einen Zug warten'], ['1 bis 6', 'Fähigkeiten (4–6: neue aus dem Baum)'], ['U', 'Ultimative Fähigkeit ab Stufe 5'], ['7 8 9 0', 'Rollen und Tränke benutzen'], ['R', 'letzten Fund anlegen'], ['K', 'Fertigkeitsbaum: Punkt vergeben'], ['T', 'Lehrgang: Schritt überspringen'], ['F', 'Fernangriff (Magier, Waldläufer)'],
  ['Q', 'Heiltrank trinken'], ['B', 'Bombe werfen'], ['E', 'Treppe hinabsteigen'], ['Klick / Tab', 'Ziel wählen'], ['Maus', 'über etwas halten zeigt Details'],
  ['I', 'Rucksack: anlegen, benutzen, verkaufen'], ['C', 'Charakter, Reliquien, Gaben'], ['N', 'Karte: klein, groß, aus'], ['M', 'Ton ein/aus'], ['V · L', 'Vollbild · Sprache (DE/EN)'], ['J', 'Journal: alle Meldungen nachlesen'], ['H', 'diese Hilfe'],
];

// Journal: die letzten Meldungen in voller Länge
function logSheet(ctx: CanvasRenderingContext2D, run: Run) {
  const x = 60, y = 24, w = VW - 120, h = VH - 48, chars = Math.floor((w - 28) / 6), maxRows = Math.floor((h - 60) / 10);
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#ffcd75');
  text(ctx, 'JOURNAL', x + 14, y + 10, '#ffcd75', 16);
  let rows: [string, boolean][] = [];
  run.log.forEach((m, k) => wrapText(m, chars).forEach((l, j) => rows.push([(j ? '  ' : '') + l, k === run.log.length - 1])));
  rows = rows.slice(-maxRows);
  rows.forEach(([l, cur], k) => text(ctx, l, x + 14, y + 36 + k * 10, cur ? '#f4f4f4' : '#94b0c2', 8));
  if (!rows.length) text(ctx, 'Noch nichts geschehen.', x + 14, y + 36, '#566c86', 8);
  text(ctx, '[J] oder [ESC] schließen', VW / 2, y + h - 13, '#566c86', 8, 'center');
}

function helpSheet(ctx: CanvasRenderingContext2D) {
  const w = 380, h = 56 + HELP.length * 13, x = (VW - w) >> 1, y = (VH - h) >> 1;
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#ffcd75');
  text(ctx, 'STEUERUNG', VW / 2, y + 12, '#ffcd75', 16, 'center');
  HELP.forEach(([k, v], i) => {
    text(ctx, k, x + 110, y + 38 + i * 13, '#ffcd75', 8, 'right');
    text(ctx, v, x + 124, y + 38 + i * 13, '#f4f4f4', 8);
  });
  text(ctx, '[H] oder [ESC] schließen', VW / 2, y + h - 13, '#566c86', 8, 'center');
}

const TILE_NAMES: Record<number, string> = {
  [T.STAIRS]: 'Treppe nach unten [E]', [T.CHEST]: 'Truhe', [T.CURSED]: 'Verfluchte Truhe – stark, aber kostet Leben', [T.TRADER]: 'Händler – hineinlaufen zum Handeln',
  [T.FOUNTAIN]: 'Brunnen – heilt einmal', [T.FOUNTAIN_DRY]: 'Versiegter Brunnen', [T.GATE]: 'Gitter – der Schlüssel liegt bei einem Elitegegner', [T.ALTAR]: 'Altar: Leben gegen eine Gabe', [T.CRACKED]: 'Rissige Wand – 3 Schläge oder Bombe',
  [T.BARREL]: 'Fass – anstoßen zündet die Lunte', [T.PILLAR]: 'Säule – stürzt bei Explosion ein', [T.GRASS]: 'Bewuchs – brennbar',
  [T.FRAGILE]: 'Brüchiger Boden', [T.FRAGILE2]: 'Brüchiger Boden – bricht beim nächsten Tritt', [T.CRATE]: 'Kiste – schiebbar', [T.CRATE_ON]: 'Kiste auf Platte',
  [T.PLATE]: 'Druckplatte', [T.LEVER]: 'Hebel – setzt die Kisten zurück', [T.ICE]: 'Eis – du rutschst', [T.TABLET]: 'Steintafel', [T.GOAL]: 'Zielplatte',
};

function tooltip(ctx: CanvasRenderingContext2D, run: Run, ox: number, oy: number) {
  if (mouse.x < 0 || run.mode !== 'play') return;
  const tx = Math.floor((mouse.x - ox) / TS), ty = Math.floor((mouse.y - oy) / TS), i = ty * W + tx;
  if (tx < 0 || ty < 0 || tx >= W || ty >= H || !run.seen[i]) return;
  const m = run.vis[i] ? run.mobs.find(o => o.x === tx && o.y === ty) : undefined;
  const lines: string[] = [];
  if (m) {
    const d = MOBS[m.kind];
    lines.push(m.name, `Leben ${m.hp}/${m.maxHp}   Angriff ${m.atk}   Vert. ${m.def}`);
    const tags = [d.range ? `Fernkampf ${d.range}` : '', d.poison ? 'giftig' : '', d.burn ? 'entzündet' : '', d.ai === 'slow' ? 'langsam' : '', d.ai === 'erratic' ? 'unberechenbar' : '',
      m.st.stun ? 'betäubt' : '', m.st.brand ? 'brennt' : '', m.st.gift ? 'vergiftet' : '', !m.awake ? 'schläft' : ''].filter(Boolean);
    if (tags.length) lines.push(tags.join(' · '));
  } else {
    const t = run.tiles[i];
    if (t === T.RUNE && run.puzzle) lines.push(`Rune: ${RUNE_NAMES[run.puzzle.runes[i]]}`);
    else if (TILE_NAMES[t]) lines.push(TILE_NAMES[t]);
    if (run.fire.has(i)) lines.push('Feuer');
  }
  if (!lines.length) return;
  ctx.strokeStyle = '#ffcd75'; ctx.lineWidth = 1; ctx.strokeRect(tx * TS + ox + 0.5, ty * TS + oy + 0.5, TS - 1, TS - 1);
  const w = Math.max(...lines.map(l => tr(l).length)) * 6 + 12, h = lines.length * 10 + 8;
  const x = Math.min(VW - w - 4, mouse.x + 10), y = Math.max(4, Math.min(VH - h - 32, mouse.y + 10));
  panel(ctx, x, y, w, h, '#ffcd75');
  lines.forEach((l, k) => text(ctx, l, x + 6, y + 5 + k * 10, k ? '#94b0c2' : '#f4f4f4', 8));
}

function minimap(ctx: CanvasRenderingContext2D, run: Run, time: number) {
  const big = mapMode === 2, s = big ? 6 : 1;
  const x0 = big ? (VW - W * s) >> 1 : VW - W - 4, y0 = big ? ((VH - H * s) >> 1) - 6 : 20;
  if (big) {
    ctx.fillStyle = 'rgba(5,6,12,0.72)'; ctx.fillRect(0, 0, VW, VH);
    panel(ctx, x0 - 4, y0 - 16, W * s + 8, H * s + 36, '#566c86', 'rgba(13,14,23,0.9)');
    text(ctx, `Ebene ${run.floor} / 15 - ${BIOME_NAMES[biomeOf(run.floor)]}`, x0, y0 - 12, '#ffcd75', 8);
    text(ctx, '[N] schließen', x0 + W * s, y0 - 12, '#566c86', 8, 'right');
  } else {
    ctx.globalAlpha = under(x0 - 2, y0 - 2, W + 4, H + 4) ? 0.25 : 1;
    ctx.fillStyle = 'rgba(8,9,15,0.55)'; ctx.fillRect(x0 - 1, y0 - 1, W + 2, H + 2);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = run.tiles[i];
    if (!run.seen[i]) continue;
    if (t === T.WALL) {
      if (!big) continue;
      ctx.fillStyle = '#262b44';
    } else ctx.fillStyle = t === T.STAIRS || t === T.GATE ? '#ffcd75' : t === T.CHEST || t === T.CURSED ? '#c98a3a' : t === T.FOUNTAIN ? '#73eff7' : t === T.TRADER ? '#38b764' : t === T.CRACKED ? '#b13e53'
      : (t >= T.CRATE && t <= T.GOAL) ? '#41a6f6' : run.fire.has(i) ? '#ef7d57' : run.vis[i] ? '#94b0c2' : '#566c86';
    ctx.fillRect(x0 + x * s, y0 + y * s, s, s);
  }
  for (const m of run.mobs) if (run.vis[m.y * W + m.x]) { ctx.fillStyle = m.elite ? '#ffcd75' : '#b13e53'; ctx.fillRect(x0 + m.x * s, y0 + m.y * s, s, s); }
  if (big || Math.floor(time * 4) % 2) {
    ctx.fillStyle = '#f4f4f4';
    if (big) ctx.fillRect(x0 + run.p.x * s - 1, y0 + run.p.y * s - 1, s + 2, s + 2); else ctx.fillRect(x0 + run.p.x - 1, y0 + run.p.y - 1, 3, 3);
  }
  ctx.globalAlpha = 1;
  if (big) {
    const leg: [string, string][] = [['#f4f4f4', 'Du'], ['#ffcd75', 'Treppe'], ['#c98a3a', 'Truhe'], ['#38b764', 'Händler'], ['#73eff7', 'Brunnen'], ['#41a6f6', 'Rätsel'], ['#b13e53', 'Gegner']];
    let lx = x0;
    for (const [col, name] of leg) {
      ctx.fillStyle = col; ctx.fillRect(lx, y0 + H * s + 7, 5, 5);
      lx += 8 + text(ctx, name, lx + 8, y0 + H * s + 6, '#94b0c2', 8) + 10;
    }
  }
}

// Liegt der Mauszeiger über einem HUD-Teil, wird dieser durchsichtig
const under = (x: number, y: number, w: number, h: number) => mouse.x >= x && mouse.x < x + w && mouse.y >= y && mouse.y < y + h;

// Einsteigerhinweise im ersten Lauf
function hint(run: Run): string | null {
  const p = run.p, c = CLASSES[p.cls];
  if (run.turn < 4) return 'Pfeiltasten oder WASD: bewegen';
  if (run.tiles[p.y * W + p.x] === T.STAIRS) return '[E] steigt die Treppe hinab';
  if (p.hp < p.maxHp * 0.5 && p.potions > 0) return '[Q] trinkt einen Heiltrank';
  if (run.mobs.some(m => run.vis[m.y * W + m.x])) return c.range ? '[F] schießt auf den nächsten Gegner · [1]–[3] Fähigkeiten' : 'In einen Gegner laufen greift an · [1]–[3] Fähigkeiten';
  for (let y = p.y - 4; y <= p.y + 4; y++) for (let x = p.x - 4; x <= p.x + 4; x++) {
    const i = y * W + x;
    if (!run.vis[i]) continue;
    if (run.tiles[i] === T.CRACKED) return 'Rissige Wand: dreimal dagegenlaufen oder [B] Bombe';
    if (run.tiles[i] === T.BARREL) return 'Fass: anstoßen zündet die Lunte – dann Abstand halten';
    if (run.tiles[i] === T.CHEST) return 'Truhe: hineinlaufen öffnet sie';
  }
  return run.floor === 1 ? 'Finde die Treppe · Maus über etwas halten zeigt Details' : null;
}

function wrapText(s: string, n: number): string[] {
  s = tr(s);
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if (line && (line + ' ' + w).length > n) { out.push(line); line = w; } else line = line ? line + ' ' + w : w;
  }
  if (line) out.push(line);
  return out;
}

const KIND_COL = { perk: '#ffcd75', relic: '#73eff7', skill: '#a7f070' };
const KIND_NAME = { perk: 'Gabe', relic: 'Reliquie', skill: 'Fähigkeit' };

function perkOverlay(ctx: CanvasRenderingContext2D, run: Run) {
  const ids = run.perkChoices, relic = !!RELICS[ids[0]], col = relic ? '#73eff7' : '#ffcd75';
  ctx.fillStyle = 'rgba(13,14,23,0.75)'; ctx.fillRect(0, 0, VW, VH);
  text(ctx, relic ? 'WÄHLE EINE RELIQUIE' : 'WÄHLE EINE GABE', VW / 2, 78, col, 24, 'center');
  const cw = ids.length > 3 ? 146 : 154, x0 = VW / 2 - (ids.length * (cw + 8) - 8) / 2;
  ids.forEach((id, i) => {
    const x = x0 + i * (cw + 8), y = 126, pk = perkInfo(run.p, id), kc = KIND_COL[pk.kind];
    panel(ctx, x, y, cw, 104, kc);
    text(ctx, `[${i + 1}]`, x + cw / 2, y + 8, kc, 10, 'center');
    text(ctx, KIND_NAME[pk.kind], x + cw / 2, y + 22, '#566c86', 8, 'center');
    if (pk.kind === 'skill') ctx.drawImage(sprites[`i_${run.p.cls}${id[5]}`], x + 6, y + 6);
    else drawIcon(ctx, PERK_ICON[id], x + 6, y + 6, kc, 2);
    wrapText(pk.name, 22).forEach((l, k) => text(ctx, l, x + cw / 2, y + 38 + k * 11, '#f4f4f4', 8, 'center'));
    wrapText(pk.desc, 22).forEach((l, k) => text(ctx, l, x + cw / 2, y + 62 + k * 10, '#94b0c2', 8, 'center'));
    const have = run.p.perks.filter(q => q === id).length;
    if (pk.syn) text(ctx, `Synergie: ${tr(pk.syn)}`, x + cw / 2, y + 92, '#a7f070', 8, 'center');
    else if (have) text(ctx, `schon ${have}x`, x + cw / 2, y + 92, '#566c86', 8, 'center');
  });
  text(ctx, `Taste 1 bis ${ids.length}`, VW / 2, 244, '#94b0c2', 8, 'center');
}

function shopOverlay(ctx: CanvasRenderingContext2D, run: Run) {
  const p = run.p, w = 330, h = 62 + run.shop.length * 30, x = (VW - w) >> 1, y = (VH - h) >> 1;
  ctx.fillStyle = 'rgba(13,14,23,0.75)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#ffcd75');
  ctx.drawImage(sprites.trader, x + 10, y + 8, 32, 32);
  text(ctx, 'HÄNDLER', x + 52, y + 12, '#ffcd75', 16);
  ctx.drawImage(sprites.coin, x + w - 60, y + 14);
  text(ctx, `${p.gold}`, x + w - 12, y + 17, '#ffcd75', 10, 'right');
  run.shop.forEach((o, i) => {
    const oy = y + 46 + i * 30, ok = !o.sold && p.gold >= o.price;
    text(ctx, `[${i + 1}]`, x + 12, oy + 4, o.sold ? '#333c57' : '#ffcd75');
    if (o.item && !o.sold) drawItemIcon(ctx, o.item, p.cls, x + 36, oy, RARITY_COL[o.item.rar]);
    text(ctx, o.sold ? `${o.name} – verkauft` : o.left !== undefined ? `${o.name} ×${o.left}` : o.name, x + (o.item && !o.sold ? 48 : 36), oy, o.sold ? '#566c86' : o.item ? RARITY_COL[o.item.rar] : '#f4f4f4');
    text(ctx, cut(o.desc, 46), x + 36, oy + 11, '#94b0c2', 8);
    if (!o.sold) text(ctx, `${o.price} Gold`, x + w - 12, oy + 4, ok ? '#ffcd75' : '#b13e53', 10, 'right');
  });
  text(ctx, '[LEERTASTE] weiterziehen', VW / 2, y + h - 14, '#94b0c2', 8, 'center');
}

function endOverlay(ctx: CanvasRenderingContext2D, run: Run) {
  const win = run.mode === 'win', x = VW / 2 - 130, y = VH / 2 - 78;
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, 260, 156, win ? '#ffcd75' : '#b13e53');
  text(ctx, win ? 'SIEG!' : 'GEFALLEN', VW / 2, y + 14, win ? '#ffcd75' : '#b13e53', 24, 'center');
  text(ctx, win ? 'Die Glutgruft ist bezwungen.' : `Ebene ${run.floor} – ${BIOME_NAMES[biomeOf(run.floor)]}`, VW / 2, y + 52, '#f4f4f4', 10, 'center');
  text(ctx, `Besiegte Gegner: ${run.kills}`, VW / 2, y + 72, '#94b0c2', 10, 'center');
  text(ctx, `Stufe: ${run.p.lvl}`, VW / 2, y + 86, '#94b0c2', 10, 'center');
  text(ctx, `+${run.souls} Seelensplitter`, VW / 2, y + 106, '#73eff7', 10, 'center');
  text(ctx, '[LEERTASTE] zurück zum Lager', VW / 2, y + 132, '#ffcd75', 8, 'center');
}

// ---- Fertigkeitsbaum (Lager und Lauf) ----
export type TreeState = 'learned' | 'open' | 'locked' | 'buy' | 'owned' | 'free';
const TREE_COL: Record<TreeState, string> = { learned: '#a7f070', open: '#ffcd75', locked: '#333c57', buy: '#b13e53', owned: '#73eff7', free: '#73eff7' };
// Reihen eines Zweigs von oben nach unten; es werden nur vorhandene gezeigt
const TIER_ROWS = [['1'], ['2a', '2b'], ['3'], ['4a', '4b'], ['5']];
// gebündelte Knoten (T2a) erscheinen als Teil ihres Elternknotens
const rowsOf = (cls: ClassId) => TIER_ROWS.map(r => r.filter(t => treeNodes(cls).some(n => n.branch === 0 && n.tier === t && !n.bundled))).filter(r => r.length);
const bundledOf = (cls: ClassId, id: string) => treeNodes(cls).find(n => n.bundled && n.parent === id);
const tierOf = (cls: ClassId, id: string) => treeNode(cls, id)!.tier;
let treeSel = 'n0_1';
export const treeCursor = () => treeSel;
export function treeFocus(cls: ClassId, id: string) { if (treeNode(cls, id)) treeSel = id; }
export function treeMove(cls: ClassId, dx: number, dy: number) {
  const rows = rowsOf(cls), n = treeNode(cls, treeSel) ?? treeNode(cls, 'n0_1')!, r = rows.findIndex(q => q.includes(n.tier));
  if (dy) {
    const r2 = Math.max(0, Math.min(rows.length - 1, r + dy));
    treeSel = `n${n.branch}_${rows[r2][0]}`;
    return;
  }
  const flat = [0, 1, 2].flatMap(b => rows[r].map(t => `n${b}_${t}`)), i = flat.indexOf(treeSel);
  treeSel = flat[(i + dx + flat.length) % flat.length];
}

const shortName = (cls: ClassId, id: string) => {
  const n = treeNode(cls, id)!;
  if (n.tier === '1') { const b = bundledOf(cls, id); return b ? `${CLASSES[cls].skills[n.branch].name} + ${nodeText(cls, b.id).name}` : CLASSES[cls].skills[n.branch].name; }
  if (n.tier === '4a' || n.tier === '4b') return SKILL_UP[`${cls}${n.branch}`][n.tier === '4a' ? 'a' : 'b'][0];
  return nodeText(cls, id).name;
};

// Kleiner Haken: Knoten ist ohne Seelensplitter verfügbar
function freeMark(ctx: CanvasRenderingContext2D, x: number, y: number, col: string) {
  ctx.fillStyle = col;
  for (const [px, py] of [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1], [7, 0]]) ctx.fillRect(x + px, y + py, 1, 2);
}

export function drawTree(ctx: CanvasRenderingContext2D, cls: ClassId, title: string, stateOf: (id: string) => TreeState, tag: (id: string) => string, foot: string, status: (id: string) => string) {
  ctx.fillStyle = 'rgba(13,14,23,0.88)'; ctx.fillRect(0, 0, VW, VH);
  text(ctx, title, VW / 2, 14, '#ffcd75', 16, 'center');
  const colW = 196, gap = 6, x0 = (VW - 3 * colW - 2 * gap) >> 1, rows = rowsOf(cls);
  const rowH = 26, step = rows.length > 2 ? 32 : 60, top = 62;
  for (let b = 0; b < 3; b++) {
    const cx = x0 + b * (colW + gap), mid = cx + colW / 2;
    panel(ctx, cx, 36, colW, 206, '#333c57', 'rgba(20,22,36,0.9)');
    ctx.drawImage(sprites[`i_${cls}${b}`], cx + 8, 42);
    text(ctx, tr(BRANCH_NAMES[cls][b]).toUpperCase(), mid, 45, '#94b0c2', 10, 'center');
    ctx.fillStyle = '#566c86';
    ctx.fillRect(mid, top + rowH, 1, (rows.length - 1) * step - rowH);
    rows.forEach((row, r) => {
      const y = top + r * step, w = row.length > 1 ? (colW - 14) / 2 : colW - 26;
      if (row.length > 1) { ctx.fillStyle = '#566c86'; ctx.fillRect(cx + colW / 4, y - 3, colW / 2, 1); }
      row.forEach((t, k) => {
        const id = `n${b}_${t}`, x = row.length > 1 ? cx + 4 + k * (w + 6) : cx + 13;
        const st = stateOf(id), col = TREE_COL[st], sel = id === treeSel, node = treeNode(cls, id)!;
        panel(ctx, x, y, w, rowH, sel ? '#f4f4f4' : col, sel ? 'rgba(60,50,40,0.95)' : st === 'locked' ? 'rgba(13,14,23,0.9)' : 'rgba(28,32,51,0.95)');
        const mark = (st === 'learned' ? '+' : '') + (node.key ? '*' : '');
        text(ctx, cut(`${mark}${mark ? ' ' : ''}${tr(shortName(cls, id))}`, Math.floor((w - 6) / 6)), x + w / 2, y + 5, st === 'locked' ? '#566c86' : '#f4f4f4', 8, 'center');
        const tg = tag(id);
        if (tg === '#free') freeMark(ctx, x + w / 2 - 4, y + 16, col);
        else if (tg) text(ctx, cut(tg, Math.floor((w - 6) / 6)), x + w / 2, y + 15, col, 8, 'center');
      });
    });
  }
  // Beschreibung des gewählten Knotens
  const nt = nodeText(cls, treeSel), node = treeNode(cls, treeSel)!, bun = bundledOf(cls, treeSel);
  const lines = [...wrapText(nt.desc, 90), ...(bun ? wrapText(`Dazu ${nodeText(cls, bun.id).name}: ${nodeText(cls, bun.id).desc}`, 90) : [])];
  panel(ctx, x0, 248, 3 * colW + 2 * gap, 74, '#566c86');
  text(ctx, `${nt.name}${node.key ? ' – Schlüsselknoten' : ''}`, x0 + 10, 256, '#ffcd75', 10);
  lines.forEach((l, k) => text(ctx, l, x0 + 10, 272 + k * 10, '#f4f4f4', 8));
  text(ctx, status(treeSel), x0 + 10, 308, TREE_COL[stateOf(treeSel)], 8);
  text(ctx, foot, VW / 2, 334, '#94b0c2', 8, 'center');
}

function treeOverlay(ctx: CanvasRenderingContext2D, run: Run) {
  const p = run.p, av = availableNodes(run);
  const stateOf = (id: string): TreeState => p.tree.includes(id) ? 'learned' : av.includes(id) ? 'open' : 'locked';
  drawTree(ctx, p.cls, `STUFE ${p.lvl} – FERTIGKEITSPUNKT (${p.pts} frei)`, stateOf,
    id => ({ learned: 'gelernt', open: 'wählbar', locked: run.pool.includes(id) ? 'gesperrt' : 'erst im Lager' } as Record<string, string>)[stateOf(id)],
    `Punkte: ${p.ptsGot ?? 0}/${TUNE.treePtsMax} · Pfeile: wählen · ENTER: lernen · K: später`,
    id => {
      const st = stateOf(id), n = treeNode(p.cls, id)!;
      if (st !== 'locked') return st === 'learned' ? 'Schon gelernt.' : 'Kann jetzt gelernt werden.';
      if (!run.pool.includes(id)) return 'Im Lager noch nicht freigeschaltet.';
      if (n.excl && p.tree.includes(n.excl)) return 'Die andere Ausprägung ist schon gewählt.';
      if (n.parent && !p.tree.includes(n.parent)) return 'Erst Rang II lernen.';
      if (n.needAny && !n.needAny.some(q => p.tree.includes(q))) return 'Braucht Rang III und 4 Punkte im Zweig.';
      return `Braucht ${n.minPts} Punkte im Zweig.`;
    });
}
