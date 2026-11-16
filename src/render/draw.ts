import { VW, VH, TS, sprites, masks, tilesets, text, panel, bar } from './gfx';
import { W, H, T, wallLike, walkable, los } from '../game/dungeon';
import { sfx } from '../core/audio';
import { Run, Actor, xpNeed, skillCost, itemText, RUNE_NAMES } from '../game/run';
import { CLASSES, MOBS, PERKS, RELICS, RARITY_COL, BIOME_NAMES, biomeOf } from '../game/content';

const pos = new Map<number, { x: number; y: number }>();
const lunges = new Map<number, { dx: number; dy: number; t: number }>();
const flashes = new Map<number, number>();
const nums: { x: number; y: number; s: string; col: string; t: number }[] = [];
const bolts: { x0: number; y0: number; x1: number; y1: number; col: string; t: number }[] = [];
const booms: { x: number; y: number; r: number; t: number }[] = [];
const bits: { x: number; y: number; vx: number; vy: number; col: string; t: number }[] = [];
let shake = 0;
const cam = { x: 0, y: 0 };
const view = { ox: 0, oy: 0 };
// Bildschirmpunkt -> Kartenfeld (für Mausklicks)
export const tileAt = (mx: number, my: number): [number, number] => [Math.floor((mx - view.ox) / TS), Math.floor((my - view.oy) / TS)];

const LUNGE_T = 0.16, FLASH_T = 0.12;

// ---- Anzeigeoptionen ----
const mouse = { x: -1, y: -1 };
let showMap = true, tutorial = false;
export const setMouse = (x: number, y: number) => { mouse.x = x; mouse.y = y; };
export const toggleMap = () => { showMap = !showMap; };
export const setTutorial = (on: boolean) => { tutorial = on; };

// ---- Fackellicht: wird einmal pro Ebene berechnet ----
const light = new Float32Array(W * H);
const torches = new Set<number>();
let lightKey = '';
const hash = (x: number, y: number, s: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0;

function buildLight(run: Run) {
  const key = `${run.seed}:${run.floor}`;
  if (key === lightKey) return;
  lightKey = key;
  light.fill(0); torches.clear();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (run.tiles[i] !== T.WALL || !walkable(run.tiles[i + W]) || hash(x, y, run.seed + run.floor) % 6) continue;
    torches.add(i);
    const sx = x, sy = y + 1, R = 5.5;
    for (let ty = sy - 6; ty <= sy + 6; ty++) for (let tx = sx - 6; tx <= sx + 6; tx++) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const d = Math.hypot(tx - sx, ty - sy);
      if (d > R || !los(run.tiles, sx, sy, tx, ty)) continue;
      light[ty * W + tx] = Math.max(light[ty * W + tx], 1 - d / R);
    }
  }
}

export function resetView() {
  pos.clear(); lunges.clear(); flashes.clear();
  nums.length = 0; bolts.length = 0; bits.length = 0; booms.length = 0; shake = 0;
}

function smooth(a: Actor, dt: number) {
  let p = pos.get(a.id);
  if (!p || Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 3) { p = { x: a.x, y: a.y }; pos.set(a.id, p); }
  const k = Math.min(1, dt * 18);
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
  [T.CURSED]: 'cursed', [T.TRADER]: 'trader',
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
  const tx = Math.max(0, Math.min(W * TS - VW, pp.x * TS + 8 - VW / 2));
  const ty = Math.max(0, Math.min(H * TS - VH, pp.y * TS + 8 - VH / 2));
  if (Math.abs(tx - cam.x) > 220 || Math.abs(ty - cam.y) > 220) { cam.x = tx; cam.y = ty; }
  cam.x += (tx - cam.x) * Math.min(1, dt * 10); cam.y += (ty - cam.y) * Math.min(1, dt * 10);
  shake = Math.max(0, shake - dt * 30);
  const sx = shake ? Math.round((Math.random() - 0.5) * shake) : 0, sy = shake ? Math.round((Math.random() - 0.5) * shake) : 0;
  const ox = -Math.round(cam.x) + sx, oy = -Math.round(cam.y) + sy;

  view.ox = ox - sx; view.oy = oy - sy;
  ctx.fillStyle = '#08090f'; ctx.fillRect(0, 0, VW, VH);
  const ts = tilesets[biomeOf(run.floor)];
  buildLight(run);
  const x0 = Math.max(0, Math.floor(cam.x / TS) - 1), x1 = Math.min(W - 1, x0 + VW / TS + 2);
  const y0 = Math.max(0, Math.floor(cam.y / TS) - 1), y1 = Math.min(H - 1, y0 + Math.ceil(VH / TS) + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (!run.seen[i]) continue;
    const t = run.tiles[i], dx = x * TS + ox, dy = y * TS + oy;
    if (wallLike(t)) {
      const front = y + 1 < H && !wallLike(run.tiles[i + W]);
      ctx.drawImage(front ? ts.wall : ts.top, dx, dy);
      if (t === T.CRACKED) ctx.drawImage(sprites[(run.cracks.get(i) ?? 0) >= 2 ? 'crack2' : 'crack'], dx, dy);
      if (front && torches.has(i)) ctx.drawImage(sprites[`torch${Math.floor(time * 7 + x) % 2}`], dx, dy);
    } else {
      ctx.drawImage(t === T.ICE ? sprites.ice : ts.floor[(x * 7 + y * 13 + ((x * y) % 5)) % 4], dx, dy);
      if (y > 0 && wallLike(run.tiles[i - W])) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(dx, dy, TS, 3); }
      if (t === T.FLOOR) { const h = hash(x, y, run.seed + run.floor * 7); if (h % 9 === 0) ctx.drawImage(ts.decals[(h >>> 8) % ts.decals.length], dx, dy); }
      if (t === T.GRASS) ctx.drawImage(ts.grass[(x * 5 + y * 3) % 3], dx, dy);
      else if (t === T.BURNT) ctx.drawImage(ts.burnt, dx, dy);
      const s = TILE_SPR[t];
      if (t === T.CRATE_ON) ctx.drawImage(sprites.plate, dx, dy);
      if (s) ctx.drawImage(sprites[s], dx, dy);
      if (t === T.CRATE_ON) { ctx.fillStyle = 'rgba(255,205,117,0.3)'; ctx.fillRect(dx + 1, dy + 1, 14, 14); }
      if (t === T.GOAL) { ctx.fillStyle = `rgba(115,239,247,${0.15 + 0.1 * Math.sin(time * 4)})`; ctx.fillRect(dx, dy, TS, TS); }
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
        ctx.fillStyle = 'rgba(239,125,87,0.22)'; ctx.fillRect(dx - 3, dy - 3, TS + 6, TS + 6);
        ctx.drawImage(sprites[Math.floor(time * 8 + x + y) % 2 ? 'fire_a' : 'fire_b'], dx, dy - 2);
      }
      if (t === T.ALTAR) {
        ctx.fillStyle = `rgba(115,239,247,${0.12 + 0.08 * Math.sin(time * 3)})`;
        ctx.fillRect(dx - 2, dy - 2, TS + 4, TS + 4);
      }
    }
    // Licht: Spieler trägt eine Laterne, Fackeln erhellen ihre Umgebung warm
    const tl = light[i] * (0.88 + 0.12 * Math.sin(time * 9 + i));
    if (!run.vis[i]) { ctx.fillStyle = `rgba(8,9,15,${0.62 - 0.18 * light[i]})`; ctx.fillRect(dx, dy, TS, TS); }
    else {
      const d = Math.hypot(x - pp.x, y - pp.y);
      const L = Math.min(1, Math.max(tl * 1.2, 1 - Math.max(0, d - 2.5) / 6));
      const a = (1 - L) * 0.55;
      if (a > 0.02) { ctx.fillStyle = `rgba(8,9,15,${a})`; ctx.fillRect(dx, dy, TS, TS); }
      if (tl > 0.05) { ctx.fillStyle = `rgba(239,125,87,${0.14 * tl})`; ctx.fillRect(dx, dy, TS, TS); }
    }
  }
  for (const t of run.traps) ctx.drawImage(sprites.trap, t.x * TS + ox, t.y * TS + oy);

  const actor = (a: Actor, q: { x: number; y: number }) => {
    const frame = Math.floor(time * 2.5 + a.id * 0.37) % 2 ? a.kind + '_b' : a.kind;
    const img = sprites[frame];
    const l = lunges.get(a.id), k = l ? Math.sin((l.t / LUNGE_T) * Math.PI) * 6 : 0;
    const bx = Math.round(q.x * TS + (l ? l.dx * k : 0)) + ox, by = Math.round(q.y * TS + (l ? l.dy * k : 0)) + oy;
    const dx = bx + 8 - img.width / 2, dy = by + 14 - img.height;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bx + 8 - img.width / 2 + 3, Math.round(q.y * TS) + oy + 13, img.width - 6, 2);
    ctx.drawImage(img, dx, dy);
    const fl = flashes.get(a.id);
    if (fl) { ctx.globalAlpha = Math.min(1, fl / FLASH_T + 0.2); ctx.drawImage(masks[frame], dx, dy); ctx.globalAlpha = 1; }
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
  if (p.st.stark) { ctx.fillStyle = `rgba(239,125,87,${0.25 + 0.1 * Math.sin(time * 8)})`; ctx.fillRect(Math.round(pp.x * TS) + ox - 1, Math.round(pp.y * TS) + oy - 3, 18, 18); }
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
    b.vy += 220 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
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
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i];
    n.t += dt;
    if (n.t > 0.8) { nums.splice(i, 1); continue; }
    text(ctx, n.s, n.x + ox, n.y + oy - 6 - n.t * 22, n.col, 10, 'center');
  }
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, 130, VW / 2, VH / 2, 380);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
  if (p.hp / p.maxHp < 0.3 && run.mode === 'play') {
    ctx.fillStyle = `rgba(177,62,83,${0.08 + 0.06 * Math.sin(time * 6)})`; ctx.fillRect(0, 0, VW, VH);
  }

  tooltip(ctx, run, ox - sx, oy - sy);
  hud(ctx, run);
  if (showMap) minimap(ctx, run, time);
  if (run.mode === 'perk') perkOverlay(ctx, run);
  if (run.mode === 'shop') shopOverlay(ctx, run);
  if (run.mode === 'dead' || run.mode === 'win') endOverlay(ctx, run);
}

function hud(ctx: CanvasRenderingContext2D, run: Run) {
  const p = run.p, c = CLASSES[p.cls];
  panel(ctx, 6, 6, 178, 50);
  ctx.drawImage(sprites[p.cls], 10, 14, 32, 32);
  text(ctx, `${c.name}  St. ${p.lvl}`, 50, 11, '#ffcd75');
  bar(ctx, 50, 22, 128, 9, p.hp / p.maxHp, '#b13e53');
  text(ctx, `${p.hp}/${p.maxHp}`, 114, 23, '#f4f4f4', 8, 'center');
  bar(ctx, 50, 34, 128, 9, p.res / p.resMax, c.resCol);
  text(ctx, `${c.resName} ${p.res}/${p.resMax}`, 114, 35, '#f4f4f4', 8, 'center');
  bar(ctx, 50, 47, 128, 2, p.exp / xpNeed(p.lvl), '#ffcd75');

  let ly = 62;
  for (const it of p.gear) if (it) { text(ctx, `${it.name}: ${itemText(it)}`, 8, ly, RARITY_COL[it.rar], 8); ly += 10; }
  for (const id of p.relics) { text(ctx, RELICS[id].name, 8, ly, '#73eff7', 8); ly += 10; }
  const z = run.puzzle;
  if (z && z.kind === 'arena' && z.started && !z.solved && !z.dead) text(ctx, `Prüfung: noch ${z.timer} Züge`, VW / 2, 84, '#b13e53', 10, 'center');

  const rx = VW - 176;
  panel(ctx, rx, 6, 170, 50);
  text(ctx, `Ebene ${run.floor}`, VW - 12, 11, '#f4f4f4', 10, 'right');
  text(ctx, BIOME_NAMES[biomeOf(run.floor)], VW - 12, 23, '#94b0c2', 8, 'right');
  ctx.drawImage(sprites.soul, rx + 5, 9);
  text(ctx, `${run.souls}`, rx + 21, 12, '#73eff7');
  ctx.drawImage(sprites.coin, rx + 46, 9);
  text(ctx, `${p.gold}`, rx + 61, 12, '#ffcd75');
  ctx.drawImage(sprites.potion, rx + 5, 38);
  text(ctx, `${p.potions} [Q]`, rx + 20, 41, p.potions ? '#f4f4f4' : '#566c86', 8);
  ctx.drawImage(sprites.bomb, rx + 52, 38);
  text(ctx, `${p.bombs} [B]`, rx + 67, 41, p.bombs ? '#f4f4f4' : '#566c86', 8);
  text(ctx, `A ${p.atk}${p.st.stark ? '+3' : ''}  V ${p.def}`, VW - 12, 41, '#94b0c2', 8, 'right');

  // Fähigkeitenleiste
  const n = c.skills.length + (c.range ? 1 : 0), bw = 128, x0 = (VW - n * bw - (n - 1) * 4) >> 1, y = VH - 28;
  let i = 0;
  const slot = (key: string, icon: string, name: string, cost: string, ok: boolean) => {
    const x = x0 + i++ * (bw + 4);
    panel(ctx, x, y, bw, 22, ok ? '#566c86' : '#333c57');
    ctx.globalAlpha = ok ? 1 : 0.35;
    ctx.drawImage(sprites[icon], x + 5, y + 5);
    ctx.globalAlpha = 1;
    text(ctx, key, x + 22, y + 8, ok ? '#ffcd75' : '#566c86');
    text(ctx, name, x + 32, y + 8, ok ? '#f4f4f4' : '#566c86', 8);
    text(ctx, cost, x + bw - 6, y + 8, ok ? c.resCol : '#566c86', 8, 'right');
  };
  if (c.range) slot('F', `i_${p.cls}_shot`, c.shot, '', true);
  c.skills.forEach((s, k) => slot(`${k + 1}`, `i_${p.cls}${k}`, s.name, `${skillCost(p, k)}`, p.res >= skillCost(p, k)));

  const lines = run.log.slice(-4);
  if (lines.length) {
    ctx.fillStyle = 'rgba(8,9,15,0.55)';
    ctx.fillRect(4, VH - 46 - (lines.length - 1) * 10, Math.max(...lines.map(l => l.length)) * 6 + 10, lines.length * 10 + 4);
  }
  lines.forEach((l, k) => text(ctx, l, 8, VH - 42 - (lines.length - 1 - k) * 10, k === lines.length - 1 ? '#f4f4f4' : '#94b0c2', 8));

  if (tutorial && run.mode === 'play') {
    const h = hint(run);
    if (h) { const w = h.length * 6 + 16; panel(ctx, (VW - w) >> 1, 62, w, 16, '#ffcd75'); text(ctx, h, VW / 2, 67, '#ffcd75', 8, 'center'); }
  }
  const boss = run.mobs.find(m => m.boss && m.awake);
  if (boss) {
    text(ctx, boss.name, VW / 2, 10, '#ffcd75', 10, 'center');
    bar(ctx, VW / 2 - 100, 23, 200, 6, boss.hp / boss.maxHp, '#b13e53');
  }
}

const TILE_NAMES: Record<number, string> = {
  [T.STAIRS]: 'Treppe nach unten [E]', [T.CHEST]: 'Truhe', [T.CURSED]: 'Verfluchte Truhe – stark, aber kostet Leben', [T.TRADER]: 'Händler – hineinlaufen zum Handeln', [T.ALTAR]: 'Altar: Leben gegen eine Gabe', [T.CRACKED]: 'Rissige Wand – 3 Schläge oder Bombe',
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
  const w = Math.max(...lines.map(l => l.length)) * 6 + 12, h = lines.length * 10 + 8;
  const x = Math.min(VW - w - 4, mouse.x + 10), y = Math.max(4, Math.min(VH - h - 34, mouse.y + 10));
  panel(ctx, x, y, w, h, '#ffcd75');
  lines.forEach((l, k) => text(ctx, l, x + 6, y + 5 + k * 10, k ? '#94b0c2' : '#f4f4f4', 8));
}

function minimap(ctx: CanvasRenderingContext2D, run: Run, time: number) {
  const x0 = VW - 110, y0 = 60;
  panel(ctx, x0 - 2, y0 - 2, W * 2 + 4, H * 2 + 4, '#333c57', 'rgba(13,14,23,0.7)');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = run.tiles[i];
    if (!run.seen[i] || t === T.WALL) continue;
    ctx.fillStyle = t === T.STAIRS ? '#ffcd75' : t === T.CHEST ? '#c98a3a' : t === T.CRACKED ? '#b13e53'
      : (t >= T.CRATE && t <= T.GOAL) ? '#41a6f6' : run.fire.has(i) ? '#ef7d57' : run.vis[i] ? '#94b0c2' : '#566c86';
    ctx.fillRect(x0 + x * 2, y0 + y * 2, 2, 2);
  }
  ctx.fillStyle = '#b13e53';
  for (const m of run.mobs) if (run.vis[m.y * W + m.x]) ctx.fillRect(x0 + m.x * 2, y0 + m.y * 2, 2, 2);
  if (Math.floor(time * 4) % 2) { ctx.fillStyle = '#f4f4f4'; ctx.fillRect(x0 + run.p.x * 2 - 1, y0 + run.p.y * 2 - 1, 4, 4); }
}

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
