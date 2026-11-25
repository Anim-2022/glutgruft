import { VW, VH, TS, sprites, masks, tilesets, text, panel, bar, heroLook, figure, BIOMES as FLOOR_COLS } from './gfx';
import { GLOW } from './sprites';
import { W, H, T, wallLike, walkable } from '../game/dungeon';
import { VS } from '../game/puzzles';
import { threatOf, statusMarks } from './warn';
import { onDeath, drawDecals, drawDying, resetDeaths, reducedFx } from './deaths';
import { drawItemIcon, drawIcon, PERK_ICON } from './icons';
import { statusList, groupPassives, type StatusEntry } from './status';
import { Light, applyLight, AMBIENTS } from './light';
import { dropShadow, drawAO } from './shade';
import { softEdged, pickDecal, bakeFloor } from './tiles';
import { propsFor, drawProp, drawPropSlice, propSpan, recolor, torchSpots } from './props';
import type { Zone } from './props';
import { stepAmbient, drawAmbient, drawFog, resetAmbient, postFx } from './ambient';
import { drawFlames, smoke, drawSmoke, resetFire, trackBurns, drawEmbers, fireAge, pruneFire } from './fire';

// Arena des Bosses: Fackeln brennen in seiner Farbe [außen, Kern], dazu eine Aura um ihn
const BOSS_FLAME: [string, string][] = [['#9a4fc0', '#c9d4dc'], ['#38b764', '#a7f070'], ['#ef7d57', '#f4f4f4']];
const bossTorch: HTMLCanvasElement[][] = [];
const torchOf = (bi: number, f: number) => (bossTorch[bi] ??= [0, 1].map(k => recolor(sprites[`torch${k}`], { '#ef7d57': BOSS_FLAME[bi][0], '#ffcd75': BOSS_FLAME[bi][1] })))[f];
import { sfx } from '../core/audio';
import { schedule, advance, held, anim, peekAnim, startLunge, setPose, hitActor, hitstop, resetTimeline, busy, FLASH_T, RECOIL_T, lungeOffset, weightOf, hurtLean, heroSlide } from './timeline';
import { addNum, drawNums, addShake, stepShake, hurtFlash, drawScreenFlash, splat, drawSpots, tinted, noteKill, resetJuice } from './juice';
import { fxScale, fxLevel } from './fxopts';
import { drawWorldTile, drawGas, MAT_COLS, MAT_SOUND } from './world';
import { hunterFx, resetHunterFx, isHunter, leaping, leapLift, drawHunterAura, hunterGlow, drawHunterBar, drawHunterMarks, stepHunterFx, stoneOverlay } from './hunters';
import { Run, Actor, xpNeed, skillCost, skillReady, spellAt, itemText, itemValue, itemScore, perkInfo, skillModName, shotRange, RANKS, SORT_NAMES, BAG_MAX, RUNE_NAMES, availableNodes, puzzleGoal, eventGoal, hunterWarn, hunterInfo, hunted, dartWarn, inVault, VAULT_NAMES, HAZARD_NAMES, aimable, aimName } from '../game/run';
import { ClassId, treeNodes, NEW_SKILLS, TUNE, BRANCH_NAMES, SKILL_UP, treeNode, nodeText, CLASSES, MOBS, PERKS, RELICS, RARITY, RARITY_COL, BIOME_NAMES, biomeOf, Item, AFFIX, CONSUMABLES, SLOT_NAMES, ULT, ULT_LEVEL, USE_ORDER, SYNERGIES } from '../game/content';

const pos = new Map<number, { x: number; y: number }>();
const bolts: { x0: number; y0: number; x1: number; y1: number; col: string; t: number }[] = [];
const booms: { x: number; y: number; r: number; t: number }[] = [];
const fuseTags: { x: number; y: number; n: number }[] = []; // counters over burning fuses (drawn after the light)
let shimmerLeft = 0; // heat shimmer tiles left this frame
const fireBlocks = new Map<number, { x: number; y: number; n: number; k: number }>(); // fire lights merged per 3×3 block
// Particles; fy: floor height where heavy particles come to rest (then fade slowly)
const bits: { x: number; y: number; vx: number; vy: number; col: string; t: number; g?: number; fy?: number; rest?: number; rl?: number }[] = [];
const BIT_MAX = 400, BIT_T = 0.55, REST_T = 1.5;
const shake = (n: number, dir: [number, number] | null = null) => addShake(n, dir);
// Direction of the last blow or shot (for recoil, splatter, camera kick)
let hitDir: [number, number] | null = null, hitDirT = 0;
const setDir = (dx: number, dy: number) => { hitDir = [dx, dy]; hitDirT = 0; };
// Fähigkeitseffekte (nur Darstellung)
type Shot = { x0: number; y0: number; x1: number; y1: number; col: string; kind: 'fire' | 'arrow' | 'heavy'; r: number; t: number; dur: number };
const shots: Shot[] = [];
const rings: { x: number; y: number; r: number; t: number }[] = [];
const sparks: { x: number; y: number; col: string; big: boolean; t: number }[] = [];
// critical hits: white silhouette and a short light on the hit actor only (no full-screen flash)
const CRIT_T = 0.06;
const critHits: { id: number; x: number; y: number; t: number }[] = [];
const bashes: { x: number; y: number; dx: number; dy: number; t: number }[] = [];
const swipes: { x: number; y: number; dx: number; dy: number; big: boolean; t: number }[] = [];
const auras: { col: string; ult: boolean; t: number }[] = []; // cast glow around the hero
let deathT = -1; // Zeit seit dem Tod des Helden, -1 = lebt
const SWIPE_T = 0.2, DEATH_T = 1.3;
// Actor poses: a attack, c cast (frame from poses.ts), time left in seconds – state lives in timeline.ts
const pose = (id: number, k: string, t = 0.22) => setPose(id, k, t);
const RING_T = 0.38, SPARK_T = 0.18, BASH_T = 0.22;
const burstBits = (x: number, y: number, n: number, cols: string[], v0: number, v1: number, up = 30, g?: number) => {
  for (let k = 0; k < n; k++) {
    const ang = Math.random() * Math.PI * 2, v = v0 + Math.random() * (v1 - v0);
    bits.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - up, col: cols[k % cols.length], t: 0, g, fy: g === undefined || g > 100 ? y + 3 + Math.random() * 9 : undefined });
  }
};
const cam = { x: 0, y: 0 };
const ICE_SPRAY = ['#f4f4f4', '#c9d4dc', '#73eff7', '#94b0c2'];
let slidePhase: 'move' | null = null; // the last frame showed the hero sliding (bump fires on the change)
const view = { ox: 0, oy: 0 };
// Bildschirmpunkt -> Kartenfeld (für Mausklicks)
export const tileAt = (mx: number, my: number): [number, number] => [Math.floor((mx - view.ox) / TS), Math.floor((my - view.oy) / TS)];


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
  text(ctx, 'TUTORIAL', x + 10, y + 8, '#566c86', 8);
  text(ctx, card.title, VW / 2, y + 8, '#73eff7', 10, 'center');
  lines.forEach((l, k) => text(ctx, l, x + 14, y + 28 + k * 12, '#f4f4f4', 8));
  text(ctx, '[ENTER] continue', VW / 2, y + h - 14, '#ffcd75', 8, 'center');
}

// ---- Fackeln: Positionen werden einmal pro Ebene bestimmt ----
const torches = new Set<number>();
let lightKey = '';
const hash = (x: number, y: number, s: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0;

// whole floor of the level, baked once per level (tiles.ts)
let floorBake: { key: string; c: HTMLCanvasElement } | null = null;
function floorOf(run: Run, bio: number): HTMLCanvasElement {
  const key = `${run.seed}:${run.floor}`;
  if (floorBake?.key !== key) floorBake = { key, c: bakeFloor(FLOOR_COLS[bio], bio, tilesets[bio].floorM, (run.seed + run.floor * 7919) >>> 0, W, H) };
  return floorBake.c;
}

function buildLight(run: Run) {
  const key = `${run.seed}:${run.floor}`;
  if (key === lightKey) return;
  lightKey = key;
  torches.clear();
  for (const i of torchSpots(run.tiles, run.seed + run.floor)) torches.add(i);
}

export function resetView() {
  pos.clear(); resetTimeline(); resetJuice();
  bolts.length = 0; bits.length = 0; booms.length = 0;
  shots.length = 0; rings.length = 0; sparks.length = 0; critHits.length = 0; bashes.length = 0; swipes.length = 0; auras.length = 0; deathT = -1;
  resetDeaths(); resetAmbient(); resetFire(); resetHunterFx(); fuseTags.length = 0; slidePhase = null;
}

// Puzzle chamber with its walls and the entrance below: no decor, no floor marks
function bareZone(run: Run): Zone | null {
  const z = run.puzzle;
  return z ? { x0: z.x - 1, y0: z.y - 1, x1: z.x + VS, y1: z.y + VS + 1 } : null;
}

function smooth(a: Actor, dt: number) {
  let p = pos.get(a.id);
  // ice slide: the hero follows the played-back path exactly (constant speed, no easing)
  const sl = a.id === 0 ? heroSlide() : null;
  if (sl) { if (!p) pos.set(a.id, (p = { x: sl.x, y: sl.y })); p.x = sl.x; p.y = sl.y; return p; }
  if (!p || (Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 3 && !leaping(a.id))) { p = { x: a.x, y: a.y }; pos.set(a.id, p); }
  // an enemy whose beat has not come yet still stands at its old position
  if (held(a.id)) return p;
  // knockback: just hit and more than a tile away – slide fast, dust at the feet
  const an = peekAnim(a.id), d = Math.abs(p.x - a.x) + Math.abs(p.y - a.y);
  const knock = !!an && an.hurt < 0.3 && d > 0.9 && !leaping(a.id);
  if (knock && !an.knocked) {
    an.knocked = true;
    burstBits(p.x * TS + 8, p.y * TS + 13, Math.round(8 * fxScale()) + 2, ['#94b0c2', '#566c86', '#c9d4dc'], 10, 40, 12);
  }
  const k = Math.min(1, dt * (leaping(a.id) ? 7 : knock ? 28 : 11));
  p.x += (a.x - p.x) * k; p.y += (a.y - p.y) * k;
  return p;
}


// Bodenschatten unter Gegenständen: [Fußzeile im Feld, Breite]
const OBJ_SHADOW: Record<number, [number, number]> = {
  [T.PILLAR]: [15, 14], [T.BARREL]: [14, 13], [T.CHEST]: [13, 16], [T.CHEST_OPEN]: [13, 16], [T.CURSED_OPEN]: [13, 16], [T.ALTAR]: [15, 14], [T.ALTAR_USED]: [15, 14],
  [T.TRADER]: [15, 14], [T.CRATE]: [15, 16], [T.CRATE_ON]: [15, 16], [T.TABLET]: [15, 14], [T.LEVER]: [14, 10], [T.CURSED]: [14, 15],
  [T.FOUNTAIN]: [15, 15], [T.FOUNTAIN_DRY]: [15, 15], [T.BRAZIER]: [15, 10], [T.BRAZIER_ON]: [15, 10], [T.STATUE]: [15, 14], [T.MIMIC]: [13, 16],
  [T.POT]: [14, 10], [T.SPORE]: [15, 12],
};
const FLY = new Set(['fledermaus', 'glutgeist', 'tod']);

// Look variants of common objects: shapes, each with its mirrored version. Within a few tiles two objects
// of the same kind get different shapes, so a row of pots or barrels never looks copy-pasted.
const VARIANTS: Record<number, string[][]> = {
  [T.POT]: [['pot', 'pot_m'], ['pot1', 'pot1_m'], ['pot2', 'pot2_m']],
  [T.BARREL]: [['barrel'], ['barrel1'], ['barrel2']],
  [T.SPORE]: [['spore', 'spore_m'], ['spore1', 'spore1_m']],
};
const VARIANT_R = 4;
let varKey = '';
const varOf = new Map<number, { t: number; name: string }>();
function objectSprite(run: Run, i: number, t: number): string {
  const key = `${run.seed}:${run.floor}`;
  if (key !== varKey) {
    varKey = key; varOf.clear();
    const shapeAt = new Map<number, number>();
    for (let j = 0; j < W * H; j++) {
      const v = VARIANTS[run.tiles[j]];
      if (!v) continue;
      const x = j % W, y = (j / W) | 0, used = new Set<number>();
      for (const [k, sh] of shapeAt) if (run.tiles[k] === run.tiles[j] && Math.max(Math.abs((k % W) - x), Math.abs(((k / W) | 0) - y)) <= VARIANT_R) used.add(sh);
      const h = hash(x, y, run.seed + run.floor * 13);
      let shape = h % v.length;
      for (let n = 0; n < v.length && used.has(shape); n++) shape = (shape + 1) % v.length;
      shapeAt.set(j, shape);
      varOf.set(j, { t: run.tiles[j], name: v[shape][(h >>> 4) % v[shape].length] });
    }
  }
  const v = VARIANTS[t], o = varOf.get(i);
  return o && o.t === t ? o.name : v[hash(i % W, (i / W) | 0, 31) % v.length][0]; // objects created later (events) fall back to a hash
}

const TILE_SPR: Record<number, string> = {
  [T.STAIRS]: 'stairs', [T.CHEST]: 'chest', [T.CHEST_OPEN]: 'chest_open', [T.CURSED_OPEN]: 'cursed_open', [T.ALTAR]: 'altar', [T.ALTAR_USED]: 'altar_used',
  [T.CRATE]: 'crate', [T.CRATE_ON]: 'crate', [T.PLATE]: 'plate', [T.LEVER]: 'lever', [T.TABLET]: 'tablet', [T.GOAL]: 'goal',
  [T.CURSED]: 'cursed', [T.TRADER]: 'trader', [T.FOUNTAIN]: 'fountain', [T.FOUNTAIN_DRY]: 'fountain_dry', [T.GATE]: 'gate', [T.BRAZIER]: 'brazier', [T.BRAZIER_ON]: 'brazier_on', [T.STATUE]: 'statue', [T.MIMIC]: 'chest',
  [T.BARREL]: 'barrel', [T.PILLAR]: 'pillar', [T.RUBBLE]: 'rubble', [T.FRAGILE]: 'crack', [T.FRAGILE2]: 'crack2',
  [T.POT]: 'pot', [T.SPORE]: 'spore',
};

export function drawRun(ctx: CanvasRenderingContext2D, run: Run, dt: number, time: number) {
  // play effects back in order (timeline.ts); frame time stands still during hitstop
  schedule(run.fx.splice(0));
  const tick = advance(dt);
  dt = tick.sdt;
  hitDirT += dt;
  if (hitDirT > 0.3) hitDir = null;
  const actorAt = (x: number, y: number): Actor | undefined => (run.p.x === x && run.p.y === y ? run.p : run.mobs.find(m => m.x === x && m.y === y));
  for (const f of tick.out) {
    const hs = hunterFx(f);
    if (hs >= 0) { shake(hs); continue; }
    switch (f.k) {
      case 'num': {
        const a = actorAt(f.x, f.y), v = parseInt(f.s, 10);
        addNum(f.x, f.y, f.s, f.col, !!f.dot, a && v > 0 ? v / a.maxHp : 0);
        if (f.s === 'missed') sfx('miss');
        else if (/^\d+!$/.test(f.s)) {
          // critical hit: short stop, flash, own sound, ring of sparks
          hitstop(0.06); sfx('crit');
          if (fxLevel() >= 1) critHits.push({ id: a ? a.id : -1, x: f.x, y: f.y, t: 0 });
          sparks.push({ x: f.x * TS + 8, y: f.y * TS + 7, col: '#ffcd75', big: true, t: 0 });
          burstBits(f.x * TS + 8, f.y * TS + 7, Math.round(8 * fxScale()), ['#ffcd75', '#f4f4f4'], 40, 100, 30);
          shake(3, hitDir);
        }
        break;
      }
      case 'shake': shake(f.n, hitDir); break;
      case 'cast': {
        pose(0, 'c', f.ult ? 0.4 : 0.28);
        auras.push({ col: f.col, ult: f.ult, t: 0 });
        burstBits(run.p.x * TS + 8, run.p.y * TS + 6, Math.round((f.ult ? 16 : 8) * Math.max(0.5, fxScale())), [f.col, '#f4f4f4'], 15, f.ult ? 70 : 40, 30, -20);
        break;
      }
      case 'bolt': bolts.push({ ...f, t: 0 }); sfx('zap'); setDir(f.x1 - f.x0, f.y1 - f.y0); if (f.x0 === run.p.x && f.y0 === run.p.y) pose(0, 'a'); break;
      case 'lunge': {
        startLunge(f.id, f.dx, f.dy); setDir(f.dx, f.dy); pose(f.id, 'a');
        const m = f.id ? run.mobs.find(o => o.id === f.id) : null;
        sfx(m && (m.boss || MOBS[m.kind]?.hunter || m.kind === 'golem') ? 'heavy' : 'hit');
        break;
      }
      case 'flash': {
        hitActor(f.id, hitDir);
        const a = f.id === 0 ? run.p : run.mobs.find(o => o.id === f.id);
        if (f.id === 0) { sfx('hurt'); hurtFlash(); }
        if (a && a.hp > 0) splat(f.id === 0 ? 'ratte' : a.kind, a.x, a.y, hitDir, f.id === 0 ? 4 : 3);
        break;
      }
      case 'die': {
        shake(onDeath(run, f.kind, f.x, f.y), hitDir); sfx('kill');
        const big = !!(MOBS[f.kind]?.boss || MOBS[f.kind]?.hunter);
        hitstop(big ? 0.12 : 0.07);
        splat(f.kind, f.x, f.y, hitDir, big ? 14 : 7);
        sparks.push({ x: f.x * TS + 8, y: f.y * TS + 7, col: '#f4f4f4', big: big, t: 0 });
        // loot glint: a few coins hop out and settle
        burstBits(f.x * TS + 8, f.y * TS + 8, big ? 8 : 3, ['#ffcd75', '#c98a3a'], 20, 45, 55);
        const n = noteKill(time);
        if (n >= 2) addNum(run.p.x, run.p.y - 1, `×${n}`, '#ffcd75', false, 0);
        break;
      }
      case 'loot': loot = { item: f.item, how: f.how, t: 0 }; sfx('pick'); break;
      case 'banner': banner = { title: f.title, sub: f.sub, col: f.col, t: 0 }; sfx(f.title === 'DONE!' ? 'solve' : 'level'); break;
      case 'boom': {
        booms.push({ x: f.x, y: f.y, r: f.r, t: 0 }); sfx('boom');
        const bx = f.x * TS + 8, by = f.y * TS + 8;
        if (!reducedFx()) smoke(bx, by - 2, 4 + f.r * 5, true);
        burstBits(bx, by, Math.round((6 + f.r * 6) * Math.max(0.5, fxScale())), ['#ffcd75', '#ef7d57', '#f4f4f4'], 40, 120, 50);
        // Fass: Dauben und Reifen fliegen davon
        if (f.barrel) burstBits(bx, by, 14, ['#8a5a3a', '#5a3a28', '#1c0f14', '#4a4d58'], 50, 130, 70);
        break;
      }
      case 'fireball': case 'arrow': {
        // Schütze: Held oder Gegner auf dem Startfeld zeigt seine Angriffs- bzw. Zauberpose
        if (f.x0 === run.p.x && f.y0 === run.p.y) pose(0, f.k === 'fireball' ? 'c' : 'a', 0.26);
        else { const m = run.mobs.find(o => o.x === f.x0 && o.y === f.y0); if (m) pose(m.id, 'a', 0.26); }
        const fire = f.k === 'fireball', d = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
        setDir(f.x1 - f.x0, f.y1 - f.y0);
        shots.push({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, t: 0, col: fire ? '#ef7d57' : f.col, r: fire ? f.r : 0,
          kind: fire ? 'fire' : f.heavy ? 'heavy' : 'arrow', dur: Math.min(fire ? 0.3 : 0.18, (fire ? 0.06 : 0.03) + d * (fire ? 0.03 : 0.018)) });
        sfx('zap');
        break;
      }
      case 'nova':
        pose(0, 'c', 0.32);
        rings.push({ x: f.x, y: f.y, r: f.r, t: 0 });
        burstBits(f.x * TS + 8, f.y * TS + 8, 26, ['#73eff7', '#c9d4dc', '#f4f4f4', '#41a6f6'], 40, 110, 10, 40);
        shake(3); sfx('zap');
        break;
      case 'bash':
        bashes.push({ x: f.x, y: f.y, dx: f.dx, dy: f.dy, t: 0 }); setDir(f.dx, f.dy);
        burstBits(f.x * TS + 8 - f.dx * 6, f.y * TS + 10 - f.dy * 6, 10, ['#94b0c2', '#c9d4dc', '#566c86'], 20, 60, 25);
        shake(4, [f.dx, f.dy]);
        break;
      case 'swipe':
        swipes.push({ x: f.x, y: f.y, dx: f.dx, dy: f.dy, big: f.big, t: 0 });
        if (f.big) shake(6, [f.dx, f.dy]);
        break;
      case 'pdeath': {
        deathT = 0;
        burstBits(f.x * TS + 8, f.y * TS + 8, 18, ['#b13e53', '#7d2b45', '#ef7d57'], 30, 90, 40);
        shake(8);
        break;
      }
      case 'break': {
        // destroyed object: debris in its material, dust for stone, a puff of flame for oil
        const bx = f.x * TS + 8, by = f.y * TS + 9;
        sfx(MAT_SOUND[f.mat]);
        const n0 = bits.length;
        burstBits(bx, by, Math.round((f.mat === 'web' ? 6 : 12) * Math.max(0.5, fxScale())), MAT_COLS[f.mat], 25, f.mat === 'oil' ? 60 : 90, f.mat === 'oil' ? 40 : 45, f.mat === 'oil' ? -30 : undefined);
        // splinters and shards stay on the floor for a while
        if (f.mat === 'wood' || f.mat === 'clay' || f.mat === 'stone') for (let k = n0; k < bits.length; k++) bits[k].rl = 10;
        if (!reducedFx() && (f.mat === 'stone' || f.mat === 'oil' || f.mat === 'fungus')) smoke(bx, by - 2, f.mat === 'oil' ? 6 : 3, f.mat === 'oil');
        if (f.mat === 'stone' || f.mat === 'metal') shake(2);
        break;
      }
      case 'slide': setDir(Math.sign(f.path[1][0] - f.path[0][0]), Math.sign(f.path[1][1] - f.path[0][1])); sfx('scrape'); slidePhase = 'move'; break;
      case 'debris':
        sfx('crack');
        for (let k = 0; k < 14; k++) {
          const ang = Math.random() * Math.PI * 2, v = 20 + Math.random() * 60, y0 = f.y * TS + 8;
          bits.push({ x: f.x * TS + 8, y: y0, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 40, col: Math.random() < 0.5 ? '#94b0c2' : '#566c86', t: 0, fy: y0 + 2 + Math.random() * 9 });
        }
        break;
    }
  }

  const p = run.p, pp = smooth(p, dt), sl = heroSlide();
  // ice slide: spray behind the feet while moving, a small bump when the hero stops
  if (sl?.phase === 'move' && fxLevel() > 0 && Math.random() < 0.5 + 0.5 * fxScale()) {
    const fx0 = pp.x * TS + 8 - sl.dx * 5, fy0 = pp.y * TS + 14 - sl.dy * 3;
    for (let k = 0; k < 2; k++) bits.push({ x: fx0 + (Math.random() - 0.5) * 6, y: fy0, vx: -sl.dx * (20 + Math.random() * 30) + (Math.random() - 0.5) * 24,
      vy: -sl.dy * (20 + Math.random() * 30) - 18 - Math.random() * 22, col: ICE_SPRAY[(Math.random() * ICE_SPRAY.length) | 0], t: 0, fy: fy0 + 1 + Math.random() * 3 });
  }
  if (slidePhase === 'move' && sl?.phase !== 'move') {
    slidePhase = null;
    if (sl) { shake(1, [sl.dx, sl.dy]); sfx('step'); burstBits(pp.x * TS + 8 + sl.dx * 5, pp.y * TS + 13 + sl.dy * 2, Math.round(4 * fxScale()) + 2, ICE_SPRAY, 10, 35, 15); }
  }
  // Held bleibt immer in der Bildmitte; jenseits des Kartenrands ist es einfach dunkel
  const tx = pp.x * TS + 8 - VW / 2, ty = pp.y * TS + 8 - VH / 2;
  if (Math.abs(tx - cam.x) > 220 || Math.abs(ty - cam.y) > 220) { cam.x = tx; cam.y = ty; }
  cam.x += (tx - cam.x) * Math.min(1, dt * 10); cam.y += (ty - cam.y) * Math.min(1, dt * 10);
  const [sx, sy] = stepShake(dt);
  const ox = -Math.round(cam.x) + sx, oy = -Math.round(cam.y) + sy;

  view.ox = ox - sx; view.oy = oy - sy;
  ctx.fillStyle = '#08090f'; ctx.fillRect(0, 0, VW, VH);
  const bio = biomeOf(run.floor), ts = tilesets[bio], boss = run.floor % 5 === 0, fx = !reducedFx();
  const zone = bareZone(run), props = propsFor(run.tiles, run.seed + run.floor, bio, zone);
  // floor marks on about every eleventh tile, never right next to another one (no clusters), none in a puzzle chamber
  const dseed = run.seed + run.floor * 7, dcand = (x: number, y: number) => hash(x, y, dseed) % 11 === 0;
  const decalAt = (x: number, y: number) => dcand(x, y) && !dcand(x - 1, y) && !dcand(x, y - 1) && !dcand(x - 1, y - 1) && !dcand(x + 1, y - 1)
    && !(zone && x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1);
  buildLight(run);
  const lights: Light[] = [], floorTiles: number[] = [];
  for (let k = critHits.length - 1; k >= 0; k--) {
    const c = critHits[k];
    if (c.t > CRIT_T + 0.12) { critHits.splice(k, 1); continue; }
    lights.push({ x: c.x, y: c.y, r: 2.4 * (1 - c.t / (CRIT_T + 0.12)), col: '#ffcd75', a: 0.9 });
    c.t += dt;
  }
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
      // Wandspielart fest am Feld: meist schlichte Mauer in vier Tönungen, sonst Riss, Abplatzer oder Biomstück
      // wall decor always hangs on the plain wall; elsewhere mostly the plain wall, sometimes a crack, chip or biome piece
      const wprop = t === T.WALL ? props[i] : null, plain = !!wprop || hash(x, y, 101) % 100 < 74;
      if (front) ctx.drawImage(plain ? ts.walls[hash(x, y, 111) % ts.walls.length] : ts.wallsX[hash(x, y, 121) % ts.wallsX.length], dx, dy);
      else {
        const c = [open(-1, -1), open(1, -1), open(-1, 1), open(1, 1)];
        const bits = (u ? 1 : 0) | (l ? 2 : 0) | (r ? 4 : 0), inner = !(bits || c.some(Boolean));
        // Glutschmiede: in der Mauerkrone fließt hier und da Lava (vier Bilder, Phase je Feld versetzt)
        ctx.drawImage(inner ? ts.top : ts.caps[hash(x, y, 606) % ts.caps.length][bits], dx, dy); // Kanten nur zu offenen Seiten, Mitte dunkler
        // Glutschmiede: Lavaader in der Mauerkrone – Richtung folgt der Wand, nie zwei nebeneinander
        const vein = (vx: number, vy: number) => hash(vx, vy, 202) % 5 === 0;
        if (!inner && ts.veins && vein(x, y) && !vein(x - 1, y) && !vein(x, y - 1) && !vein(x - 1, y - 1) && !vein(x + 1, y - 1)) {
          const set = (bits & 6) && !(bits & 1) ? ts.veins.v : ts.veins.h, vv = set[hash(x, y, 212) % set.length];
          ctx.drawImage(vv[(Math.floor(time * 5) + x + y) % vv.length], dx, dy);
          lights.push({ x, y, r: 1.8 * flick(i), col: '#ef7d57', a: 0.6 });
        }
        ctx.fillStyle = ts.hi;
        if (c[0] && !l && !u) ctx.fillRect(dx, dy, 2, 2);
        if (c[1] && !r && !u) ctx.fillRect(dx + TS - 2, dy, 2, 2);
        if (c[2] && !l) ctx.fillRect(dx, dy + TS - 2, 2, 2);
        if (c[3] && !r) ctx.fillRect(dx + TS - 2, dy + TS - 2, 2, 2);
      }
      // Wandfront: helle Kante zur offenen Seite, der Raumumriss bleibt rundum lesbar
      if (front) { ctx.fillStyle = ts.hi; if (l) ctx.fillRect(dx, dy, 2, 12); if (r) ctx.fillRect(dx + TS - 2, dy, 2, 12); }
      if (t === T.CRACKED) { const cs = ts.wallCrack[(run.cracks.get(i) ?? 0) >= 2 ? 1 : 0]; ctx.drawImage(cs[hash(x, y, 707) % cs.length], dx, dy); } // derselbe Riss wächst beim zweiten Schlag
      if (front && torches.has(i)) {
        const tf = Math.floor(time * 7 + x) % 2;
        ctx.drawImage(boss ? torchOf(bio, tf) : sprites[`torch${tf}`], dx, dy);
        lights.push({ x, y: y + 0.6, r: (boss ? 5.5 : 5) * flick(i), col: boss ? BOSS_FLAME[bio][0] : '#ef7d57' });
      } else if (front && wprop) drawProp(ctx, bio, wprop, x, y, dx, dy, time, lights); // chains, banners, roots … (placement keeps torches clear)
    } else {
      // floor from the per-level bake: pattern and brightness wave run across tile borders
      ctx.drawImage(floorOf(run, bio), x * TS, y * TS, TS, TS, dx, dy, TS, TS);
      // Ränder von Eis, Rasen und Brandfläche laufen gerastert in den Boden aus
      const edge = (k: number) => { let e = 0; [[0, -1, 1], [-1, 0, 2], [1, 0, 4], [0, 1, 8]].forEach(([ex, ey, bit]) => { const n = run.tiles[i + ey * W + ex]; if (n !== k && !wallLike(n)) e |= bit; }); return e; };
      if (t === T.ICE) ctx.drawImage(softEdged(sprites.ice, edge(T.ICE)), dx, dy);
      if (t === T.GRASS) ctx.drawImage(softEdged(ts.bed, edge(T.GRASS)), dx, dy);
      // large floor patterns (rune circle, 3×3): the neighbouring tiles draw their slice of it
      let covered = false;
      for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) {
        if (!sx && !sy) continue;
        const cx = x - sx, cy = y - sy, pr = cx >= 0 && cy >= 0 && cx < W && cy < H ? props[cy * W + cx] : null;
        if (pr && pr.kind === 'flat' && propSpan(bio, pr) > 1) { drawPropSlice(ctx, bio, pr, sx, sy, dx, dy, time, cx, cy); covered = true; }
      }
      drawAO(ctx, run.tiles, x, y, dx, dy);
      if (t >= T.OIL) drawWorldTile(ctx, run, t, i, x, y, dx, dy, time);
      if (t === T.FLOOR) {
        const pr = props[i];
        if (pr) drawProp(ctx, bio, pr, x, y, dx, dy, time, lights);
        else if (!covered && decalAt(x, y)) ctx.drawImage(pickDecal(ts.decals, bio, hash(x, y, run.seed + run.floor * 7)), dx, dy);
      }
      if (t === T.GRASS) ctx.drawImage(ts.grass[(x * 5 + y * 3) % 3], dx, dy);
      else if (t === T.BURNT) {
        // Brandfläche: Ruß mit gerastertem Rand, dichter Kern wo ringsum alles verbrannt ist, ab und zu verkohlte Reste
        const hb = hash(x, y, 505), e = edge(T.BURNT);
        ctx.drawImage(softEdged(ts.scorch[hb % ts.scorch.length], e), dx, dy);
        if (!e) ctx.drawImage(ts.scorchCore, dx, dy);
        if (hb % 5 === 0) ctx.drawImage(ts.char[(hb >>> 4) % ts.char.length], dx, dy);
        drawEmbers(ctx, i, x, y, dx, dy, time, lights); // frisch verbrannt: glimmt nach
      }
      floorTiles.push(i);
    }
  }
  // Spuren am Boden liegen über dem Boden, aber unter Gegenständen, Fallen und Figuren
  pruneFire(run.fire);
  fireBlocks.clear();
  shimmerLeft = 8;
  drawDecals(ctx, run, ox, oy, lights, time, dt);
  drawSpots(ctx, run, ox, oy, dt);
  drawGas(ctx, run, ox, oy, time);
  if (fx) drawFog(ctx, bio, run.tiles, run.vis, x0, y0, x1, y1, ox, oy, time, VW, VH);
  for (const i of floorTiles) {
    const x = i % W, y = (i / W) | 0, t = run.tiles[i], dx = x * TS + ox, dy = y * TS + oy;
    const s = TILE_SPR[t];
    if (t === T.CRATE_ON) ctx.drawImage(sprites.plate, dx, dy);
    if (t === T.TRADER) {
      // Händler: Teppich unter ihm, Laterne als Licht, Münze über dem Kopf, solange es etwas zu kaufen gibt
      ctx.fillStyle = '#5d275d'; ctx.fillRect(dx, dy + 12, TS, 4);
      ctx.fillStyle = '#9a4fc0'; ctx.fillRect(dx + 1, dy + 12, TS - 2, 1);
      ctx.fillStyle = '#ffcd75'; for (let k = 1; k < TS - 1; k += 3) ctx.fillRect(dx + k, dy + 14, 1, 1);
      lights.push({ x: x - 0.4, y: y + 0.1, r: 2.6 * flick(i), col: '#ffcd75', a: 0.85 });
    }
    const sh = OBJ_SHADOW[t];
    if (sh) dropShadow(ctx, dx + 8, dy + sh[0], sh[1]);
    // Lunte: Fass zittert im letzten Zug, Zähler der verbleibenden Züge darüber
    const fz = t === T.BARREL ? run.fuses.get(i) : undefined;
    const sname = t === T.TRADER && Math.floor(time * 1.6 + x) % 2 ? 'trader_b' : t === T.STATUE && run.puzzle && x === run.puzzle.x + 6 ? 'statue_l' : VARIANTS[t] ? objectSprite(run, i, t) : s;
    // Mimik: sieht aus wie eine Truhe, aber alle paar Sekunden zuckt der Deckel und ein Zahn blitzt
    const twitch = t === T.MIMIC && (time * 0.22 + (i % 13) * 0.071) % 1 < 0.045;
    if (s) ctx.drawImage(sprites[sname], dx + (fz === 1 ? Math.round(Math.sin(time * 60)) : 0), dy - (twitch ? 1 : 0));
    if (twitch) { ctx.fillStyle = '#f4f4f4'; ctx.fillRect(dx + 4, dy + 6, 1, 2); ctx.fillRect(dx + 8, dy + 6, 1, 2); ctx.fillRect(dx + 11, dy + 6, 1, 1); }
    if (t === T.TRADER && run.shop.some(o => !o.sold)) drawIcon(ctx, ['coin'], dx + 4, dy - 11 + Math.round(Math.sin(time * 3) * 1.5), '#ffcd75');
    if (fz !== undefined && run.vis[i]) { fuseTags.push({ x: dx + 8 - ox, y: dy - 10 - oy, n: fz }); lights.push({ x, y: y - 0.4, r: 1.3, col: '#ffcd75', a: 0.7 }); }
    if (t === T.CRATE_ON) { ctx.fillStyle = 'rgba(255,205,117,0.3)'; ctx.fillRect(dx + 1, dy + 1, 14, 14); }
    if (t === T.GOAL) { ctx.fillStyle = `rgba(115,239,247,${0.15 + 0.1 * Math.sin(time * 4)})`; ctx.fillRect(dx, dy, TS, TS); lights.push({ x, y, r: 2.2, col: '#73eff7', a: 0.8 }); }
    if (t === T.FOUNTAIN) lights.push({ x, y, r: 2.4, col: '#41a6f6', a: 0.7 });
    if (t === T.BRAZIER_ON) lights.push({ x, y: y - 0.3, r: 2.2 * flick(i), col: '#ef7d57', a: 0.8 });
    // Eiskristall: funkelnder Splitter auf dem Eis
    if (t === T.ICE && run.puzzle?.gems?.includes(i)) {
      const tw = Math.sin(time * 5 + i) > 0.6;
      ctx.fillStyle = '#1a1c2c'; ctx.fillRect(dx + 6, dy + 2, 4, 12); ctx.fillRect(dx + 4, dy + 5, 8, 6);
      ctx.fillStyle = '#73eff7'; ctx.fillRect(dx + 7, dy + 3, 2, 10); ctx.fillRect(dx + 5, dy + 6, 6, 4);
      ctx.fillStyle = tw ? '#f4f4f4' : '#c9d4dc'; ctx.fillRect(dx + 7, dy + 4, 1, 4);
      lights.push({ x, y, r: 1.6, col: '#73eff7', a: 0.6 });
    }
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
      // Flammen wachsen mit der Restdauer; frisches Feuer raucht und sprüht Funken
      const k = Math.min(1, (run.fire.get(i) ?? 1) / 3), f = run.fire;
      const nb = (f.has(i - W) ? 1 : 0) | (f.has(i - 1) ? 2 : 0) | (f.has(i + 1) ? 4 : 0) | (f.has(i + W) ? 8 : 0);
      const kind = t === T.OIL ? 'oil' : t === T.GRASS ? 'grass' : 'plain';
      // heat shimmer copies the frame onto itself: costly, so only on strong effects and for a few tiles
      drawFlames(ctx, dx, dy, x, y, k, time, nb, kind, fireAge(i, time), fxLevel() >= 2 && shimmerLeft-- > 0);
      // one light per 3×3 block (merged below): a large fire breathes as a whole and does not overexpose
      const bk = ((y / 3) | 0) * 64 + ((x / 3) | 0), fb = fireBlocks.get(bk);
      if (fb) { fb.x += x; fb.y += y; fb.n++; fb.k = Math.max(fb.k, k); } else fireBlocks.set(bk, { x, y, n: 1, k });
      if (fx && Math.random() < dt * (0.8 + 2.5 * k)) smoke(x * TS + 8, y * TS + 4 - 4 * k);
      if (fx && Math.random() < dt * 5 * k) bits.push({ x: x * TS + 3 + Math.random() * 10, y: y * TS + 6, vx: (Math.random() - 0.5) * 10, vy: -25 - Math.random() * 20, col: Math.random() < 0.5 ? '#ffcd75' : '#ef7d57', t: 0, g: -15 });
    }
    if (t === T.ALTAR) lights.push({ x, y, r: 2.6 + 0.3 * Math.sin(time * 3), col: '#73eff7', a: 0.8 });
    if (t === T.STAIRS) lights.push({ x, y, r: 1.9 + 0.2 * Math.sin(time * 2), col: '#94b0c2', a: 0.8 }); // Wegweiser nach unten
  }
  for (const t of run.traps) ctx.drawImage(sprites.trap, t.x * TS + ox, t.y * TS + oy);
  // Entdeckte Bodenfallen (unentdeckte bleiben unsichtbar)
  for (const h of run.hazards) if (h.seen && run.seen[h.y * W + h.x]) ctx.drawImage(sprites[`haz_${h.kind}`], h.x * TS + ox, h.y * TS + oy);
  // Pfeilgang: Reihen, die im nächsten Zug schießen, leuchten rot
  const lanes = dartWarn(run);
  if (lanes.length && run.puzzle) {
    ctx.fillStyle = `rgba(177,62,83,${(0.28 + 0.1 * Math.sin(time * 8)).toFixed(3)})`;
    for (const ly of lanes) for (let lx = run.puzzle.x; lx < run.puzzle.x + 7; lx++) if (run.seen[ly * W + lx] && walkable(run.tiles[ly * W + lx])) ctx.fillRect(lx * TS + ox, ly * TS + oy, TS, TS);
  }
  // Ereignis: Felder, die im nächsten Zug getroffen werden, und das Zielfeld (Geist, leuchtende Truhe)
  const hw = run.hunt ? hunterWarn(run) : [];
  if (run.warn?.length || hw.length) {
    // rote Felder: Fläche plus heller Rand, damit sie auch auf rötlichem Boden (Schmiede) auffallen
    const pulse = 0.32 + 0.12 * Math.sin(time * 9);
    for (const i of [...(run.warn ?? []), ...hw]) {
      if (!run.seen[i]) continue;
      const x = (i % W) * TS + ox, y = ((i / W) | 0) * TS + oy;
      ctx.fillStyle = `rgba(177,62,83,${pulse.toFixed(3)})`; ctx.fillRect(x, y, TS, TS);
      ctx.fillStyle = `rgba(255,120,120,${(pulse + 0.3).toFixed(3)})`;
      ctx.fillRect(x + 1, y + 1, TS - 2, 1); ctx.fillRect(x + 1, y + TS - 2, TS - 2, 1); ctx.fillRect(x + 1, y + 2, 1, TS - 4); ctx.fillRect(x + TS - 2, y + 2, 1, TS - 4);
    }
    if (hw.length) drawHunterMarks(ctx, run, ox, oy, time, lights);
  }
  // Ziele: Geist, leuchtende Truhe, Altar (eins) oder Kerzen, Pilze, Kühlplatten (mehrere)
  if (run.ev && (run.ev.mark !== undefined || run.ev.marks?.length)) {
    const e = run.ev, look = e.data.look ?? 0, chest = !!e.data.chest;
    const LOOK: [string, string][] = [[chest ? 'chest' : 'irrlicht', chest ? '#ffcd75' : '#73eff7'], ['brazier', '#ffcd75'], ['leuchtpilz', '#73eff7'], ['kuehl', '#41a6f6'], ['altar', '#a7f070']];
    const [spr, col] = LOOK[look] ?? LOOK[0], bob = look === 0 && !chest;
    for (const i of e.mark !== undefined ? [e.mark] : e.marks!) {
      const mx = i % W, my = (i / W) | 0;
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time * 5 + i);
      ctx.drawImage(sprites[spr], mx * TS + ox, my * TS + oy - (bob ? 2 + Math.round(Math.sin(time * 3)) : 0));
      ctx.globalAlpha = 1;
      lights.push({ x: mx, y: my, r: 2.2 + 0.3 * Math.sin(time * 4 + i), col, a: 0.85 });
    }
  }
  // Schlamm eines Ereignisses
  if (run.mud?.length) {
    ctx.fillStyle = 'rgba(90,58,40,0.55)';
    for (const i of run.mud) if (run.seen[i]) ctx.fillRect((i % W) * TS + ox, ((i / W) | 0) * TS + oy, TS, TS);
  }
  // hunted: the stairs glow and pulse so the way out is clear
  if (hunted(run)) {
    const st = run.tiles.indexOf(T.STAIRS);
    if (st >= 0 && run.seen[st]) {
      const sxp = st % W, syp = (st / W) | 0, pu = 0.5 + 0.5 * Math.sin(time * 4);
      lights.push({ x: sxp, y: syp, r: 2.4 + pu * 1.2, col: '#ffcd75', a: 0.9 });
      if (Math.random() < dt * 8) bits.push({ x: sxp * TS + 3 + Math.random() * 10, y: syp * TS + 12, vx: 0, vy: -20 - Math.random() * 10, col: '#ffcd75', t: 0, g: -10 });
    }
  }
  // merged fire lights: centroid of the burning tiles, a bit wider for bigger blocks, redder as the fire dies
  for (const [bk, b] of fireBlocks) lights.push({ x: b.x / b.n, y: b.y / b.n, r: (2.2 + 1.4 * b.k) * (1 + 0.15 * Math.sqrt(b.n - 1)) * flick(bk), col: b.k <= 0.34 ? '#b13e53' : '#ef7d57' });
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
    if (mk.has('netz')) {
      // web: grey threads over the actor
      ctx.globalAlpha = 0.75; ctx.fillStyle = '#c9d4dc';
      for (let k = 0; k < w; k += 3) { ctx.fillRect(dx + k, dy + h - 6 + ((k >> 1) & 1), 2, 1); ctx.fillRect(dx + k + 1, dy + h - 10 + ((k >> 2) & 1), 1, 1); }
      ctx.fillRect(dx + 2, dy + h - 10, 1, 5); ctx.fillRect(dx + w - 3, dy + h - 9, 1, 4);
      ctx.globalAlpha = 1;
    }
    if (mk.has('mark')) {
      // marked: golden crosshair slowly tightening
      const r = 9 + Math.round(Math.sin(time * 4) * 1.5), my = dy + h / 2;
      ctx.fillStyle = '#ffcd75';
      for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const px = Math.round(cx + ax * r), py = Math.round(my + ay * r * 0.8); ctx.fillRect(px - (ax > 0 ? 2 : 0), py, 3, 1); ctx.fillRect(px, py - (ay > 0 ? 2 : 0), 1, 3); }
    }
    if (mk.has('schwach')) {
      // weakened: small down arrow next to the head
      const ax = dx + w - 2, ay = dy + 1 + (Math.floor(time * 3) % 2);
      ctx.fillStyle = '#1a1c2c'; ctx.fillRect(ax - 2, ay - 1, 5, 6);
      ctx.fillStyle = '#b13e53'; ctx.fillRect(ax, ay, 1, 3); ctx.fillRect(ax - 1, ay + 2, 3, 1); ctx.fillRect(ax, ay + 3, 1, 1);
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
    const asl = a === p ? heroSlide() : null;
    const moving = !asl && Math.abs(q.x - a.x) + Math.abs(q.y - a.y) > 0.04;
    const fr = moving ? [2, 0, 3, 0][Math.floor(time * 11) % 4] : Math.floor(time * 2.5 + a.id * 0.37) % 2;
    // Bosse zeigen ab halber Lebenskraft ihre verwundete Fassung (nur gelesen, keine Logik)
    const base = a === p ? lookOf(p) : a.boss && a.hp * 2 < a.maxHp && sprites[`${a.kind}2:f0`] ? `${a.kind}2` : a.kind, an = peekAnim(a.id), ps = an?.pose;
    // Tod des Helden: einknicken, kippen, liegen bleiben; sonst Pose (Angriff/Zauber) vor Schrittbild
    let frame = `${base}:${v}${fr}`;
    if (a === p && deathT >= 0) frame = `${base}:${v}d${deathT < 0.14 ? 0 : deathT < 0.3 ? 1 : 2}`;
    else if (ps && sprites[`${base}:${v}${ps.k}`]) frame = `${base}:${v}${ps.k}`;
    const img = sprites[frame];
    const l = an?.lunge, k = l ? lungeOffset(l.t, a === p ? 1 : weightOf(a.kind)) : 0;
    // telegraph: an enemy that can strike next turn leans back from the hero, pulsing
    const th = a !== p && !l && fxLevel() > 0 ? threatOf(run, a) : null, tp = th ? (Math.sin(time * 8 + a.id) > 0 ? 1 : 0) : 0;
    const tlx = th ? -Math.sign(p.x - a.x) * tp : 0, tly = th ? -Math.sign(p.y - a.y) * tp : 0;
    // flyers hover
    const bob = FLY.has(a.kind) && !l ? Math.round(Math.sin(time * 4 + a.id) * 1.5) : 0;
    // recoil: 2 px away from the attacker, decays over RECOIL_T; plus a short squash
    const rc = an?.recoil, rk = rc ? (1 - rc.t / RECOIL_T) * 2 : 0, sq = an && an.hurt < 0.1 && fxLevel() > 0 ? 1 - an.hurt / 0.1 : 0;
    const glow = GLOW[base.split(':')[0]] ?? GLOW[a.kind];
    const jx = glow ? Math.round(Math.sin(time * 17 + a.id) * 0.6) : 0;
    // ice bump: the body runs on 2 px past the stop and settles back
    const bump = asl?.phase === 'bump' ? Math.sin(asl.u * Math.PI) * 2 : 0;
    const bx = Math.round(q.x * TS + (l ? l.dx * k : 0) + (rc ? rc.dx * rk : 0) + (asl ? asl.dx * bump : 0)) + tlx + ox, by = Math.round(q.y * TS + (l ? l.dy * k : 0) + (rc ? rc.dy * rk : 0) + (asl ? asl.dy * bump : 0)) + tly + oy;
    const hunt = a !== p && isHunter(a);
    const dx = bx + 8 - img.width / 2 + jx, dy = by + 14 - img.height - Math.round(leapLift(a.id)) + bob;
    // squash on hit: wider and flatter, feet stay on the ground
    // sliding: crouched a little (sideways the lean shows it, up/down a slight squash); the stop squashes once more
    const ssq = !asl || fxLevel() === 0 ? 0 : asl.phase === 'bump' ? 0.12 * Math.sin(asl.u * Math.PI) : asl.dx ? 0 : 0.06;
    const sw = sq ? Math.round(img.width * (1 + 0.15 * sq)) : ssq ? Math.round(img.width * (1 + ssq)) : img.width, sh = sq ? Math.round(img.height * (1 - 0.15 * sq)) : ssq ? Math.round(img.height * (1 - ssq)) : img.height;
    const qx = dx - ((sw - img.width) >> 1), qy = dy + (img.height - sh);
    // hurt: the body leans away from the blow for a moment (shear anchored at the feet)
    // sliding sideways: the body leans back against the direction of travel (eases in, springs upright at the stop)
    const slean = asl && asl.dx ? -asl.dx * (asl.phase === 'move' ? 0.2 * Math.min(1, asl.u * 4 + 0.4) : 0.2 * (1 - asl.u) - 0.06 * Math.sin(asl.u * Math.PI)) : 0;
    const lean = fxLevel() > 0 ? hurtLean(an) * (rc ? Math.sign(rc.dx) || 1 : 1) + slean : 0;
    const blit = (c: HTMLCanvasElement) => {
      if (!mirror && !lean) { ctx.drawImage(c, qx, qy, sw, sh); return; }
      ctx.save();
      if (lean) { ctx.translate(qx + sw / 2, qy + sh); ctx.transform(1, 0, -lean, 1, 0, 0); ctx.translate(-(qx + sw / 2), -(qy + sh)); }
      if (mirror) { ctx.translate(qx + sw, qy); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0, sw, sh); } else ctx.drawImage(c, qx, qy, sw, sh);
      ctx.restore();
    };
    // Bodenschatten; Flieger werfen einen kleineren, atmenden Schatten
    const fly = FLY.has(a.kind), foot = by + 14;
    if (fly) dropShadow(ctx, bx + 8, foot, 8 + (Math.sin(time * 5 + a.id) > 0 ? 2 : 0), glow ? 0.5 : 0.8);
    else dropShadow(ctx, bx + 8, foot, a.boss || hunt ? Math.max(22, img.width - 4) - leapLift(a.id) : 12, glow ? 0.5 : 1);
    if (hunt) drawHunterAura(ctx, a, q, bx, foot, time, dt, lights);
    // Ausweichen: Held flackert halbdurchsichtig
    if (statusMarks(a, a === p).includes('dodge')) ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 18);
    blit(img);
    ctx.globalAlpha = 1;
    if (a === p && p.st.stein) stoneOverlay(ctx, () => blit(masks[frame]), dx, dy, img.width);
    const hg = hunt ? hunterGlow(a, time) : null;
    if (hg) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, hg[1]); blit(masks[frame]);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
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
    if (a.ev && a !== p) {
      // Ereignisgegner: kleines Ausrufezeichen über dem Kopf
      ctx.fillStyle = '#ffcd75'; ctx.fillRect(dx + 7, dy - 6, 2, 3); ctx.fillRect(dx + 7, dy - 2, 2, 1);
    }
    if (a.elite) {
      ctx.fillStyle = '#ffcd75';
      ctx.fillRect(dx + 5, dy - 3, 1, 2); ctx.fillRect(dx + 8, dy - 4, 1, 3); ctx.fillRect(dx + 11, dy - 3, 1, 2); ctx.fillRect(dx + 5, dy - 1, 7, 1);
      lights.push({ x: q.x, y: q.y, r: 1.8, col: '#ffcd75', a: 0.6 });
    }
    // status tints the actor: poison green, burning orange, ice/brittle blue, web violet
    const tint = a.st.gift ? '#38b764' : a.st.brand ? '#ef7d57' : a.st.sproede || a.st.eis ? '#73eff7' : a.st.netz ? '#9a4fc0' : null;
    if (tint && masks[frame]) { ctx.globalAlpha = 0.22 + 0.08 * Math.sin(time * 6 + a.id); blit(tinted(masks[frame], tint)); ctx.globalAlpha = 1; }
    const fl = an?.flash;
    if (fl) { ctx.globalAlpha = Math.min(1, fl / FLASH_T + 0.2); blit(masks[frame]); ctx.globalAlpha = 1; }
    if (masks[frame] && critHits.some(c => c.id === a.id && c.t < CRIT_T)) { blit(masks[frame]); blit(masks[frame]); }
    statusFx(a, a === p, dx, dy, img.width, img.height, q);
    if (a !== p) warn(a, q, dx, dy, img.width);
    if (run.target && a.id === run.target) {
      ctx.fillStyle = '#ffcd75';
      for (const [cx, cy] of [[0, 0], [13, 0], [0, 13], [13, 13]]) { ctx.fillRect(bx + cx, by + cy, 3, 1); ctx.fillRect(bx + (cx ? 15 : 0), by + cy - (cy ? 2 : 0), 1, 3); }
    }
    if (hunt) drawHunterBar(ctx, a, bx, dy, time);
    else if (a !== p && a.hp < a.maxHp) {
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
  // Aimed-at object (barrel, pot, ...): the enemy marker's corner brackets in cyan, breathing, with ticks toward the centre
  if (run.tgt !== undefined && aimable(run, run.tgt)) {
    const tx = (run.tgt % W) * TS + ox, ty = ((run.tgt / W) | 0) * TS + oy, o = Math.sin(time * 6) > 0 ? 1 : 0;
    const mark = (sx: number, col: string) => {
      ctx.fillStyle = col;
      for (const [cx, cy] of [[0, 0], [13, 0], [0, 13], [13, 13]]) {
        const qx = tx + sx + cx + (cx ? o : -o), qy = ty + sx + cy + (cy ? o : -o);
        ctx.fillRect(qx, qy, 3, 1); ctx.fillRect(qx + (cx ? 2 : 0), qy - (cy ? 2 : 0), 1, 3);
      }
      ctx.fillRect(tx + sx + 7, ty + sx - 1 - o, 2, 2); ctx.fillRect(tx + sx + 7, ty + sx + 15 + o, 2, 2);
      ctx.fillRect(tx + sx - 1 - o, ty + sx + 7, 2, 2); ctx.fillRect(tx + sx + 15 + o, ty + sx + 7, 2, 2);
    };
    mark(1, '#0d0e17'); mark(0, '#73eff7');
    lights.push({ x: run.tgt % W, y: (run.tgt / W) | 0, r: 1.4, col: '#73eff7', a: 0.5 });
  }
  // Bossaura (der Schmiedefürst glüht ohnehin)
  for (const [m, q] of order) if (m.boss && !GLOW[m.kind]) lights.push({ x: q.x, y: q.y, r: 3.2, col: BOSS_FLAME[bio][0], a: 0.5 });
  // Schwebeteilchen: Staub, Sporen, Asche liegen im Lichtschein
  if (fx) { stepAmbient(bio, run.tiles, run.vis, x0, y0, x1, y1, dt); drawAmbient(ctx, ox, oy, false); }
  drawSmoke(ctx, ox, oy, dt);

  if (bits.length > BIT_MAX) bits.splice(0, bits.length - BIT_MAX);
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.t += dt;
    // heavy particles land on the floor, rest briefly and fade
    if (b.rest !== undefined) {
      b.rest += dt;
      const life = b.rl ?? REST_T;
      if (b.rest > life) { bits.splice(i, 1); continue; }
      ctx.globalAlpha = b.rest > life - 0.6 ? (life - b.rest) / 0.6 * 0.8 : 0.8;
      ctx.fillStyle = b.col; ctx.fillRect(Math.round(b.x) + ox, Math.round(b.y) + oy, 1, 1);
      continue;
    }
    if (b.t > BIT_T && b.fy === undefined) { bits.splice(i, 1); continue; }
    if (b.t > 1.2) { bits.splice(i, 1); continue; }
    b.vy += (b.g ?? 220) * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.fy !== undefined && b.vy > 0 && b.y >= b.fy) { b.y = b.fy; b.rest = 0; if (reducedFx()) { bits.splice(i, 1); continue; } }
    ctx.globalAlpha = b.fy !== undefined ? 1 : 1 - b.t / BIT_T;
    ctx.fillStyle = b.col; ctx.fillRect(Math.round(b.x) + ox, Math.round(b.y) + oy, 2, 2);
  }
  ctx.globalAlpha = 1;
  for (let i = booms.length - 1; i >= 0; i--) {
    const b = booms[i];
    b.t += dt;
    const dur = 0.28 + 0.06 * b.r;
    if (b.t > dur) { booms.splice(i, 1); continue; }
    const f = b.t / dur, cx = b.x * TS + 8 + ox, cy = b.y * TS + 8 + oy, rad = (b.r + 0.5) * TS * (0.4 + 0.6 * f);
    // Druckwelle: dünner Ring, der schneller wächst als der Feuerball
    const wr = (b.r + 1) * TS * Math.min(1, f * 1.6), steps = Math.max(24, Math.round(wr * 1.4));
    ctx.globalAlpha = Math.max(0, 0.8 - f);
    ctx.fillStyle = '#f4f4f4';
    for (let k = 0; k < steps; k++) { const a = (k / steps) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(a) * wr), Math.round(cy + Math.sin(a) * wr * 0.8), 1, 1); }
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
  // cast glow: a ring in the class colour that widens around the hero
  for (let i = auras.length - 1; i >= 0; i--) {
    const u = auras[i], dur = u.ult ? 0.45 : 0.28;
    u.t += dt;
    if (u.t > dur) { auras.splice(i, 1); continue; }
    const f = u.t / dur, rad = 5 + f * (u.ult ? 18 : 11), cx = pp.x * TS + 8 + ox, cy = pp.y * TS + 9 + oy, steps = Math.round(rad * 3);
    ctx.globalAlpha = 1 - f; ctx.fillStyle = u.col;
    for (let k = 0; k < steps; k++) { const ang = (k / steps) * Math.PI * 2; if ((k + Math.floor(time * 20)) % 3) ctx.fillRect(Math.round(cx + Math.cos(ang) * rad), Math.round(cy + Math.sin(ang) * rad * 0.6), 1, 1); }
    ctx.globalAlpha = 1;
    lights.push({ x: pp.x, y: pp.y, r: 2 + (u.ult ? 3 : 1.5) * (1 - f), col: u.col, a: 0.8 });
  }
  stepHunterFx(ctx, ox, oy, dt, lights, time);
  for (const b of booms) lights.push({ x: b.x, y: b.y, r: (4 + 1.5 * b.r) * Math.max(0, 1 - b.t / (0.28 + 0.06 * b.r)) + 1, col: '#ffcd75' });
  for (const b of bolts) lights.push({ x: b.x1, y: b.y1, r: 2, col: b.col === '#1a1c2c' ? undefined : b.col, a: 0.7 });
  const amb = AMBIENTS[bio];
  applyLight(ctx, run, lights, ox, oy, boss ? { ...amb, dark: Math.min(0.9, amb.dark + 0.05) } : amb, VW, VH, fx);
  if (fx) drawAmbient(ctx, ox, oy, true); // Glutfunken leuchten selbst
  postFx(ctx, bio, VW, VH);
  // Lunten-Zähler über der Dunkelheit
  for (const f of fuseTags.splice(0)) text(ctx, String(f.n), f.x + ox, f.y + oy + (f.n === 1 ? Math.round(Math.sin(time * 30)) : 0), f.n === 1 ? '#b13e53' : '#ffcd75', 8, 'center');
  // screen flashes below the numbers, then numbers above the darkness so they stay readable
  drawScreenFlash(ctx, VW, VH, dt);
  drawNums(ctx, ox, oy, dt);
  if (p.hp / p.maxHp < 0.3 && run.mode === 'play') {
    ctx.fillStyle = `rgba(177,62,83,${0.08 + 0.06 * Math.sin(time * 6)})`; ctx.fillRect(0, 0, VW, VH);
  }

  tooltip(ctx, run, ox - sx, oy - sy);
  if (loot) { loot.t += dt; if (loot.t > 7) loot = null; }
  hud(ctx, run, time);
  if (banner) {
    banner.t += dt;
    if (banner.t > 3.2) banner = null;
    else {
      const a = Math.min(1, banner.t * 5, (3.2 - banner.t) * 2), sub = banner.sub, w = Math.max(banner.title.length * 12, sub.length * 6) + 28;
      ctx.globalAlpha = a;
      panel(ctx, VW / 2 - w / 2, 78, w, 44, banner.col);
      text(ctx, banner.title, VW / 2, 84, banner.col, 16, 'center');
      text(ctx, banner.sub, VW / 2, 106, '#f4f4f4', 8, 'center');
      ctx.globalAlpha = 1;
    }
  }
  if (mapMode) minimap(ctx, run, time);
  if (overlay === 'char') charSheet(ctx, run);
  else if (overlay === 'help') helpSheet(ctx);
  else if (overlay === 'log') logSheet(ctx, run);
  else if (overlay === 'inv') invSheet(ctx, run, time);
  if (run.mode === 'perk') perkOverlay(ctx, run);
  if (run.mode === 'tree') treeOverlay(ctx, run);
  if (run.mode === 'shop') shopOverlay(ctx, run, time);
  if (deathT >= 0 && run.mode === 'dead') {
    deathT += dt;
    const f = Math.min(1, deathT / DEATH_T);
    ctx.fillStyle = `rgba(177,62,83,${Math.max(0, 0.45 - deathT * 0.9)})`; ctx.fillRect(0, 0, VW, VH);
    const g = ctx.createRadialGradient(VW / 2, VH / 2, 40, VW / 2, VH / 2, VW * 0.65);
    g.addColorStop(0, 'rgba(13,14,23,0)'); g.addColorStop(1, `rgba(13,14,23,${0.85 * f})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
  if (run.mode === 'win' || (run.mode === 'dead' && ((deathT < 0 && !busy()) || deathT > DEATH_T))) endOverlay(ctx, run);
}

// ---- Oberfläche ----
type Overlay = 'none' | 'char' | 'help' | 'inv' | 'log';
let overlay: Overlay = 'none';
export const getOverlay = () => overlay;
export const setOverlay = (o: Overlay) => { overlay = o; };

interface Slot { key: string; icon: string; name: string; desc: string; cost: string; count: string; ok: boolean; gap?: number; }

function slots(run: Run): Slot[] {
  const p = run.p, c = CLASSES[p.cls], out: Slot[] = [];
  if (c.range) out.push({ key: 'F', icon: `i_${p.cls}_shot`, name: c.shot, desc: `Ranged attack, ${shotRange(p)} tiles. Costs nothing.`, cost: '', count: '', ok: true });
  c.skills.forEach((s, k) => out.push({ key: `${k + 1}`, icon: `i_${p.cls}${k}`, name: p.skillLvl[k] ? `${s.name} ${RANKS[p.skillLvl[k]]}` : s.name, desc: `${s.desc}.${skillModName(p, k) ? ` ${skillModName(p, k)}.` : ''} Costs ${skillCost(p, k)} ${c.resName}.`, cost: `${skillCost(p, k)}`, count: '', ok: skillReady(p, k) }));
  (p.spells ?? []).forEach((id, k) => { const sp = NEW_SKILLS[id], i = 3 + k; out.push({ key: `${4 + k}`, icon: `i_${p.cls}${sp.branch}`, name: sp.name, desc: `${sp.desc}. Costs ${skillCost(p, i)} ${c.resName}.`, cost: `${skillCost(p, i)}`, count: '', ok: skillReady(p, i) }); });
  if (p.lvl >= ULT_LEVEL) out.push({ key: 'U', gap: 5, icon: 'ult', name: ULT[p.cls].name, desc: `${ULT[p.cls].desc}. Then ${ULT[p.cls].cost} turns of cooldown.`, cost: '', count: p.ultCd ? `${p.ultCd}` : '', ok: !p.ultCd });
  out.push({ key: 'Q', gap: 5, icon: 'potion', name: 'Healing Potion', desc: 'Restores a large part of your health and cures poison and burning.', cost: '', count: `${p.potions}`, ok: p.potions > 0 });
  out.push({ key: 'B', gap: 5, icon: 'bomb', name: 'Bomb', desc: 'Blasts enemies, cracked walls and pillars. Keep your distance.', cost: '', count: `${p.bombs}`, ok: p.bombs > 0 });
  // Verbrauchsgegenstände erscheinen nur, solange man welche trägt
  USE_ORDER.forEach((id, k) => { const n = p.bag.filter(it => it.use === id).length; if (n) out.push({ key: `${(k + 7) % 10}`, gap: 10, icon: `i_${id}`, name: CONSUMABLES[id].name, desc: `${CONSUMABLES[id].desc}.`, cost: '', count: `${n}`, ok: true }); });
  return out;
}

// ---- Status bar: effects and buffs in the first row, passives in the second (under the health bar) ----
const SB = { x: 3, y: 23, cell: 11, step: 12, width: 202 };
interface StatusCell { e: StatusEntry; x: number; y: number; }
// Icon positions; the same layout serves drawing, hover and the tile tooltip guard
// The second row may meet the centred tutorial/hint panel (top y 36): it then stops left of it
let sbRight = VW;
function centreLeft(run: Run): number {
  if (!tutorial || run.mode !== 'play') return VW;
  if (tutStep) return (VW - (Math.max(`Tutorial ${tutStep.k}/${tutStep.n}`.length + 18, tutStep.text.length) * 6 + 20)) >> 1;
  const h = hint(run);
  return h ? (VW - (h.length * 6 + 16)) >> 1 : VW;
}
export function statusCells(run: Run): StatusCell[] {
  const all = statusList(run), per = Math.floor(SB.width / SB.step), out: StatusCell[] = [];
  const per2 = Math.max(4, Math.min(per, Math.floor((sbRight - 4 - SB.x + 1) / SB.step)));
  const temps = all.filter(e => e.kind !== 'passive').slice(0, per), pass = all.filter(e => e.kind === 'passive');
  // one row of effects (there are far fewer at once), then one row of passives; too many passives fold into a group icon
  temps.forEach((e, k) => out.push({ e, x: SB.x + k * SB.step, y: SB.y }));
  const y2 = SB.y + (temps.length ? SB.step : 0);
  groupPassives(pass, y2 > SB.y ? per2 : per).forEach((e, k) => out.push({ e, x: SB.x + k * SB.step, y: y2 }));
  return out;
}
const statusAt = (cells: StatusCell[]) => cells.find(c => mouse.x >= c.x && mouse.x < c.x + SB.cell && mouse.y >= c.y && mouse.y < c.y + SB.cell) ?? null;
// 3x5 digits for the turn counter on an icon
const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];
function tinyNum(ctx: CanvasRenderingContext2D, n: number, right: number, bottom: number, col: string) {
  const s = String(Math.min(99, n)), w = s.length * 4 - 1, x0 = right - w, y0 = bottom - 5;
  ctx.fillStyle = 'rgba(8,9,15,0.85)'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, 7);
  ctx.fillStyle = col;
  [...s].forEach((ch, k) => { const bits = DIG[+ch]; for (let i = 0; i < 15; i++) if (bits[i] === '1') ctx.fillRect(x0 + k * 4 + (i % 3), y0 + ((i / 3) | 0), 1, 1); });
}
const STATUS_BORDER = { bad: '#b13e53', good: '#a7f070' };
function statusBar(ctx: CanvasRenderingContext2D, run: Run, time: number): StatusCell | null {
  const cells = statusCells(run), hot = run.mode === 'play' && overlay === 'none' && mapMode !== 2 ? statusAt(cells) : null;
  for (const c of cells) {
    const { e, x, y } = c, S = SB.cell;
    ctx.fillStyle = 'rgba(8,9,15,0.75)'; ctx.fillRect(x, y, S, S);
    // effects about to run out blink softly
    const border = c === hot ? '#f4f4f4' : e.kind === 'passive' ? e.col : STATUS_BORDER[e.kind];
    ctx.globalAlpha = e.turns === 1 && e.kind === 'good' && c !== hot ? 0.6 + 0.4 * Math.sin(time * 8) : 1;
    ctx.fillStyle = border; ctx.fillRect(x, y, S, 1); ctx.fillRect(x, y + S - 1, S, 1); ctx.fillRect(x, y, 1, S); ctx.fillRect(x + S - 1, y, 1, S);
    ctx.globalAlpha = 1;
    drawIcon(ctx, e.icon, x + 1, y + 1, e.col);
    const n = e.turns ?? e.count;
    if (n) tinyNum(ctx, n, x + S, y + S, e.turns ? '#f4f4f4' : '#ffcd75');
  }
  return hot;
}
const STATUS_TAG: Record<string, string> = { perk: 'Boon', relic: 'Relic', synergy: 'Synergy', item: 'Equipment', group: 'Passives' };
function statusTip(ctx: CanvasRenderingContext2D, run: Run, c: StatusCell) {
  const e = c.e, n = 46;
  const tag = e.src === 'status' ? `${e.kind === 'bad' ? 'Harmful' : 'Helpful'} effect${e.turns ? ` · ${e.turns} turn${e.turns === 1 ? '' : 's'} left` : ''}` : STATUS_TAG[e.src];
  const lines: [string, string][] = [];
  if (e.items) for (const it of e.items) { lines.push([it.name, '#f4f4f4']); for (const l of wrapText(it.desc, n - 2)) lines.push([`  ${l}`, '#94b0c2']); }
  else for (const l of wrapText(e.desc, n)) lines.push([l, '#94b0c2']);
  const bottom = Math.max(...statusCells(run).map(q => q.y)) + SB.cell + 3;
  const maxRows = Math.floor((VH - 40 - bottom - 26) / 10), shown = lines.slice(0, maxRows);
  const w = Math.max(e.name.length * 6, tag.length * 6, ...shown.map(l => l[0].length * 6)) + 14, h = 26 + shown.length * 10;
  const x = Math.max(2, Math.min(VW - w - 4, c.x - 4));
  panel(ctx, x, bottom, w, h, e.kind === 'passive' ? e.col : STATUS_BORDER[e.kind]);
  text(ctx, e.name, x + 6, bottom + 4, e.kind === 'bad' ? '#ef7d57' : '#ffcd75', 8);
  text(ctx, tag, x + 6, bottom + 14, '#566c86', 8);
  shown.forEach(([l, col], k) => text(ctx, l, x + 6, bottom + 25 + k * 10, col, 8));
}

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
  text(ctx, `Lv.${p.lvl}`, 201, 7, '#ffcd75', 8, 'right');
  ctx.globalAlpha = 1;
  if (p.pts > 0 && run.mode === 'play') {
    const label = `[K] ${p.pts} skill point${p.pts > 1 ? 'e' : ''}`, w = label.length * 6 + 10;
    panel(ctx, 208, 2, w, 18, '#a7f070', `rgba(13,14,23,${0.75 + 0.2 * Math.sin(time * 4)})`);
    text(ctx, label, 213, 7, '#a7f070', 8);
  }
  // Effects, buffs and passives as small icons; the tooltip comes last so it lies above the HUD
  sbRight = centreLeft(run);
  const statusHot = statusBar(ctx, run, time);
  // Ziel der Rätselkammer, solange man darin steht (und die laufende Prüfung)
  const goal = puzzleGoal(run);
  let goalLine = false;
  if (goal) {
    goalLine = true;
    const z = run.puzzle!, col = z.solved ? '#a7f070' : z.dead ? '#566c86' : z.kind === 'arena' && z.started ? '#b13e53' : '#73eff7', gw = goal.length * 6 + 12;
    ctx.fillStyle = 'rgba(8,9,15,0.7)'; ctx.fillRect(VW / 2 - gw / 2, 56, gw, 14);
    text(ctx, goal, VW / 2, 59, col, 8, 'center');
  } else {
    // Ziel des laufenden Ereignisses
    const ev = eventGoal(run);
    if (ev) {
      goalLine = true;
      const s = `${ev.title} – ${ev.goal}`, gw = s.length * 6 + 12;
      ctx.fillStyle = 'rgba(8,9,15,0.7)'; ctx.fillRect(VW / 2 - gw / 2, 56, gw, 14);
      text(ctx, s, VW / 2, 59, ev.col, 8, 'center');
    }
  }

  // Hunters: turn counter and warning at the top centre, under the goal line (never under the minimap)
  const hi = hunterInfo(run);
  if (hi) {
    const hy = goalLine ? 72 : 56, hw = hi.text.length * 6 + 12;
    ctx.fillStyle = 'rgba(8,9,15,0.6)'; ctx.fillRect(VW / 2 - hw / 2, hy, hw, 14);
    text(ctx, hi.text, VW / 2, hy + 3, hi.col, 8, 'center');
  }

  // Ebene und Vorräte: eine Zeile oben rechts
  const parts: [string | null, string, string][] = [[null, `[I] ${p.bag.length}/${BAG_MAX}`, p.bag.length >= BAG_MAX ? '#ef7d57' : p.bag.length ? '#ffcd75' : '#566c86']];
  if (p.keys) parts.push(['key', `${p.keys}`, '#ffcd75']);
  parts.push(['coin', `${p.gold}`, '#ffcd75'], ['soul', `${run.souls}`, '#73eff7'], [null, `Floor ${run.floor}/15`, '#f4f4f4']);
  const widths = parts.map(([ic, s]) => (ic ? 13 : 0) + s.length * 6), total = widths.reduce((a, b) => a + b + 9, 0);
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
    const h = hover as Slot, lines = wrapText(h.desc, 44), w = Math.max(h.name.length * 6, ...lines.map(l => l.length * 6)) + 14, hh = 20 + lines.length * 10;
    const x = Math.max(4, Math.min(VW - w - 4, mouse.x - w / 2));
    panel(ctx, x, y0 - hh - 4, w, hh, '#ffcd75');
    text(ctx, h.name, x + 6, y0 - hh + 1, '#ffcd75');
    lines.forEach((l, k) => text(ctx, l, x + 6, y0 - hh + 13 + k * 10, '#94b0c2', 8));
  }

  // Meldungen: ganze Sätze mit Umbruch, über der Schnellleiste; lange bleiben länger stehen
  const msgs = run.log.slice(-3), last = msgs[msgs.length - 1] ?? '', sig = `${run.log.length}:${last}`;
  if (sig !== logSeen) { logSeen = sig; logAt = time; }
  const hold = 4 + last.length * 0.05, age = time - logAt, la = age < hold ? 1 : Math.max(0, 1 - (age - hold));
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

  // Chosen target: a short line above the quick bar, on the right (cyan: object, gold: enemy)
  const aim = run.mode === 'play' ? aimName(run) : null;
  if (aim) {
    const s = `Target: ${aim} [Tab]`, w = s.length * 6 + 10, ax = VW - w - 4, ay = y0 - 18, obj = run.tgt !== undefined;
    ctx.globalAlpha = under(ax, ay, w, 14) ? 0.25 : 1;
    ctx.fillStyle = 'rgba(8,9,15,0.6)'; ctx.fillRect(ax, ay, w, 14);
    text(ctx, s, ax + 5, ay + 3, obj ? '#73eff7' : '#ffcd75', 8);
    ctx.globalAlpha = 1;
  }

  if (loot && run.mode === 'play' && overlay === 'none') lootCard(ctx, run);

  if (tutorial && run.mode === 'play') {
    if (tutStep) {
      // Lehrgang: Fortschritt und Aufgabe, [T] überspringt
      const head = `Tutorial ${tutStep.k}/${tutStep.n}`, body = tutStep.text, w = Math.max(head.length + 18, body.length) * 6 + 20;
      panel(ctx, (VW - w) >> 1, 36, w, 28, '#73eff7', 'rgba(13,14,23,0.85)');
      text(ctx, head, (VW - w) / 2 + 8, 40, '#73eff7', 8);
      text(ctx, '[T] skip', (VW + w) / 2 - 8, 40, '#566c86', 8, 'right');
      text(ctx, body, VW / 2, 52, '#ffcd75', 8, 'center');
    } else {
      const h0 = hint(run), h = h0 && h0;
      if (h) { const w = h.length * 6 + 16; panel(ctx, (VW - w) >> 1, 38, w, 16, '#ffcd75'); text(ctx, h, VW / 2, 43, '#ffcd75', 8, 'center'); }
    }
  }
  const boss = run.mobs.find(m => m.boss && m.awake);
  if (boss) {
    panel(ctx, VW / 2 - 90, 4, 180, 22, '#b13e53', 'rgba(13,14,23,0.75)');
    text(ctx, boss.name, VW / 2, 7, '#ffcd75', 8, 'center');
    bar(ctx, VW / 2 - 82, 18, 164, 4, boss.hp / boss.maxHp, '#b13e53');
  }
  if (statusHot) statusTip(ctx, run, statusHot);
}

// ---- Gegenstände ----
let loot: { item: Item; how: 'worn' | 'bag' | 'sold'; t: number } | null = null;
let banner: { title: string; sub: string; col: string; t: number } | null = null;
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
  ['atk', 'Attack', 'More damage with every hit.'], ['def', 'Defense', 'Every hit against you hurts less.'],
  ['hp', 'Health', 'Raises your maximum health.'], ['crit', 'Crit', 'Chance to deal double damage.'],
];
// Zeichnet Name, Art und alle Werte; "worn" ist das Vergleichsstück (null: Platz frei, undefined: kein Vergleich).
function itemDetail(ctx: CanvasRenderingContext2D, it: Item, x: number, y: number, chars: number, worn: Item | null | undefined, dry = false): number {
  const put = (s: string, px: number, py: number, col: string, al: 'left' | 'right' = 'left') => { if (!dry) text(ctx, s, px, py, col, 8, al); };
  let yy = y;
  put(it.name, x, yy, RARITY_COL[it.rar]); yy += 10;
  put(`${SLOT_NAMES[it.slot]} · ${it.uniq ? 'Unique' : it.use ? 'single use' : RARITY[it.rar]}${it.cursed ? ' · cursed' : ''}`, x, yy, '#566c86'); yy += 13;
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
    for (const l of wrapText(`Loses: ${AFFIX[id](v)}`, chars)) { put(l, x, yy, '#b13e53'); yy += 10; }
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
  text(ctx, 'LOOT', x + 20, y + 6, '#94b0c2', 8);
  const v = L.how === 'bag' ? verdict(run, it) : 0;
  if (v) { arrow(ctx, x + w - 12, y + 7, v > 0); text(ctx, v > 0 ? 'better' : 'worse', x + w - 16, y + 6, v > 0 ? '#a7f070' : '#b13e53', 8, 'right'); }
  const dh = itemDetail(ctx, it, x + 7, y + 19, chars, worn);
  const foot = L.how === 'worn' ? 'Equipped' : L.how === 'sold' ? 'Backpack full – sold' : it.use ? '[I] backpack: use' : '[R] equip · [I] backpack';
  text(ctx, foot, x + 7, y + 22 + dh, L.how === 'worn' ? '#a7f070' : L.how === 'sold' ? '#b13e53' : '#ffcd75', 8);
  ctx.globalAlpha = 1;
}

// ---- Rucksack ----
const inv = { col: 1, row: 0 };
// Nach Anlegen/Ablegen wird der Rucksack neu sortiert: die Auswahl folgt dem bewegten Stück
function invSync(run: Run) {
  if (!run.invFocus) return;
  inv.col = run.invFocus.col; inv.row = run.invFocus.row;
  delete run.invFocus;
}
export function invMove(run: Run, dx: number, dy: number) {
  invSync(run);
  if (dx || dy) delete run.invNote;
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
// Maus: Klick wählt eine Zeile, ein zweiter Klick auf dieselbe Zeile führt sie aus (wie [ENTER])
const INV_BOX = { x: 20, y: 22 };
export function invClick(run: Run, mx: number, my: number): import('../game/run').Action | null {
  invSync(run);
  const { x, y } = INV_BOX, bx = x + 226, bw = 172;
  let hit: { col: 0 | 1; row: number } | null = null;
  for (let i = 0; i < 4; i++) { const gy = y + 139 + i * 25; if (mx >= x + 14 && mx < x + 214 && my >= gy && my < gy + 22) hit = { col: 0, row: i }; }
  run.p.bag.forEach((_, i) => { const gy = y + 46 + i * 19; if (mx >= bx && mx < bx + bw && my >= gy && my < gy + 16) hit = { col: 1, row: i }; });
  if (!hit) return null;
  if (hit.col === inv.col && hit.row === inv.row) return invAction(run, false);
  inv.col = hit.col; inv.row = hit.row;
  delete run.invNote;
  return null;
}
const lookOf = (p: Run['p']) => heroLook(p.cls, p.gear[0]?.rar ?? 0, p.gear[1]?.rar ?? -1, p.gear[0]?.wk ?? -1);
const cut = (s: string, n: number) => { return s.length > n ? s.slice(0, n - 2) + '..' : s; };

function invSheet(ctx: CanvasRenderingContext2D, run: Run, time: number) {
  const p = run.p, { x, y } = INV_BOX, w = VW - 2 * x, h = VH - 2 * y;
  invMove(run, 0, 0);
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#ffcd75');
  text(ctx, 'BACKPACK', x + 14, y + 10, '#ffcd75', 16);
  ctx.drawImage(sprites.coin, x + w - 80, y + 11);
  text(ctx, `${p.gold} gold`, x + w - 14, y + 14, '#ffcd75', 8, 'right');
  // Figur zeigt die angelegte Ausrüstung
  panel(ctx, x + 14, y + 34, 84, 84, '#333c57', '#1c2033');
  figure(ctx, `${lookOf(p)}:${['f', 's', 'b', 's'][Math.floor(time * 0.7) % 4]}${Math.floor(time * 3) % 2}`, x + 16, y + 36, 80, 80);
  const stats: [string, string, string][] = [['Health', `${p.hp} / ${p.maxHp}`, '#b13e53'], ['Attack', `${p.atk}`, '#f4f4f4'], ['Defense', `${p.def}`, '#f4f4f4'], ['Critical', `${Math.round(p.crit * 100)} %`, '#f4f4f4'], ['Skills', `${Math.round(p.pow * 100)} %`, '#f4f4f4']];
  stats.forEach(([k, v, col], i) => { text(ctx, k, x + 106, y + 38 + i * 12, '#94b0c2', 8); text(ctx, v, x + 212, y + 38 + i * 12, col, 8, 'right'); });
  text(ctx, 'EQUIPPED', x + 14, y + 127, '#94b0c2', 8);
  for (let i = 0; i < 4; i++) {
    const it = p.gear[i], gy = y + 139 + i * 25, sel = inv.col === 0 && inv.row === i, col = it ? RARITY_COL[it.rar] : '#566c86';
    panel(ctx, x + 14, gy, 200, 22, sel ? '#ffcd75' : it ? col : '#333c57', sel ? 'rgba(60,50,40,0.9)' : 'rgba(13,14,23,0.9)');
    if (it) drawItemIcon(ctx, it, p.cls, x + 20, gy + 6, col); else slotIcon(ctx, i, x + 20, gy + 6, col);
    text(ctx, it ? cut(it.name, 20) : SLOT_NAMES[i], x + 34, gy + 3, col, 8);
    text(ctx, it ? cut(itemText(it), 29) : 'empty', x + 34, gy + 12, it ? '#94b0c2' : '#333c57', 8);
  }
  // Rucksack
  const bx = x + 226, bw = 172;
  text(ctx, `In backpack: ${p.bag.length} / ${BAG_MAX}`, bx, y + 34, '#94b0c2', 8);
  text(ctx, `[O] ${SORT_NAMES[p.sort]}`, bx + bw, y + 34, '#566c86', 8, 'right');
  if (!p.bag.length) wrapText('Empty. Chests and traders fill it.', 26).forEach((l, k) => text(ctx, l, bx, y + 50 + k * 10, '#566c86', 8));
  p.bag.forEach((it, i) => {
    const gy = y + 46 + i * 19, sel = inv.col === 1 && inv.row === i, v = verdict(run, it);
    panel(ctx, bx, gy, bw, 16, sel ? '#ffcd75' : '#333c57', sel ? 'rgba(60,50,40,0.9)' : 'rgba(13,14,23,0.9)');
    if (it.use) ctx.drawImage(sprites[`i_${it.use}`], bx + 3, gy + 2); else drawItemIcon(ctx, it, p.cls, bx + 5, gy + 4, RARITY_COL[it.rar]);
    text(ctx, cut(it.name, it.neu ? 19 : 23), bx + 19, gy + 4, RARITY_COL[it.rar], 8);
    if (v) arrow(ctx, bx + bw - 10, gy + 5, v > 0);
    if (it.neu) text(ctx, 'NEW', bx + bw - (v ? 14 : 5), gy + 4, '#ffcd75', 8, 'right');
  });
  // Auswahl im Detail, mit Vergleich zum angelegten Stück
  const dx = x + 410, dw = w - 424, chars = Math.floor((dw - 14) / 6);
  const cur = inv.col === 1 ? p.bag[inv.row] : p.gear[inv.row] ?? undefined;
  panel(ctx, dx, y + 34, dw, h - 78, '#333c57', 'rgba(13,14,23,0.6)');
  if (cur) {
    const worn = inv.col === 1 && !cur.use ? p.gear[cur.slot] ?? null : undefined;
    let yy = y + 42 + itemDetail(ctx, cur, dx + 7, y + 42, chars, worn) + 6;
    if (worn) { text(ctx, `Replaces: ${worn.name}`, dx + 7, yy, '#94b0c2', 8); yy += 14; }
    else if (worn === null) { text(ctx, 'This slot is still free.', dx + 7, yy, '#a7f070', 8); yy += 14; }
    // Was bedeuten die Werte?
    for (const [k, label, help] of STATS) {
      if (!cur[k] || yy > y + h - 70) continue;
      for (const l of wrapText(`${label}: ${help}`, chars)) { text(ctx, l, dx + 7, yy, '#566c86', 8); yy += 9; }
      yy += 2;
    }
  } else text(ctx, inv.col ? '' : 'empty', dx + 7, y + 42, '#566c86', 8);
  const keys = !cur ? '' : inv.col === 0 ? '[ENTER] unequip' : `[ENTER] ${cur.use ? 'use' : 'equip'} · [X] sell (${itemValue(cur)} gold) · [DEL] discard`;
  text(ctx, keys, x + 14, y + h - 28, '#ffcd75', 8);
  // Ergebnis der letzten Handlung – das Protokoll liegt hinter dem Rucksack
  if (run.invNote) text(ctx, cut(run.invNote, 34), x + 14, y + h - 44, /Kein Platz|Fluch|nicht/.test(run.invNote) ? '#ef7d57' : '#a7f070', 8);
  { arrow(ctx, x + 14, y + h - 14, true); text(ctx, 'better than equipped', x + 22, y + h - 15, '#566c86', 8); arrow(ctx, x + 150, y + h - 14, false); text(ctx, 'worse', x + 158, y + h - 15, '#566c86', 8); }
  text(ctx, 'Arrows or click: select · [I] or [ESC] close', x + w - 14, y + h - 15, '#566c86', 8, 'right');
}

function charSheet(ctx: CanvasRenderingContext2D, run: Run) {
  const p = run.p, c = CLASSES[p.cls], x = 50, y = 30, w = VW - 100, h = VH - 60;
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#ffcd75');
  panel(ctx, x + 12, y + 12, 68, 68, '#333c57', '#1c2033');
  figure(ctx, lookOf(p), x + 14, y + 14, 64, 64);
  text(ctx, c.name, x + 90, y + 14, '#ffcd75', 16);
  text(ctx, `Level ${p.lvl}   Floor ${run.floor} ${BIOME_NAMES[biomeOf(run.floor)]}   Turn ${run.turn}`, x + 90, y + 34, '#94b0c2', 8);
  const stats: [string, string, string][] = [
    ['Health', `${p.hp} / ${p.maxHp}`, '#b13e53'], [c.resName, `${p.res} / ${p.resMax}`, c.resCol], ['Attack', `${p.atk}`, '#f4f4f4'], ['Defense', `${p.def}`, '#f4f4f4'],
    ['Critical', `${Math.round(p.crit * 100)} %`, '#f4f4f4'], ['Skills', `${Math.round(p.pow * 100)} %`, '#f4f4f4'], ['Kills', `${run.kills}`, '#94b0c2'], ['Soul shards', `${run.souls}`, '#73eff7'],
  ];
  stats.forEach(([k, v, col], i) => {
    const sx = x + 90 + (i % 2) * 120, sy = y + 48 + ((i / 2) | 0) * 11;
    text(ctx, k, sx, sy, '#94b0c2', 8);
    text(ctx, v, sx + 108, sy, col, 8, 'right');
  });
  // Ausrüstung
  const gx = x + 350;
  text(ctx, 'EQUIPMENT', gx, y + 14, '#94b0c2', 8);
  SLOT_NAMES.slice(0, 4).forEach((slot, i) => {
    const it = p.gear[i], gy = y + 25 + i * 20;
    panel(ctx, gx, gy, w - 362, 18, it ? RARITY_COL[it.rar] : '#333c57');
    text(ctx, it ? it.name : slot, gx + 6, gy + 1, it ? RARITY_COL[it.rar] : '#566c86', 8);
    text(ctx, it ? cut(itemText(it), 28) : 'empty', gx + 6, gy + 9, it ? '#94b0c2' : '#333c57', 8);
  });
  // Reliquien und Gaben
  const ly = y + 108;
  text(ctx, 'RELICS', x + 14, ly, '#73eff7', 8);
  if (!p.relics.length) text(ctx, 'None yet – solve puzzle chambers.', x + 14, ly + 12, '#566c86', 8);
  p.relics.slice(0, 7).forEach((id, i) => {
    text(ctx, RELICS[id].name, x + 14, ly + 12 + i * 20, '#f4f4f4', 8);
    text(ctx, RELICS[id].desc, x + 20, ly + 21 + i * 20, '#94b0c2', 8);
  });
  const px = x + 290;
  text(ctx, 'BOONS', px, ly, '#ffcd75', 8);
  const counts = new Map<string, number>();
  for (const id of p.perks) counts.set(id, (counts.get(id) ?? 0) + 1);
  if (!counts.size) text(ctx, 'None yet – gain a level.', px, ly + 12, '#566c86', 8);
  [...counts].slice(0, 13).forEach(([id, n], i) => {
    text(ctx, `${PERKS[id].name}${n > 1 ? ` x${n}` : ''}`, px, ly + 12 + i * 11, '#f4f4f4', 8);
    text(ctx, PERKS[id].desc, px + 104, ly + 12 + i * 11, '#94b0c2', 8);
  });
  if (p.syn.length) {
    const names = p.syn.map(id => SYNERGIES.find(q => q.id === id)!.name).join(', ');
    text(ctx, `Synergies: ${names}`, x + 14, y + h - 26, '#a7f070', 8);
  }
  text(ctx, '[C] or [ESC] close', VW / 2, y + h - 13, '#566c86', 8, 'center');
}

const HELP: [string, string][] = [
  ['Arrows / WASD', 'move; walk into enemies to attack'], ['Space', 'wait one turn'], ['1 to 6', 'Skills (4–6: new ones from the tree)'], ['U', 'Ultimate skill from level 5'], ['7 8 9 0', 'use scrolls and potions'], ['R', 'equip the latest find'], ['K', 'Skill tree: spend a point'], ['T', 'Tutorial: skip step'], ['F', 'ranged attack (Mage, Ranger)'],
  ['Q', 'drink a healing potion'], ['B', 'throw a bomb'], ['E', 'descend the stairs'], ['Click / Tab', 'choose a target: enemies, barrels, pots'], ['Mouse', 'hover over things for details'],
  ['I', 'Backpack: equip, use, sell'], ['C', 'character, relics, boons'], ['N', 'map: small, large, off'], ['M', 'toggle sound'], ['V', 'Fullscreen'], ['J', 'Journal: read all messages'], ['H', 'this help'],
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
  if (!rows.length) text(ctx, 'Nothing has happened yet.', x + 14, y + 36, '#566c86', 8);
  text(ctx, '[J] or [ESC] close', VW / 2, y + h - 13, '#566c86', 8, 'center');
}

function helpSheet(ctx: CanvasRenderingContext2D) {
  const w = 380, h = 56 + HELP.length * 13, x = (VW - w) >> 1, y = (VH - h) >> 1;
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#ffcd75');
  text(ctx, 'CONTROLS', VW / 2, y + 12, '#ffcd75', 16, 'center');
  HELP.forEach(([k, v], i) => {
    text(ctx, k, x + 110, y + 38 + i * 13, '#ffcd75', 8, 'right');
    text(ctx, v, x + 124, y + 38 + i * 13, '#f4f4f4', 8);
  });
  text(ctx, '[H] or [ESC] close', VW / 2, y + h - 13, '#566c86', 8, 'center');
}

const HAZARD_HELP: Record<string, string> = {
  stachel: 'Spikes when stepped on', pfeil: 'Dart from the wall when stepped on', gas: 'Poison gas around it when stepped on (once)', glut: 'Fire around it when stepped on',
};
const TILE_NAMES: Record<number, string> = {
  [T.STAIRS]: 'Stairs down [E]', [T.CHEST]: 'Chest', [T.MIMIC]: 'Chest', [T.CURSED]: 'Cursed chest – strong, but costs health', [T.TRADER]: 'Trader – walk into him to trade',
  [T.FOUNTAIN]: 'Fountain – heals once', [T.FOUNTAIN_DRY]: 'Dry fountain', [T.GATE]: 'Gate – an elite enemy holds the key', [T.ALTAR]: 'Altar: health for a boon', [T.CRACKED]: 'Cracked wall – 3 blows or a bomb',
  [T.BARREL]: 'Barrel – bump it or shoot it to light the fuse', [T.PILLAR]: 'Pillar – collapses when blasted', [T.GRASS]: 'Overgrowth – flammable',
  [T.FRAGILE]: 'Brittle floor', [T.FRAGILE2]: 'Brittle floor – breaks on the next step', [T.CRATE]: 'Crate – pushable', [T.CRATE_ON]: 'Crate on plate',
  [T.PLATE]: 'Pressure plate', [T.LEVER]: 'Lever – resets the crates', [T.ICE]: 'Ice – you slide', [T.TABLET]: 'Stone tablet', [T.GOAL]: 'Goal plate',
  [T.BRAZIER]: 'Brazier, unlit – a step toggles it and its neighbours', [T.BRAZIER_ON]: 'Brazier, lit – a step toggles it and its neighbours',
  [T.STATUE]: 'Dart statue – shoots across its row',
  [T.POT]: 'Clay pot – smash it; something may be inside', [T.SPORE]: 'Spore cap – bursts into a poison cloud that hits everyone',
  [T.OIL]: 'Oil puddle – burns all at once', [T.WATER]: 'Water – puts out burning, fire cannot cross', [T.WEB]: 'Cobweb – holds for a turn, burns',
};

function tooltip(ctx: CanvasRenderingContext2D, run: Run, ox: number, oy: number) {
  if (mouse.x < 0 || run.mode !== 'play' || statusAt(statusCells(run))) return;
  const tx = Math.floor((mouse.x - ox) / TS), ty = Math.floor((mouse.y - oy) / TS), i = ty * W + tx;
  if (tx < 0 || ty < 0 || tx >= W || ty >= H || !run.seen[i]) return;
  const m = run.vis[i] ? run.mobs.find(o => o.x === tx && o.y === ty) : undefined;
  const lines: string[] = [];
  if (m) {
    const d = MOBS[m.kind];
    lines.push(m.name, `Health ${m.hp}/${m.maxHp}   attack ${m.atk}   def. ${m.def}`);
    const tags = [d.range ? `Ranged ${d.range}` : '', d.poison ? 'poisonous' : '', d.burn ? 'ignites' : '', d.ai === 'slow' ? 'slow' : '', d.ai === 'erratic' ? 'erratic' : '',
      m.st.stun ? 'stunned' : '', m.st.brand ? 'burning' : '', m.st.gift ? 'poisoned' : '', !m.awake ? 'asleep' : ''].filter(Boolean);
    if (tags.length) lines.push(tags.join(' · '));
  } else {
    const t = run.tiles[i];
    const z = run.puzzle;
    if (t === T.RUNE && z) lines.push(`Rune: ${RUNE_NAMES[z.runes[i]]}`);
    else if (TILE_NAMES[t]) lines.push(TILE_NAMES[t]);
    if (t === T.ICE && z?.gems?.includes(i)) lines.push('Ice crystal – stop on it');
    const hz = run.hazards.find(h => h.seen && h.x === tx && h.y === ty);
    if (hz) lines.push(HAZARD_NAMES[hz.kind], HAZARD_HELP[hz.kind], 'Enemies trigger it too.');
    // Rätselkammer schon von der Tür aus erkennbar: Name und Lohn
    if (z && (inVault(run, tx, ty) || (tx === z.x + 3 && ty === z.y + 7))) lines.push(`${VAULT_NAMES[z.kind]} – ${z.solved ? 'solved' : z.dead ? 'lost' : 'reward: relic'}`);
    if (run.fire.has(i)) lines.push('Fire');
  }
  if (!lines.length) return;
  ctx.strokeStyle = '#ffcd75'; ctx.lineWidth = 1; ctx.strokeRect(tx * TS + ox + 0.5, ty * TS + oy + 0.5, TS - 1, TS - 1);
  const w = Math.max(...lines.map(l => l.length)) * 6 + 12, h = lines.length * 10 + 8;
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
    text(ctx, `Floor ${run.floor} / 15 - ${BIOME_NAMES[biomeOf(run.floor)]}`, x0, y0 - 12, '#ffcd75', 8);
    text(ctx, '[N] close', x0 + W * s, y0 - 12, '#566c86', 8, 'right');
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
    } else ctx.fillStyle = t === T.STAIRS || t === T.GATE ? '#ffcd75' : t === T.CHEST || t === T.CURSED || t === T.MIMIC ? '#c98a3a' : t === T.FOUNTAIN ? '#73eff7' : t === T.TRADER ? '#38b764' : t === T.CRACKED ? '#b13e53' : t === T.POT ? '#c48a6a' : t === T.SPORE ? '#9a4fc0' : t === T.WATER ? '#3b5dc9' : t === T.OIL ? '#333c57'
      : ((t >= T.CRATE && t <= T.GOAL) || (t >= T.BRAZIER && t <= T.STATUE)) ? '#41a6f6' : run.fire.has(i) ? '#ef7d57' : run.vis[i] ? '#94b0c2' : '#566c86';
    ctx.fillRect(x0 + x * s, y0 + y * s, s, s);
  }
  for (const m of run.mobs) if (run.vis[m.y * W + m.x]) { ctx.fillStyle = m.elite ? '#ffcd75' : '#b13e53'; ctx.fillRect(x0 + m.x * s, y0 + m.y * s, s, s); }
  // Ereignis: Gesuchte und Zielfeld sind immer auf der Karte
  if (Math.floor(time * 3) % 2) {
    ctx.fillStyle = '#ffcd75';
    for (const m of run.mobs) if (m.ev) ctx.fillRect(x0 + m.x * s - 1, y0 + m.y * s - 1, s + 2, s + 2);
    ctx.fillStyle = '#73eff7';
    for (const mk of run.ev?.mark !== undefined ? [run.ev.mark] : run.ev?.marks ?? []) ctx.fillRect(x0 + (mk % W) * s - 1, y0 + ((mk / W) | 0) * s - 1, s + 2, s + 2);
  }
  if (big || Math.floor(time * 4) % 2) {
    ctx.fillStyle = '#f4f4f4';
    if (big) ctx.fillRect(x0 + run.p.x * s - 1, y0 + run.p.y * s - 1, s + 2, s + 2); else ctx.fillRect(x0 + run.p.x - 1, y0 + run.p.y - 1, 3, 3);
  }
  ctx.globalAlpha = 1;
  if (big) {
    const leg: [string, string][] = [['#f4f4f4', 'You'], ['#ffcd75', 'Stairs'], ['#c98a3a', 'Chest'], ['#38b764', 'Trader'], ['#73eff7', 'Fountain'], ['#41a6f6', 'Puzzle'], ['#b13e53', 'Enemies']];
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
  if (run.turn < 4) return 'Arrow keys or WASD: move';
  if (run.tiles[p.y * W + p.x] === T.STAIRS) return '[E] descends the stairs';
  if (p.hp < p.maxHp * 0.5 && p.potions > 0) return '[Q] drinks a healing potion';
  if (run.mobs.some(m => run.vis[m.y * W + m.x])) return c.range ? '[F] shoots the nearest enemy · [1]–[3] skills' : 'Walk into an enemy to attack · [1]–[3] skills';
  for (let y = p.y - 4; y <= p.y + 4; y++) for (let x = p.x - 4; x <= p.x + 4; x++) {
    const i = y * W + x;
    if (!run.vis[i]) continue;
    if (run.tiles[i] === T.CRACKED) return 'Cracked wall: walk into it three times or [B] bomb';
    if (run.tiles[i] === T.BARREL) return c.range ? 'Barrel: [Tab] or click to aim, [F] shoots it – then keep away' : 'Barrel: bump it to light the fuse – then keep away';
    if (run.tiles[i] === T.CHEST) return 'Chest: walk into it to open';
  }
  return run.floor === 1 ? 'Find the stairs · hover over things for details' : null;
}

function wrapText(s: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if (line && (line + ' ' + w).length > n) { out.push(line); line = w; } else line = line ? line + ' ' + w : w;
  }
  if (line) out.push(line);
  return out;
}

const KIND_COL = { perk: '#ffcd75', relic: '#73eff7', skill: '#a7f070' };
const KIND_NAME = { perk: 'Boon', relic: 'Relic', skill: 'Skill' };

function perkOverlay(ctx: CanvasRenderingContext2D, run: Run) {
  const ids = run.perkChoices, relic = !!RELICS[ids[0]], col = relic ? '#73eff7' : '#ffcd75';
  ctx.fillStyle = 'rgba(13,14,23,0.75)'; ctx.fillRect(0, 0, VW, VH);
  text(ctx, relic ? 'CHOOSE A RELIC' : 'CHOOSE A BOON', VW / 2, 78, col, 24, 'center');
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
    if (pk.syn) text(ctx, `Synergy: ${pk.syn}`, x + cw / 2, y + 92, '#a7f070', 8, 'center');
    else if (have) text(ctx, `owned ${have}x`, x + cw / 2, y + 92, '#566c86', 8, 'center');
  });
  text(ctx, `Key 1 to ${ids.length}`, VW / 2, 244, '#94b0c2', 8, 'center');
}

// Symbole der Händlerware ohne eigenen Gegenstand
const OFFER_ICON: Record<string, [string, string]> = { potion: ['potion', '#b13e53'], bomb: ['bomb', '#94b0c2'], forge: ['whetstone', '#c9d4dc'], reroll: ['scroll', '#ffcd75'] };
function shopOverlay(ctx: CanvasRenderingContext2D, run: Run, time: number) {
  const p = run.p, rowH = 28, w = 360, h = 84 + run.shop.length * rowH, x = (VW - w) >> 1, y = (VH - h) >> 1;
  ctx.fillStyle = 'rgba(13,14,23,0.75)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#ffcd75');
  // Kopf: Bildnis im Laternenschein
  const gl = ctx.createRadialGradient(x + 30, y + 28, 2, x + 30, y + 28, 46);
  gl.addColorStop(0, 'rgba(255,205,117,0.22)'); gl.addColorStop(1, 'rgba(255,205,117,0)');
  ctx.fillStyle = gl; ctx.fillRect(x + 1, y + 1, 90, 56);
  panel(ctx, x + 8, y + 7, 44, 44, '#c98a3a', 'rgba(26,28,44,0.95)');
  ctx.drawImage(sprites[Math.floor(time * 1.6) % 2 ? 'trader_b' : 'trader'], x + 14, y + 13, 32, 32);
  text(ctx, 'TRADER', x + 62, y + 12, '#ffcd75', 16);
  text(ctx, 'What will it be?', x + 62, y + 34, '#94b0c2', 8);
  const gw = text(ctx, `${p.gold}`, x + w - 14, y + 16, '#ffcd75', 10, 'right');
  drawIcon(ctx, ['coin'], x + w - 28 - gw, y + 15, '#ffcd75');
  ctx.fillStyle = '#566c86'; ctx.fillRect(x + 8, y + 57, w - 16, 1);
  run.shop.forEach((o, i) => {
    const oy = y + 64 + i * rowH, ok = !o.sold && p.gold >= o.price;
    if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(x + 4, oy - 3, w - 8, rowH - 2); }
    if (o.sold) ctx.globalAlpha = 0.45;
    text(ctx, `[${i + 1}]`, x + 10, oy + 6, o.sold ? '#566c86' : '#ffcd75');
    // Symbol im Rahmen
    ctx.fillStyle = '#05060c'; ctx.fillRect(x + 32, oy - 1, 15, 15);
    ctx.fillStyle = o.item ? RARITY_COL[o.item.rar] : '#566c86'; ctx.fillRect(x + 32, oy - 1, 15, 1); ctx.fillRect(x + 32, oy + 13, 15, 1); ctx.fillRect(x + 32, oy - 1, 1, 15); ctx.fillRect(x + 46, oy - 1, 1, 15);
    if (o.item?.use) ctx.drawImage(sprites[`i_${o.item.use}`], x + 34, oy); // Rolle, Trank: eigenes Bild wie im Rucksack
    else if (o.item) drawItemIcon(ctx, o.item, p.cls, x + 35, oy + 2, RARITY_COL[o.item.rar]);
    else { const ic = OFFER_ICON[o.kind]; if (ic) drawIcon(ctx, [ic[0]], x + 35, oy + 2, ic[1]); }
    const nw = text(ctx, o.name, x + 54, oy, o.item ? RARITY_COL[o.item.rar] : '#f4f4f4');
    if (o.left !== undefined && !o.sold) text(ctx, `×${o.left}`, x + 58 + nw, oy, '#566c86');
    text(ctx, cut(o.desc, 44), x + 54, oy + 11, '#94b0c2', 8);
    if (o.sold) text(ctx, 'SOLD', x + w - 14, oy + 5, '#94b0c2', 8, 'right');
    else { const pw = text(ctx, `${o.price}`, x + w - 14, oy + 4, ok ? '#ffcd75' : '#b13e53', 10, 'right'); drawIcon(ctx, ['coin'], x + w - 26 - pw, oy + 3, ok ? '#ffcd75' : '#b13e53'); }
    ctx.globalAlpha = 1;
  });
  ctx.fillStyle = '#333c57'; ctx.fillRect(x + 8, y + h - 22, w - 16, 1);
  text(ctx, '[SPACE] move on', VW / 2, y + h - 15, '#94b0c2', 8, 'center');
}

function endOverlay(ctx: CanvasRenderingContext2D, run: Run) {
  const win = run.mode === 'win', x = VW / 2 - 130, y = VH / 2 - 78;
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, 260, 156, win ? '#ffcd75' : '#b13e53');
  text(ctx, win ? 'VICTORY!' : 'FALLEN', VW / 2, y + 14, win ? '#ffcd75' : '#b13e53', 24, 'center');
  text(ctx, win ? 'The Ember Crypt is conquered.' : `Floor ${run.floor} – ${BIOME_NAMES[biomeOf(run.floor)]}`, VW / 2, y + 52, '#f4f4f4', 10, 'center');
  text(ctx, `Enemies defeated: ${run.kills}`, VW / 2, y + 72, '#94b0c2', 10, 'center');
  text(ctx, `Level: ${run.p.lvl}`, VW / 2, y + 86, '#94b0c2', 10, 'center');
  text(ctx, `+${run.souls} Soul shards`, VW / 2, y + 106, '#73eff7', 10, 'center');
  text(ctx, '[SPACE] back to camp', VW / 2, y + 132, '#ffcd75', 8, 'center');
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
// Klickflächen der Knoten, beim Zeichnen gesammelt (Lager und Lauf teilen sich das Bild)
let treeRects: { id: string; x: number; y: number; w: number; h: number }[] = [];
export function treeHit(mx: number, my: number): string | null {
  return treeRects.find(r => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h)?.id ?? null;
}
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
  treeRects = [];
  const colW = 196, gap = 6, x0 = (VW - 3 * colW - 2 * gap) >> 1, rows = rowsOf(cls);
  const rowH = 26, step = rows.length > 2 ? 32 : 60, top = 62;
  for (let b = 0; b < 3; b++) {
    const cx = x0 + b * (colW + gap), mid = cx + colW / 2;
    panel(ctx, cx, 36, colW, 206, '#333c57', 'rgba(20,22,36,0.9)');
    ctx.drawImage(sprites[`i_${cls}${b}`], cx + 8, 42);
    text(ctx, BRANCH_NAMES[cls][b].toUpperCase(), mid, 45, '#94b0c2', 10, 'center');
    ctx.fillStyle = '#566c86';
    ctx.fillRect(mid, top + rowH, 1, (rows.length - 1) * step - rowH);
    rows.forEach((row, r) => {
      const y = top + r * step, w = row.length > 1 ? (colW - 14) / 2 : colW - 26;
      if (row.length > 1) { ctx.fillStyle = '#566c86'; ctx.fillRect(cx + colW / 4, y - 3, colW / 2, 1); }
      row.forEach((t, k) => {
        const id = `n${b}_${t}`, x = row.length > 1 ? cx + 4 + k * (w + 6) : cx + 13;
        const st = stateOf(id), col = TREE_COL[st], sel = id === treeSel, node = treeNode(cls, id)!;
        treeRects.push({ id, x, y, w, h: rowH });
        panel(ctx, x, y, w, rowH, sel ? '#f4f4f4' : col, sel ? 'rgba(60,50,40,0.95)' : st === 'locked' ? 'rgba(13,14,23,0.9)' : 'rgba(28,32,51,0.95)');
        const mark = (st === 'learned' ? '+' : '') + (node.key ? '*' : '');
        text(ctx, cut(`${mark}${mark ? ' ' : ''}${shortName(cls, id)}`, Math.floor((w - 6) / 6)), x + w / 2, y + 5, st === 'locked' ? '#566c86' : '#f4f4f4', 8, 'center');
        const tg = tag(id);
        if (tg === '#free') freeMark(ctx, x + w / 2 - 4, y + 16, col);
        else if (tg) text(ctx, cut(tg, Math.floor((w - 6) / 6)), x + w / 2, y + 15, col, 8, 'center');
      });
    });
  }
  // Beschreibung des gewählten Knotens
  const nt = nodeText(cls, treeSel), node = treeNode(cls, treeSel)!, bun = bundledOf(cls, treeSel);
  const lines = [...wrapText(nt.desc, 90), ...(bun ? wrapText(`Also ${nodeText(cls, bun.id).name}: ${nodeText(cls, bun.id).desc}`, 90) : [])];
  panel(ctx, x0, 248, 3 * colW + 2 * gap, 74, '#566c86');
  text(ctx, `${nt.name}${node.key ? ' – key node' : ''}`, x0 + 10, 256, '#ffcd75', 10);
  lines.forEach((l, k) => text(ctx, l, x0 + 10, 272 + k * 10, '#f4f4f4', 8));
  text(ctx, status(treeSel), x0 + 10, 308, TREE_COL[stateOf(treeSel)], 8);
  text(ctx, foot, VW / 2, 334, '#94b0c2', 8, 'center');
}

function treeOverlay(ctx: CanvasRenderingContext2D, run: Run) {
  const p = run.p, av = availableNodes(run);
  const stateOf = (id: string): TreeState => p.tree.includes(id) ? 'learned' : av.includes(id) ? 'open' : 'locked';
  drawTree(ctx, p.cls, `LEVEL ${p.lvl} – SKILL POINT (${p.pts} free)`, stateOf,
    id => ({ learned: 'learned', open: 'available', locked: run.pool.includes(id) ? 'locked' : 'camp first' } as Record<string, string>)[stateOf(id)],
    `Points: ${p.ptsGot ?? 0}/${TUNE.treePtsMax} · Arrows: select · ENTER: learn · K: later`,
    id => {
      const st = stateOf(id), n = treeNode(p.cls, id)!;
      if (st !== 'locked') return st === 'learned' ? 'Already learned.' : 'Can be learned now.';
      if (!run.pool.includes(id)) return 'Not unlocked in camp yet.';
      if (n.excl && p.tree.includes(n.excl)) return 'The other variant is already chosen.';
      if (n.parent && !p.tree.includes(n.parent)) return 'Learn rank II first.';
      if (n.needAny && !n.needAny.some(q => p.tree.includes(q))) return 'Needs rank III and 4 points in the branch.';
      return `Needs ${n.minPts} points in the branch.`;
    });
}
