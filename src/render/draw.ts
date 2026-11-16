import { VW, VH, TS, sprites, tilesets, text, panel, bar } from './gfx';
import { W, H, T } from '../game/dungeon';
import { Run, Actor, xpNeed } from '../game/run';
import { CLASSES, PERKS, BIOME_NAMES, biomeOf } from '../game/content';

const pos = new Map<number, { x: number; y: number }>();
const nums: { x: number; y: number; s: string; col: string; t: number }[] = [];
const bolts: { x0: number; y0: number; x1: number; y1: number; col: string; t: number }[] = [];
let shake = 0;
let cam = { x: 0, y: 0 };

export function resetView() { pos.clear(); nums.length = 0; bolts.length = 0; shake = 0; }

function smooth(a: Actor, dt: number) {
  let p = pos.get(a.id);
  if (!p || Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 3) { p = { x: a.x, y: a.y }; pos.set(a.id, p); }
  const k = Math.min(1, dt * 18);
  p.x += (a.x - p.x) * k; p.y += (a.y - p.y) * k;
  return p;
}

const TILE_SPR: Record<number, string> = {
  [T.STAIRS]: 'stairs', [T.CHEST]: 'chest', [T.CHEST_OPEN]: 'chest_open', [T.ALTAR]: 'altar', [T.ALTAR_USED]: 'altar_used',
};

export function drawRun(ctx: CanvasRenderingContext2D, run: Run, dt: number, time: number) {
  for (const f of run.fx.splice(0)) {
    if (f.k === 'num') nums.push({ x: f.x * TS + 8, y: f.y * TS - nums.filter(n => n.t < 0.1).length * 7, s: f.s, col: f.col, t: 0 });
    else if (f.k === 'shake') shake = Math.max(shake, f.n);
    else bolts.push({ ...f, t: 0 });
  }
  const p = run.p, pp = smooth(p, dt);
  const tx = Math.max(0, Math.min(W * TS - VW, pp.x * TS + 8 - VW / 2));
  const ty = Math.max(0, Math.min(H * TS - VH, pp.y * TS + 8 - VH / 2));
  cam.x += (tx - cam.x) * Math.min(1, dt * 10); cam.y += (ty - cam.y) * Math.min(1, dt * 10);
  if (Math.abs(tx - cam.x) > 200 || Math.abs(ty - cam.y) > 200) { cam.x = tx; cam.y = ty; }
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
    if (!run.vis[i]) { ctx.fillStyle = 'rgba(8,9,15,0.6)'; ctx.fillRect(dx, dy, TS, TS); }
    else {
      const d = Math.hypot(x - pp.x, y - pp.y);
      const a = Math.max(0, Math.min(0.28, (d - 4) * 0.07));
      if (a > 0) { ctx.fillStyle = `rgba(13,14,23,${a})`; ctx.fillRect(dx, dy, TS, TS); }
    }
  }
  for (const t of run.traps) ctx.drawImage(sprites.trap, t.x * TS + ox, t.y * TS + oy);

  const actor = (a: Actor, q: { x: number; y: number }) => {
    const bob = Math.floor(time * 2.5 + a.id * 0.37) % 2;
    const dx = Math.round(q.x * TS) + ox, dy = Math.round(q.y * TS) + oy - bob - 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(dx + 3, Math.round(q.y * TS) + oy + 13, 10, 2);
    if (a.boss) ctx.drawImage(sprites[a.kind], dx - 4, dy - 8, 24, 24);
    else ctx.drawImage(sprites[a.kind], dx, dy);
    if (a.st.stun) text(ctx, 'z', dx + 11, dy - 6, '#73eff7', 8);
    if (a.st.brand) { ctx.fillStyle = '#ef7d57'; ctx.fillRect(dx + 1, dy - 1, 2, 2); }
    if (a.st.gift) { ctx.fillStyle = '#38b764'; ctx.fillRect(dx + 4, dy - 1, 2, 2); }
    if (a !== p && a.hp < a.maxHp) {
      const w = a.boss ? 22 : 12, bx = dx + 8 - w / 2, by = dy - (a.boss ? 12 : 3);
      ctx.fillStyle = '#0d0e17'; ctx.fillRect(bx - 1, by - 1, w + 2, 4);
      ctx.fillStyle = '#b13e53'; ctx.fillRect(bx, by, Math.ceil(w * a.hp / a.maxHp), 2);
    }
  };
  for (const m of run.mobs) { const q = smooth(m, dt); if (run.vis[m.y * W + m.x]) actor(m, q); }
  if (p.st.stark) { ctx.fillStyle = `rgba(239,125,87,${0.25 + 0.1 * Math.sin(time * 8)})`; ctx.fillRect(Math.round(pp.x * TS) + ox - 1, Math.round(pp.y * TS) + oy - 3, 18, 18); }
  actor(p, pp);

  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.t += dt;
    if (b.t > 0.16) { bolts.splice(i, 1); continue; }
    const steps = 14, head = b.t / 0.16;
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
    text(ctx, n.s, n.x + ox, n.y + oy - n.t * 22, n.col, 10, 'center');
  }
  // Vignette
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, 90, VW / 2, VH / 2, 280);
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
  panel(ctx, 4, 4, 136, 47);
  ctx.drawImage(sprites[p.cls], 8, 10, 32, 32);
  text(ctx, `${c.name}  St. ${p.lvl}`, 44, 8, '#ffcd75');
  bar(ctx, 44, 19, 90, 9, p.hp / p.maxHp, '#b13e53');
  text(ctx, `${p.hp}/${p.maxHp}`, 89, 20, '#f4f4f4', 8, 'center');
  bar(ctx, 44, 31, 90, 9, p.res / p.resMax, c.resCol);
  text(ctx, `${c.resName} ${p.res}/${p.resMax}`, 89, 32, '#f4f4f4', 8, 'center');
  bar(ctx, 44, 43, 90, 2, p.exp / xpNeed(p.lvl), '#ffcd75');

  panel(ctx, VW - 112, 4, 108, 43);
  text(ctx, `Ebene ${run.floor}`, VW - 8, 8, '#f4f4f4', 10, 'right');
  text(ctx, BIOME_NAMES[biomeOf(run.floor)], VW - 8, 19, '#94b0c2', 8, 'right');
  ctx.drawImage(sprites.soul, VW - 108, 5);
  text(ctx, `${run.souls}`, VW - 90, 9, '#73eff7');
  ctx.drawImage(sprites.potion, VW - 108, 27);
  text(ctx, `x${p.potions} [Q]`, VW - 90, 32, p.potions ? '#f4f4f4' : '#566c86', 8);
  text(ctx, `A ${p.atk}${p.st.stark ? '+3' : ''}  V ${p.def}`, VW - 8, 32, '#94b0c2', 8, 'right');

  // Fähigkeitenleiste
  const n = c.skills.length + (c.range ? 1 : 0), bw = 104, x0 = (VW - n * bw - (n - 1) * 3) >> 1, y = VH - 21;
  let i = 0;
  const slot = (key: string, name: string, cost: string, ok: boolean) => {
    const x = x0 + i++ * (bw + 3);
    panel(ctx, x, y, bw, 17, ok ? '#566c86' : '#333c57');
    text(ctx, key, x + 5, y + 5, ok ? '#ffcd75' : '#566c86');
    text(ctx, name, x + 15, y + 5, ok ? '#f4f4f4' : '#566c86', 8);
    text(ctx, cost, x + bw - 5, y + 5, ok ? c.resCol : '#566c86', 8, 'right');
  };
  if (c.range) slot('F', c.shot, '', true);
  c.skills.forEach((s, k) => slot(`${k + 1}`, s.name, `${s.cost}`, p.res >= s.cost));

  const lines = run.log.slice(-4);
  lines.forEach((l, k) => text(ctx, l, 6, VH - 32 - (lines.length - 1 - k) * 10, k === lines.length - 1 ? '#f4f4f4' : '#94b0c2', 8));

  const boss = run.mobs.find(m => m.boss && m.awake);
  if (boss) {
    text(ctx, boss.name, VW / 2, 6, '#ffcd75', 10, 'center');
    bar(ctx, VW / 2 - 80, 20, 160, 5, boss.hp / boss.maxHp, '#b13e53');
  }
}

function perkOverlay(ctx: CanvasRenderingContext2D, run: Run) {
  ctx.fillStyle = 'rgba(13,14,23,0.75)'; ctx.fillRect(0, 0, VW, VH);
  text(ctx, 'WÄHLE EINE GABE', VW / 2, 52, '#ffcd75', 16, 'center');
  run.perkChoices.forEach((id, i) => {
    const x = 42 + i * 136, y = 92, pk = PERKS[id];
    panel(ctx, x, y, 124, 84, '#ffcd75');
    text(ctx, `[${i + 1}]`, x + 62, y + 8, '#ffcd75', 10, 'center');
    text(ctx, pk.name, x + 62, y + 26, '#f4f4f4', 10, 'center');
    wrapText(pk.desc, 18).forEach((l, k) => text(ctx, l, x + 62, y + 46 + k * 10, '#94b0c2', 8, 'center'));
  });
  text(ctx, 'Taste 1, 2 oder 3', VW / 2, 190, '#94b0c2', 8, 'center');
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

function endOverlay(ctx: CanvasRenderingContext2D, run: Run) {
  const win = run.mode === 'win';
  ctx.fillStyle = 'rgba(13,14,23,0.8)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, 130, 70, 220, 130, win ? '#ffcd75' : '#b13e53');
  text(ctx, win ? 'SIEG!' : 'GEFALLEN', VW / 2, 82, win ? '#ffcd75' : '#b13e53', 20, 'center');
  text(ctx, win ? 'Die Glutgruft ist bezwungen.' : `Ebene ${run.floor} – ${BIOME_NAMES[biomeOf(run.floor)]}`, VW / 2, 112, '#f4f4f4', 10, 'center');
  text(ctx, `Besiegte Gegner: ${run.kills}`, VW / 2, 130, '#94b0c2', 10, 'center');
  text(ctx, `Stufe: ${run.p.lvl}`, VW / 2, 143, '#94b0c2', 10, 'center');
  text(ctx, `+${run.souls} Seelensplitter`, VW / 2, 160, '#73eff7', 10, 'center');
  text(ctx, '[LEERTASTE] zurück zum Lager', VW / 2, 181, '#ffcd75', 8, 'center');
}
