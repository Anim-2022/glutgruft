import { VW, VH, TS, sprites, masks, tilesets, text, panel, bar } from './gfx';
import { W, H, T } from '../game/dungeon';
import { Run, Actor, xpNeed } from '../game/run';
import { CLASSES, PERKS, BIOME_NAMES, biomeOf } from '../game/content';

const pos = new Map<number, { x: number; y: number }>();
const lunges = new Map<number, { dx: number; dy: number; t: number }>();
const flashes = new Map<number, number>();
const nums: { x: number; y: number; s: string; col: string; t: number }[] = [];
const bolts: { x0: number; y0: number; x1: number; y1: number; col: string; t: number }[] = [];
const bits: { x: number; y: number; vx: number; vy: number; col: string; t: number }[] = [];
let shake = 0;
const cam = { x: 0, y: 0 };

const LUNGE_T = 0.16, FLASH_T = 0.12;

export function resetView() {
  pos.clear(); lunges.clear(); flashes.clear();
  nums.length = 0; bolts.length = 0; bits.length = 0; shake = 0;
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
};

export function drawRun(ctx: CanvasRenderingContext2D, run: Run, dt: number, time: number) {
  for (const f of run.fx.splice(0)) {
    switch (f.k) {
      case 'num': nums.push({ x: f.x * TS + 8, y: f.y * TS - nums.filter(n => n.t < 0.1).length * 8, s: f.s, col: f.col, t: 0 }); break;
      case 'shake': shake = Math.max(shake, f.n); break;
      case 'bolt': bolts.push({ ...f, t: 0 }); break;
      case 'lunge': lunges.set(f.id, { dx: f.dx, dy: f.dy, t: 0 }); break;
      case 'flash': flashes.set(f.id, FLASH_T); break;
      case 'die': shatter(f.kind, f.x, f.y); break;
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

  ctx.fillStyle = '#08090f'; ctx.fillRect(0, 0, VW, VH);
  const ts = tilesets[biomeOf(run.floor)];
  const x0 = Math.max(0, Math.floor(cam.x / TS) - 1), x1 = Math.min(W - 1, x0 + VW / TS + 2);
  const y0 = Math.max(0, Math.floor(cam.y / TS) - 1), y1 = Math.min(H - 1, y0 + Math.ceil(VH / TS) + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (!run.seen[i]) continue;
    const t = run.tiles[i], dx = x * TS + ox, dy = y * TS + oy;
    if (t === T.WALL) {
      const front = y + 1 < H && run.tiles[i + W] !== T.WALL;
      ctx.drawImage(front ? ts.wall : ts.top, dx, dy);
    } else {
      ctx.drawImage(ts.floor[(x * 7 + y * 13 + ((x * y) % 5)) % 4], dx, dy);
      if (y > 0 && run.tiles[i - W] === T.WALL) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(dx, dy, TS, 3); }
      const s = TILE_SPR[t];
      if (s) ctx.drawImage(sprites[s], dx, dy);
      if (t === T.ALTAR) {
        ctx.fillStyle = `rgba(115,239,247,${0.12 + 0.08 * Math.sin(time * 3)})`;
        ctx.fillRect(dx - 2, dy - 2, TS + 4, TS + 4);
      }
    }
    if (!run.vis[i]) { ctx.fillStyle = 'rgba(8,9,15,0.5)'; ctx.fillRect(dx, dy, TS, TS); }
    else {
      const d = Math.hypot(x - pp.x, y - pp.y);
      const a = Math.max(0, Math.min(0.2, (d - 5) * 0.06));
      if (a > 0) { ctx.fillStyle = `rgba(8,9,15,${a})`; ctx.fillRect(dx, dy, TS, TS); }
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

  hud(ctx, run);
  if (run.mode === 'perk') perkOverlay(ctx, run);
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

  const rx = VW - 136;
  panel(ctx, rx, 6, 130, 50);
  text(ctx, `Ebene ${run.floor}`, VW - 12, 11, '#f4f4f4', 10, 'right');
  text(ctx, BIOME_NAMES[biomeOf(run.floor)], VW - 12, 23, '#94b0c2', 8, 'right');
  ctx.drawImage(sprites.soul, rx + 5, 9);
  text(ctx, `${run.souls}`, rx + 21, 12, '#73eff7');
  ctx.drawImage(sprites.potion, rx + 5, 38);
  text(ctx, `x${p.potions} [Q]`, rx + 21, 41, p.potions ? '#f4f4f4' : '#566c86', 8);
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
  c.skills.forEach((s, k) => slot(`${k + 1}`, `i_${p.cls}${k}`, s.name, `${s.cost}`, p.res >= s.cost));

  const lines = run.log.slice(-4);
  if (lines.length) {
    ctx.fillStyle = 'rgba(8,9,15,0.55)';
    ctx.fillRect(4, VH - 46 - (lines.length - 1) * 10, Math.max(...lines.map(l => l.length)) * 6 + 10, lines.length * 10 + 4);
  }
  lines.forEach((l, k) => text(ctx, l, 8, VH - 42 - (lines.length - 1 - k) * 10, k === lines.length - 1 ? '#f4f4f4' : '#94b0c2', 8));

  const boss = run.mobs.find(m => m.boss && m.awake);
  if (boss) {
    text(ctx, boss.name, VW / 2, 10, '#ffcd75', 10, 'center');
    bar(ctx, VW / 2 - 100, 23, 200, 6, boss.hp / boss.maxHp, '#b13e53');
  }
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
  ctx.fillStyle = 'rgba(13,14,23,0.75)'; ctx.fillRect(0, 0, VW, VH);
  text(ctx, 'WÄHLE EINE GABE', VW / 2, 78, '#ffcd75', 24, 'center');
  run.perkChoices.forEach((id, i) => {
    const x = VW / 2 - 241 + i * 164, y = 130, pk = PERKS[id];
    panel(ctx, x, y, 154, 96, '#ffcd75');
    text(ctx, `[${i + 1}]`, x + 77, y + 10, '#ffcd75', 10, 'center');
    text(ctx, pk.name, x + 77, y + 32, '#f4f4f4', 10, 'center');
    wrapText(pk.desc, 22).forEach((l, k) => text(ctx, l, x + 77, y + 54 + k * 11, '#94b0c2', 8, 'center'));
  });
  text(ctx, 'Taste 1, 2 oder 3', VW / 2, 242, '#94b0c2', 8, 'center');
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
