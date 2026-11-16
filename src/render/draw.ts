import { VW, VH, TS, sprites, masks, tilesets, text, panel, bar, heroLook, figure } from './gfx';
import { GLOW } from './sprites';
import { W, H, T, wallLike, walkable } from '../game/dungeon';
import { sfx } from '../core/audio';
import { tr } from '../core/i18n';
import { Run, Actor, xpNeed, skillCost, itemText, itemValue, BAG_MAX, RUNE_NAMES } from '../game/run';
import { CLASSES, MOBS, PERKS, RELICS, RARITY_COL, BIOME_NAMES, biomeOf } from '../game/content';

const pos = new Map<number, { x: number; y: number }>();
const lunges = new Map<number, { dx: number; dy: number; t: number }>();
const flashes = new Map<number, number>();
const nums: { x: number; y: number; s: string; col: string; t: number }[] = [];
const bolts: { x0: number; y0: number; x1: number; y1: number; col: string; t: number }[] = [];
const booms: { x: number; y: number; r: number; t: number }[] = [];
const bits: { x: number; y: number; vx: number; vy: number; col: string; t: number; g?: number }[] = [];
let shake = 0;
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

// ---- Licht ----
// Die Dunkelheit ist eine eigene Ebene in halber Auflösung. Jede Lichtquelle stanzt ein
// weiches Loch hinein; danach wird farbiges Glühen additiv über die Szene gelegt.
interface Light { x: number; y: number; r: number; col?: string; a?: number; }
const LW = VW >> 1, LH = VH >> 1;
let lcv: HTMLCanvasElement | null = null, lg: CanvasRenderingContext2D;
const AMBIENT = 0.84, MEMORY = 0.62;

function applyLight(ctx: CanvasRenderingContext2D, run: Run, lights: Light[], ox: number, oy: number, x0: number, y0: number, x1: number, y1: number) {
  if (!lcv) { lcv = document.createElement('canvas'); lcv.width = LW; lcv.height = LH; lg = lcv.getContext('2d')!; }
  const g = lg;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, LW, LH);
  g.fillStyle = `rgba(5,6,12,${AMBIENT})`;
  g.fillRect(0, 0, LW, LH);
  g.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    const x = (L.x * TS + 8 + ox) / 2, y = (L.y * TS + 8 + oy) / 2, r = (L.r * TS) / 2;
    if (x + r < 0 || y + r < 0 || x - r > LW || y - r > LH) continue;
    const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${L.a ?? 1})`);
    gr.addColorStop(0.6, `rgba(0,0,0,${(L.a ?? 1) * 0.55})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Wände im Sichtfeld bleiben auch fern vom Licht erkennbar
  g.fillStyle = 'rgba(0,0,0,0.42)';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (run.vis[i] && wallLike(run.tiles[i])) g.fillRect((x * TS + ox) / 2, (y * TS + oy) / 2, TS / 2, TS / 2);
  }
  // Bekannte, aber gerade nicht einsehbare Felder: gleichmäßig gedimmt, unabhängig vom Licht
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = `rgba(5,6,12,${MEMORY})`;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (!run.seen[i] || run.vis[i]) continue;
    const px = (x * TS + ox) / 2, py = (y * TS + oy) / 2;
    g.clearRect(px, py, TS / 2, TS / 2);
    g.fillRect(px, py, TS / 2, TS / 2);
  }
  ctx.drawImage(lcv, 0, 0, VW, VH);
  // farbiges Glühen
  ctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    if (!L.col) continue;
    const x = L.x * TS + 8 + ox, y = L.y * TS + 8 + oy, r = L.r * TS * 0.8;
    if (x + r < 0 || y + r < 0 || x - r > VW || y - r > VH) continue;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, L.col + '2a');
    gr.addColorStop(1, L.col + '00');
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

export function resetView() {
  pos.clear(); lunges.clear(); flashes.clear();
  nums.length = 0; bolts.length = 0; bits.length = 0; booms.length = 0; shake = 0;
}

function smooth(a: Actor, dt: number) {
  let p = pos.get(a.id);
  if (!p || Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 3) { p = { x: a.x, y: a.y }; pos.set(a.id, p); }
  const k = Math.min(1, dt * 11);
  p.x += (a.x - p.x) * k; p.y += (a.y - p.y) * k;
  return p;
}

// Gegner zerfällt in seine eigenen Pixel
function shatter(kind: string, tx: number, ty: number) {
  const s = sprites[kind];
  if (!s) return;
  const d = s.getContext('2d')!.getImageData(0, 0, s.width, s.height).data;
  const ox = tx * TS + 8 - s.width / 2, oy = ty * TS + 14 - s.height;
  for (let y = 0; y < s.height; y += 2) for (let x = 0; x < s.width; x += 2) {
    const i = (y * s.width + x) * 4;
    if (d[i + 3] === 0) continue;
    const ang = Math.atan2(y - s.height / 2, x - s.width / 2) + (Math.random() - 0.5);
    const v = 20 + Math.random() * 50;
    bits.push({ x: ox + x, y: oy + y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 30, col: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`, t: 0 });
  }
}

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
      case 'bolt': bolts.push({ ...f, t: 0 }); sfx('zap'); break;
      case 'lunge': lunges.set(f.id, { dx: f.dx, dy: f.dy, t: 0 }); sfx('hit'); break;
      case 'flash': flashes.set(f.id, FLASH_T); if (f.id === 0) sfx('hurt'); break;
      case 'die': shatter(f.kind, f.x, f.y); sfx('kill'); break;
      case 'boom': booms.push({ x: f.x, y: f.y, r: f.r, t: 0 }); sfx('boom'); break;
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
  for (const [id, t] of flashes) { if (t - dt <= 0) flashes.delete(id); else flashes.set(id, t - dt); }

  const p = run.p, pp = smooth(p, dt);
  // Held bleibt immer in der Bildmitte; jenseits des Kartenrands ist es einfach dunkel
  const tx = pp.x * TS + 8 - VW / 2, ty = pp.y * TS + 8 - VH / 2;
  if (Math.abs(tx - cam.x) > 220 || Math.abs(ty - cam.y) > 220) { cam.x = tx; cam.y = ty; }
  cam.x += (tx - cam.x) * Math.min(1, dt * 10); cam.y += (ty - cam.y) * Math.min(1, dt * 10);
  shake = Math.max(0, shake - dt * 30);
  const sx = shake ? Math.round((Math.random() - 0.5) * shake) : 0, sy = shake ? Math.round((Math.random() - 0.5) * shake) : 0;
  const ox = -Math.round(cam.x) + sx, oy = -Math.round(cam.y) + sy;

  view.ox = ox - sx; view.oy = oy - sy;
  ctx.fillStyle = '#08090f'; ctx.fillRect(0, 0, VW, VH);
  const ts = tilesets[biomeOf(run.floor)];
  buildLight(run);
  const lights: Light[] = [];
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
      if (front) ctx.drawImage(ts.wall, dx, dy);
      else {
        const c = [open(-1, -1), open(1, -1), open(-1, 1), open(1, 1)];
        ctx.drawImage(l || r || u || c.some(Boolean) ? ts.cap : ts.top, dx, dy);
        ctx.fillStyle = ts.hi;
        if (u) ctx.fillRect(dx, dy, TS, 2);
        if (c[0] && !l && !u) ctx.fillRect(dx, dy, 2, 2);
        if (c[1] && !r && !u) ctx.fillRect(dx + TS - 2, dy, 2, 2);
        if (c[2] && !l) ctx.fillRect(dx, dy + TS - 2, 2, 2);
        if (c[3] && !r) ctx.fillRect(dx + TS - 2, dy + TS - 2, 2, 2);
      }
      // helle Kante zur offenen Seite: der Raumumriss ist rundum lesbar
      ctx.fillStyle = ts.hi;
      if (l) ctx.fillRect(dx, dy, 2, front ? 13 : TS);
      if (r) ctx.fillRect(dx + TS - 2, dy, 2, front ? 13 : TS);
      if (t === T.CRACKED) ctx.drawImage(sprites[(run.cracks.get(i) ?? 0) >= 2 ? 'crack2' : 'crack'], dx, dy);
      if (front && torches.has(i)) {
        ctx.drawImage(sprites[`torch${Math.floor(time * 7 + x) % 2}`], dx, dy);
        lights.push({ x, y: y + 0.6, r: 5 * flick(i), col: '#ef7d57' });
      }
    } else {
      ctx.drawImage(t === T.ICE ? sprites.ice : ts.floor[(x * 7 + y * 13 + ((x * y) % 5)) % 4], dx, dy);
      if (y > 0 && wallLike(run.tiles[i - W])) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(dx, dy, TS, 4); }
      if (t === T.FLOOR) { const h = hash(x, y, run.seed + run.floor * 7); if (h % 9 === 0) ctx.drawImage(ts.decals[(h >>> 8) % ts.decals.length], dx, dy); }
      if (t === T.GRASS) ctx.drawImage(ts.grass[(x * 5 + y * 3) % 3], dx, dy);
      else if (t === T.BURNT) ctx.drawImage(ts.burnt, dx, dy);
      const s = TILE_SPR[t];
      if (t === T.CRATE_ON) ctx.drawImage(sprites.plate, dx, dy);
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
    }
  }
  for (const t of run.traps) ctx.drawImage(sprites.trap, t.x * TS + ox, t.y * TS + oy);

  const actor = (a: Actor, q: { x: number; y: number }) => {
    // Blickrichtung wählt die Ansicht, Bewegung die Schrittbilder
    const f = a === p ? p.dir : a.f ?? [0, 1];
    const v = f[1] < 0 ? 'b' : f[1] > 0 ? 'f' : 's', mirror = v === 's' && f[0] < 0;
    const moving = Math.abs(q.x - a.x) + Math.abs(q.y - a.y) > 0.04;
    const fr = moving ? [2, 0, 3, 0][Math.floor(time * 11) % 4] : Math.floor(time * 2.5 + a.id * 0.37) % 2;
    const frame = `${a === p ? lookOf(p) : a.kind}:${v}${fr}`, img = sprites[frame];
    const l = lunges.get(a.id), k = l ? Math.sin((l.t / LUNGE_T) * Math.PI) * 6 : 0;
    const glow = GLOW[a.kind];
    const jx = glow ? Math.round(Math.sin(time * 17 + a.id) * 0.6) : 0;
    const bx = Math.round(q.x * TS + (l ? l.dx * k : 0)) + ox, by = Math.round(q.y * TS + (l ? l.dy * k : 0)) + oy;
    const dx = bx + 8 - img.width / 2 + jx, dy = by + 14 - img.height;
    const blit = (c: HTMLCanvasElement) => {
      if (!mirror) { ctx.drawImage(c, dx, dy); return; }
      ctx.save(); ctx.translate(dx + c.width, dy); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0); ctx.restore();
    };
    if (!glow) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bx + 8 - img.width / 2 + 3, Math.round(q.y * TS) + oy + 13, img.width - 6, 2); }
    blit(img);
    if (glow) {
      // Feuerwesen flimmern, werfen Licht und verlieren Funken
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.07 + 0.07 * Math.sin(time * 13 + a.id);
      blit(masks[frame]);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      lights.push({ x: q.x, y: q.y, r: glow[0] * flick(a.id), col: glow[1] });
      if (Math.random() < dt * 9) bits.push({ x: (q.x * TS) + 4 + Math.random() * 8, y: q.y * TS + 2 + Math.random() * 6, vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 14, col: Math.random() < 0.5 ? '#ffcd75' : '#ef7d57', t: 0, g: -10 });
    }
    if (a === p && p.gear[2] && v === 'f') { ctx.fillStyle = RARITY_COL[p.gear[2].rar]; ctx.fillRect(dx + 7, dy + 9, 2, 1); ctx.fillRect(dx + 7, dy + 10, 2, 1); }
    if (a.elite) {
      ctx.fillStyle = '#ffcd75';
      ctx.fillRect(dx + 5, dy - 3, 1, 2); ctx.fillRect(dx + 8, dy - 4, 1, 3); ctx.fillRect(dx + 11, dy - 3, 1, 2); ctx.fillRect(dx + 5, dy - 1, 7, 1);
      lights.push({ x: q.x, y: q.y, r: 1.8, col: '#ffcd75', a: 0.6 });
    }
    const fl = flashes.get(a.id);
    if (fl) { ctx.globalAlpha = Math.min(1, fl / FLASH_T + 0.2); blit(masks[frame]); ctx.globalAlpha = 1; }
    if (a.st.stun) text(ctx, 'z', dx + img.width - 4, dy - 5, '#73eff7', 8);
    if (a.st.brand) { ctx.fillStyle = '#ef7d57'; ctx.fillRect(dx + 1, dy - 2, 2, 2); }
    if (a.st.gift) { ctx.fillStyle = '#38b764'; ctx.fillRect(dx + 4, dy - 2, 2, 2); }
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
  for (const b of booms) lights.push({ x: b.x, y: b.y, r: 6 * (1 - b.t / 0.32) + 1, col: '#ffcd75' });
  for (const b of bolts) lights.push({ x: b.x1, y: b.y1, r: 2, col: b.col === '#1a1c2c' ? undefined : b.col, a: 0.7 });
  applyLight(ctx, run, lights, ox, oy, x0, y0, x1, y1);
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
  hud(ctx, run, time);
  if (mapMode) minimap(ctx, run, time);
  if (overlay === 'char') charSheet(ctx, run);
  else if (overlay === 'help') helpSheet(ctx);
  else if (overlay === 'inv') invSheet(ctx, run, time);
  if (run.mode === 'perk') perkOverlay(ctx, run);
  if (run.mode === 'shop') shopOverlay(ctx, run);
  if (run.mode === 'dead' || run.mode === 'win') endOverlay(ctx, run);
}

// ---- Oberfläche ----
let overlay: 'none' | 'char' | 'help' | 'inv' = 'none';
export const getOverlay = () => overlay;
export const setOverlay = (o: 'none' | 'char' | 'help' | 'inv') => { overlay = o; };

interface Slot { key: string; icon: string; name: string; desc: string; cost: string; count: string; ok: boolean; }

function slots(run: Run): Slot[] {
  const p = run.p, c = CLASSES[p.cls], out: Slot[] = [];
  if (c.range) out.push({ key: 'F', icon: `i_${p.cls}_shot`, name: c.shot, desc: `Fernangriff, ${c.range} Felder. Kostet nichts.`, cost: '', count: '', ok: true });
  c.skills.forEach((s, k) => out.push({ key: `${k + 1}`, icon: `i_${p.cls}${k}`, name: s.name, desc: `${s.desc}. Kostet ${skillCost(p, k)} ${c.resName}.`, cost: `${skillCost(p, k)}`, count: '', ok: p.res >= skillCost(p, k) }));
  out.push({ key: 'Q', icon: 'potion', name: 'Heiltrank', desc: 'Heilt einen großen Teil deines Lebens, löscht Gift und Brand.', cost: '', count: `${p.potions}`, ok: p.potions > 0 });
  out.push({ key: 'B', icon: 'bomb', name: 'Bombe', desc: 'Sprengt Gegner, rissige Wände und Säulen. Halte Abstand.', cost: '', count: `${p.bombs}`, ok: p.bombs > 0 });
  return out;
}

const STATUS: [string, string, string][] = [['brand', 'Brand', '#ef7d57'], ['gift', 'Gift', '#38b764'], ['stark', 'Kriegsschrei', '#b13e53'], ['dodge', 'Ausweichen', '#94b0c2']];

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
    const x = x0 + i * (S + gap) + (s.key === 'Q' ? 5 : s.key === 'B' ? 5 : 0);
    const over = mouse.x >= x && mouse.x < x + S && mouse.y >= y0 && mouse.y < y0 + S;
    if (over) hover = s;
    panel(ctx, x, y0, S, S, over ? '#ffcd75' : s.ok ? '#566c86' : '#333c57', s.ok ? 'rgba(28,32,51,0.92)' : 'rgba(13,14,23,0.92)');
    ctx.globalAlpha = s.ok ? 1 : 0.3;
    ctx.drawImage(sprites[s.icon], x + 5, y0 + 5);
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

  // Meldungen: höchstens zwei Zeilen, blenden nach ein paar Sekunden aus
  const lines = run.log.slice(-2).map(tr), sig = `${run.log.length}:${lines[lines.length - 1] ?? ''}`;
  if (sig !== logSeen) { logSeen = sig; logAt = time; }
  const age = time - logAt, la = age < 4 ? 1 : Math.max(0, 1 - (age - 4));
  if (lines.length && la > 0) {
    const max = Math.floor((x0 - 20) / 6), cut = lines.map(l => l.length > max ? l.slice(0, max - 3) + '...' : l);
    const w = Math.max(...cut.map(l => l.length)) * 6 + 10, yy = VH - 6 - cut.length * 10;
    ctx.globalAlpha = la * (under(0, yy - 4, w + 6, 40) ? 0.25 : 1);
    ctx.fillStyle = 'rgba(8,9,15,0.6)'; ctx.fillRect(2, yy - 3, w, cut.length * 10 + 5);
    cut.forEach((l, k) => text(ctx, l, 6, yy + k * 10, k === cut.length - 1 ? '#f4f4f4' : '#94b0c2', 8));
    ctx.globalAlpha = 1;
  }

  if (tutorial && run.mode === 'play') {
    const h0 = hint(run), h = h0 && tr(h0);
    if (h) { const w = h.length * 6 + 16; panel(ctx, (VW - w) >> 1, 38, w, 16, '#ffcd75'); text(ctx, h, VW / 2, 43, '#ffcd75', 8, 'center'); }
  }
  const boss = run.mobs.find(m => m.boss && m.awake);
  if (boss) {
    panel(ctx, VW / 2 - 90, 4, 180, 22, '#b13e53', 'rgba(13,14,23,0.75)');
    text(ctx, boss.name, VW / 2, 7, '#ffcd75', 8, 'center');
    bar(ctx, VW / 2 - 82, 18, 164, 4, boss.hp / boss.maxHp, '#b13e53');
  }
}

// ---- Rucksack ----
const inv = { col: 1, row: 0 };
export function invMove(run: Run, dx: number, dy: number) {
  if (dx) inv.col = dx > 0 ? 1 : 0;
  const n = inv.col ? Math.max(1, run.p.bag.length) : 3;
  inv.row = Math.max(0, Math.min(n - 1, inv.row + dy));
}
// Aktion für die Auswahl: Eingabetaste (anlegen/ablegen) oder Verkauf
export function invAction(run: Run, sell: boolean): import('../game/run').Action | null {
  const p = run.p;
  invMove(run, 0, 0);
  if (inv.col === 0) return !sell && p.gear[inv.row] ? { t: 'unequip', slot: inv.row } : null;
  if (!p.bag[inv.row]) return null;
  return sell ? { t: 'sell', i: inv.row } : { t: 'equip', i: inv.row };
}
const lookOf = (p: Run['p']) => heroLook(p.cls, p.gear[0]?.rar ?? 0, p.gear[1]?.rar ?? -1);

function invSheet(ctx: CanvasRenderingContext2D, run: Run, time: number) {
  const p = run.p, x = 60, y = 30, w = VW - 120, h = VH - 60;
  invMove(run, 0, 0);
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, x, y, w, h, '#ffcd75');
  text(ctx, 'RUCKSACK', x + 14, y + 12, '#ffcd75', 16);
  // Figur zeigt die angelegte Ausrüstung
  panel(ctx, x + 14, y + 36, 100, 100, '#333c57', '#1c2033');
  const look = lookOf(p);
  figure(ctx, `${look}:${['f', 's', 'b', 's'][Math.floor(time * 0.7) % 4]}${Math.floor(time * 3) % 2}`, x + 16, y + 38, 96, 96);
  const stats: [string, string, string][] = [['Leben', `${p.hp} / ${p.maxHp}`, '#b13e53'], ['Angriff', `${p.atk}`, '#f4f4f4'], ['Verteidigung', `${p.def}`, '#f4f4f4'], ['Kritisch', `${Math.round(p.crit * 100)} %`, '#f4f4f4']];
  stats.forEach(([k, v, col], i) => { text(ctx, k, x + 124, y + 42 + i * 12, '#94b0c2', 8); text(ctx, v, x + 232, y + 42 + i * 12, col, 8, 'right'); });
  ctx.drawImage(sprites.coin, x + 122, y + 94);
  text(ctx, `${p.gold} Gold`, x + 138, y + 97, '#ffcd75', 8);
  text(ctx, 'ANGELEGT', x + 14, y + 146, '#94b0c2', 8);
  ['Waffe', 'Rüstung', 'Amulett'].forEach((slot, i) => {
    const it = p.gear[i], gy = y + 158 + i * 26, sel = inv.col === 0 && inv.row === i;
    panel(ctx, x + 14, gy, 220, 23, sel ? '#ffcd75' : it ? RARITY_COL[it.rar] : '#333c57', sel ? 'rgba(60,50,40,0.9)' : 'rgba(13,14,23,0.9)');
    text(ctx, slot, x + 228, gy + 4, '#566c86', 8, 'right');
    text(ctx, it ? it.name : 'leer', x + 20, gy + 4, it ? RARITY_COL[it.rar] : '#566c86', 8);
    if (it) text(ctx, itemText(it) + (it.cursed ? ' · verflucht' : ''), x + 20, gy + 13, '#94b0c2', 8);
  });
  // Rucksack
  const bx = x + 250, bw = w - 264;
  text(ctx, `Im Rucksack: ${p.bag.length} / ${BAG_MAX}`, bx, y + 36, '#94b0c2', 8);
  if (!p.bag.length) text(ctx, 'Leer. Truhen und Händler füllen ihn.', bx, y + 52, '#566c86', 8);
  p.bag.forEach((it, i) => {
    const gy = y + 48 + i * 20, sel = inv.col === 1 && inv.row === i;
    panel(ctx, bx, gy, bw, 18, sel ? '#ffcd75' : '#333c57', sel ? 'rgba(60,50,40,0.9)' : 'rgba(13,14,23,0.9)');
    text(ctx, it.name, bx + 6, gy + 5, RARITY_COL[it.rar], 8);
    text(ctx, itemText(it) + (it.cursed ? ' · verflucht' : ''), bx + bw - 6, gy + 5, '#94b0c2', 8, 'right');
  });
  // Vergleich und Tasten
  const cur = inv.col === 1 ? p.bag[inv.row] : undefined, worn = cur ? p.gear[cur.slot] : undefined;
  if (cur) text(ctx, worn ? `Ersetzt: ${worn.name} (${itemText(worn)})` : 'Dieser Platz ist noch frei.', x + 14, y + h - 40, '#94b0c2', 8);
  const keys = inv.col === 1 ? (cur ? `[ENTER] anlegen · [X] verkaufen (${itemValue(cur)} Gold)` : '') : (p.gear[inv.row] ? '[ENTER] ablegen' : '');
  text(ctx, keys, x + 14, y + h - 27, '#ffcd75', 8);
  text(ctx, 'Pfeile: wählen · [I] oder [ESC] schließen', x + w - 14, y + h - 14, '#566c86', 8, 'right');
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
  ['Waffe', 'Rüstung', 'Amulett'].forEach((slot, i) => {
    const it = p.gear[i], gy = y + 27 + i * 22;
    panel(ctx, gx, gy, w - 362, 19, it ? RARITY_COL[it.rar] : '#333c57');
    text(ctx, it ? it.name : slot, gx + 6, gy + 2, it ? RARITY_COL[it.rar] : '#566c86', 8);
    text(ctx, it ? itemText(it) + (it.cursed ? ' · verflucht' : '') : 'leer', gx + 6, gy + 10, it ? '#94b0c2' : '#333c57', 8);
  });
  // Reliquien und Gaben
  const ly = y + 100;
  text(ctx, 'RELIQUIEN', x + 14, ly, '#73eff7', 8);
  if (!p.relics.length) text(ctx, 'Noch keine – löse Rätselkammern.', x + 14, ly + 12, '#566c86', 8);
  p.relics.slice(0, 8).forEach((id, i) => {
    text(ctx, RELICS[id].name, x + 14, ly + 12 + i * 20, '#f4f4f4', 8);
    text(ctx, RELICS[id].desc, x + 20, ly + 21 + i * 20, '#94b0c2', 8);
  });
  const px = x + 290;
  text(ctx, 'GABEN', px, ly, '#ffcd75', 8);
  const counts = new Map<string, number>();
  for (const id of p.perks) counts.set(id, (counts.get(id) ?? 0) + 1);
  if (!counts.size) text(ctx, 'Noch keine – steige eine Stufe auf.', px, ly + 12, '#566c86', 8);
  [...counts].slice(0, 14).forEach(([id, n], i) => {
    text(ctx, `${PERKS[id].name}${n > 1 ? ` x${n}` : ''}`, px, ly + 12 + i * 11, '#f4f4f4', 8);
    text(ctx, PERKS[id].desc, px + 104, ly + 12 + i * 11, '#94b0c2', 8);
  });
  text(ctx, '[C] oder [ESC] schließen', VW / 2, y + h - 13, '#566c86', 8, 'center');
}

const HELP: [string, string][] = [
  ['Pfeile / WASD', 'bewegen, in Gegner laufen greift an'], ['Leertaste', 'einen Zug warten'], ['1  2  3', 'Fähigkeiten'], ['F', 'Fernangriff (Magier, Waldläufer)'],
  ['Q', 'Heiltrank trinken'], ['B', 'Bombe werfen'], ['E', 'Treppe hinabsteigen'], ['Klick / Tab', 'Ziel wählen'], ['Maus', 'über etwas halten zeigt Details'],
  ['I', 'Rucksack: Ausrüstung wechseln, verkaufen'], ['C', 'Charakter, Reliquien, Gaben'], ['N', 'Karte: klein, groß, aus'], ['M', 'Ton ein/aus'], ['V', 'Vollbild'], ['H', 'diese Hilfe'],
];

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

function perkOverlay(ctx: CanvasRenderingContext2D, run: Run) {
  const ids = run.perkChoices, relic = !!RELICS[ids[0]], col = relic ? '#73eff7' : '#ffcd75';
  ctx.fillStyle = 'rgba(13,14,23,0.75)'; ctx.fillRect(0, 0, VW, VH);
  text(ctx, relic ? 'WÄHLE EINE RELIQUIE' : 'WÄHLE EINE GABE', VW / 2, 78, col, 24, 'center');
  const x0 = VW / 2 - (ids.length * 164 - 10) / 2;
  ids.forEach((id, i) => {
    const x = x0 + i * 164, y = 130, pk = RELICS[id] ?? PERKS[id];
    panel(ctx, x, y, 154, 96, col);
    text(ctx, `[${i + 1}]`, x + 77, y + 10, col, 10, 'center');
    text(ctx, pk.name, x + 77, y + 32, '#f4f4f4', 10, 'center');
    wrapText(pk.desc, 22).forEach((l, k) => text(ctx, l, x + 77, y + 54 + k * 11, '#94b0c2', 8, 'center'));
  });
  text(ctx, ids.length === 2 ? 'Taste 1 oder 2' : 'Taste 1, 2 oder 3', VW / 2, 242, '#94b0c2', 8, 'center');
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
    text(ctx, o.sold ? `${o.name} – verkauft` : o.name, x + 36, oy, o.sold ? '#566c86' : o.item ? RARITY_COL[o.item.rar] : '#f4f4f4');
    text(ctx, o.desc, x + 36, oy + 11, '#94b0c2', 8);
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
