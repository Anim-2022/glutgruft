// Tod der Gegner (Phase 3, Punkt 0.5): eigener Effekt je Gegnerart und eine Spur am Boden.
// Reine Darstellung: Zustand lebt nur hier (nicht im Lauf), Zufall nur über Math.random,
// die Spielart der Spur über einen Hash aus Feld und Art – sie flimmert nicht.
import { TS, sprites, masks } from './gfx';
import type { Run } from '../game/run';
import { W } from '../game/dungeon';

interface Light { x: number; y: number; r: number; col?: string; a?: number; }
type Part = { x: number; y: number; vx: number; vy: number; col: string; t: number; life: number; g: number; s: number };
type Dying = { kind: string; x: number; y: number; t: number; dur: number; key: string; dir: number; decal: string | null; done: boolean; extra: number };
type Decal = { x: number; y: number; key: string; big: boolean; age: number; fade: number; ember: boolean };

const parts: Part[] = [];
const dying: Dying[] = [];
const decals: Decal[] = [];
let decalFloor = -1;
export const MAX_DECALS = 40;
const DECAL_FADE = 0.6, EMBER_T = 3;

// „Effekte verringern“ (Phase 3, Punkt 5): Blut wird zu dunklen Flecken, keine Spritzer, kein Wackeln
let reduced = false;
try { reduced = localStorage.getItem('glutgruft.wenigfx') === '1'; } catch { /* kein Speicher */ }
export const reducedFx = () => reduced;
export function setReducedFx(on: boolean) { reduced = on; try { localStorage.setItem('glutgruft.wenigfx', on ? '1' : '0'); } catch { /* egal */ } }

const KINDS = ['ratte', 'skelett', 'schuetze', 'fledermaus', 'sporling', 'golem', 'glutgeist', 'koenig', 'mutter', 'fuerst'];
const DECAL_OF: Record<string, string> = {
  ratte: 'blood', skelett: 'bones', schuetze: 'bones_red', fledermaus: 'bat', sporling: 'spores', golem: 'rocks',
  glutgeist: 'embers', koenig: 'koenig', mutter: 'mutter', fuerst: 'fuerst',
};
const DUR: Record<string, number> = { ratte: 0.45, skelett: 0.6, schuetze: 0.6, fledermaus: 0.5, sporling: 0.35, golem: 0.7, glutgeist: 0.5, koenig: 0.9, mutter: 0.5, fuerst: 0.8 };
const hsh = (x: number, y: number, s: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0;

export function resetDeaths() { parts.length = 0; dying.length = 0; decals.length = 0; decalFloor = -1; }

function burst(x: number, y: number, n: number, cols: string[], v0: number, v1: number, o: { up?: number; g?: number; s?: number; life?: number } = {}) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = v0 + Math.random() * (v1 - v0);
    parts.push({ x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up ?? 30),
      col: cols[k % cols.length], t: 0, life: (o.life ?? 0.55) * (0.7 + Math.random() * 0.6), g: o.g ?? 220, s: o.s ?? 2 });
  }
}
// Sprite in eigene Pixel zerlegen (Rückfall und Knochen)
function shatter(key: string, tx: number, ty: number, step = 2, life = 0.55) {
  const s = sprites[key];
  if (!s) return;
  const d = s.getContext('2d')!.getImageData(0, 0, s.width, s.height).data;
  const ox = tx * TS + 8 - s.width / 2, oy = ty * TS + 14 - s.height;
  for (let y = 0; y < s.height; y += step) for (let x = 0; x < s.width; x += step) {
    const i = (y * s.width + x) * 4;
    if (d[i + 3] === 0) continue;
    const ang = Math.atan2(y - s.height / 2, x - s.width / 2) + (Math.random() - 0.5), v = 20 + Math.random() * 50;
    parts.push({ x: ox + x, y: oy + y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 30, col: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`, t: 0, life, g: 220, s: step });
  }
}

// Wird vom fx-Ereignis 'die' aufgerufen; liefert die gewünschte Bildschirmerschütterung
export function onDeath(run: Run, kind: string, x: number, y: number): number {
  if (!KINDS.includes(kind)) { shatter(`${kind}:f0`, x, y); return 0; }
  const boss = kind === 'koenig' || kind === 'mutter' || kind === 'fuerst';
  const key = boss && sprites[`${kind}2:f0`] ? `${kind}2:f0` : `${kind}:f0`;
  const cx = x * TS + 8, cy = y * TS + 8;
  const blood = reduced ? [] : ['#b13e53', '#7d2b45', '#6b1d2a'];
  dying.push({ kind, x, y, t: 0, dur: DUR[kind], key, dir: Math.random() < 0.5 ? -1 : 1, decal: DECAL_OF[kind], done: false, extra: 0 });
  switch (kind) {
    case 'ratte': if (blood.length) burst(cx, cy + 2, 10, blood, 30, 80, { up: 50 }); return 0;
    case 'skelett': shatter(key, x, y, 2, 0.5); return 0;
    case 'schuetze':
      shatter(key, x, y, 2, 0.5);
      burst(cx, cy - 4, 8, ['#b13e53', '#6b1d2a', '#7d2b45'], 10, 30, { up: 20, g: 50, s: 2, life: 0.9 }); // Kapuze sinkt langsam
      burst(cx + 4, cy, 4, ['#8a5a3a'], 30, 60, { up: 30, s: 1 });
      return 0;
    case 'fledermaus':
      burst(cx, cy - 2, 8, ['#9a4fc0', '#5d275d'], 10, 30, { up: 15, g: 40, s: 2, life: 1 });
      if (blood.length) burst(cx, cy, 6, blood, 20, 50, { up: 20 });
      return 0;
    case 'sporling':
      burst(cx, cy, 26, ['#38b764', '#a7f070', '#1e6b3a'], 10, 40, { up: 10, g: -20, s: 2, life: 1.1 });
      burst(cx, cy - 4, 6, ['#b13e53', '#f4f4f4'], 40, 80, { up: 40, s: 2 });
      return 0;
    case 'golem': return reduced ? 0 : 3;
    case 'glutgeist':
      burst(cx, cy, 12, ['#ffcd75', '#ef7d57', '#f4f4f4'], 40, 90, { up: 20, g: 60 });
      return 0;
    case 'koenig':
      shatter(key, x, y, 2, 0.7);
      burst(cx, cy, 10, ['#9a4fc0', '#5d275d'], 20, 60, { up: 30, g: 80, life: 0.9 });
      return reduced ? 0 : 6;
    case 'mutter':
      burst(cx, cy, 60, ['#38b764', '#a7f070', '#1e6b3a', '#ffcd75'], 15, 70, { up: 10, g: -15, s: 3, life: 1.4 });
      return reduced ? 0 : 5;
    case 'fuerst':
      burst(cx, cy, 40, ['#ffcd75', '#ef7d57', '#b13e53', '#f4f4f4'], 40, 140, { up: 40, g: 60, s: 3, life: 0.8 });
      return reduced ? 0 : 8;
  }
  return 0;
}

function addDecal(run: Run, kind: string, x: number, y: number, name: string) {
  const big = name === 'koenig' || name === 'mutter' || name === 'fuerst';
  const v = hsh(x, y, KINDS.indexOf(kind) + 1) % 2;
  decals.push({ x, y, key: `${name}_${v}`, big, age: 0, fade: 0, ember: name === 'embers' });
  // Höchstens 40 Spuren je Ebene: die ältesten blenden aus
  const live = decals.filter(d => !d.fade);
  for (let k = 0; k < live.length - MAX_DECALS; k++) live[k].fade = 1e-6;
  void run;
}

// Spuren zeichnen (über dem Boden, unter Gegenständen und Figuren)
export function drawDecals(ctx: CanvasRenderingContext2D, run: Run, ox: number, oy: number, lights: Light[], time: number, dt: number) {
  if (decalFloor !== run.floor) { decals.length = 0; decalFloor = run.floor; }
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i];
    d.age += dt;
    if (d.fade) { d.fade += dt; if (d.fade >= DECAL_FADE) { decals.splice(i, 1); continue; } }
    if (!run.seen[d.y * W + d.x]) continue;
    let key = `${reduced ? 'dcr' : 'dc'}_${d.key}`;
    // Glutgeist: Glut glimmt etwa drei Sekunden, dann bleibt Asche
    const glowing = d.ember && d.age < EMBER_T;
    if (d.ember && !glowing) key = key.replace('embers', 'ash');
    const sz = d.big ? 24 : 16, a = d.fade ? 1 - d.fade / DECAL_FADE : Math.min(1, d.age * 6);
    ctx.globalAlpha = a * (glowing ? 0.75 + 0.25 * Math.sin(time * 9 + d.x) : 1);
    ctx.drawImage(sprites[key], d.x * TS + 8 - sz / 2 + ox, d.y * TS + 8 - sz / 2 + oy + (d.big ? 2 : 0));
    ctx.globalAlpha = 1;
    if (glowing) lights.push({ x: d.x, y: d.y, r: 1.6 * (1 - d.age / EMBER_T) + 0.4, col: '#ef7d57', a: 0.7 });
  }
}

// Sterbeanimation und Partikel (über den Spuren, unter den lebenden Figuren)
export function drawDying(ctx: CanvasRenderingContext2D, run: Run, ox: number, oy: number, lights: Light[], dt: number) {
  for (let i = dying.length - 1; i >= 0; i--) {
    const m = dying[i];
    m.t += dt;
    const f = Math.min(1, m.t / m.dur), img = sprites[m.key];
    if (m.t >= m.dur) {
      if (m.decal && run.floor === decalFloor) addDecal(run, m.kind, m.x, m.y, m.decal);
      dying.splice(i, 1);
      continue;
    }
    if (!img) continue;
    const bx = m.x * TS + 8 + ox, by = m.y * TS + 14 + oy, cx = m.x * TS + 8, cy = m.y * TS + 8;
    const blit = (dx: number, dy: number, sc = 1, alpha = 1, src = img) => {
      ctx.globalAlpha = Math.max(0, alpha);
      const w = src.width * sc, h = src.height * sc;
      ctx.drawImage(src, Math.round(bx - w / 2 + dx), Math.round(by - h + dy), w, h);
      ctx.globalAlpha = 1;
    };
    switch (m.kind) {
      case 'ratte': // Hüpfer, dann fällt sie um und vergeht
        blit(0, -Math.sin(f * Math.PI) * 7, 1, f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4);
        break;
      case 'skelett': case 'schuetze': { // Schädel rollt davon
        const sx = Math.round(bx + m.dir * f * 12), sy = Math.round(by - 4 - Math.abs(Math.sin(f * Math.PI * 2)) * 3);
        ctx.fillStyle = '#f4f4f4'; ctx.fillRect(sx - 2, sy - 3, 5, 4);
        ctx.fillStyle = '#1a1c2c'; ctx.fillRect(sx - 1 + (Math.floor(f * 8) % 2), sy - 2, 1, 1); ctx.fillRect(sx + 1 + (Math.floor(f * 8) % 2), sy - 2, 1, 1);
        if (m.kind === 'schuetze' && f < 0.6) { ctx.fillStyle = '#b13e53'; ctx.fillRect(Math.round(bx - 4), Math.round(by - 14 + f * 14), 8, 2); }
        break;
      }
      case 'fledermaus': // stürzt ab
        blit(0, f * f * 8 - 2, 1, 1 - f * f);
        break;
      case 'sporling': case 'mutter': // bläht sich und platzt
        blit(0, 0, 1 + f * 0.35, 1 - f);
        if (m.kind === 'mutter') lights.push({ x: m.x, y: m.y, r: 3 * (1 - f), col: '#a7f070', a: 0.6 });
        break;
      case 'golem': { // Risse, Zittern, dann zerfällt er in Steine
        if (f < 0.5) {
          blit(Math.round((Math.random() - 0.5) * 2), 0);
          ctx.fillStyle = '#1a1c2c';
          const n = Math.floor(f * 12);
          for (let k = 0; k < n; k++) ctx.fillRect(Math.round(bx - 5 + ((k * 5) % 11)), Math.round(by - 13 + ((k * 7) % 12)), 1, 2);
        } else if (!m.extra) {
          m.extra = 1;
          burst(cx, cy, 14, ['#566c86', '#94b0c2', '#333c57'], 30, 80, { up: 40, s: 3, life: 0.6 });
          burst(cx, cy + 4, 16, ['#94b0c2', '#566c86'], 5, 25, { up: 10, g: -25, s: 2, life: 1 });
        }
        break;
      }
      case 'glutgeist': { // Blitz, schrumpft, verlischt, Rauch
        const mk = masks[m.key];
        if (mk) blit(0, 0, 1 + f * 0.6, 0.9 * (1 - f), mk);
        blit(0, 0, 1 - f * 0.7, 1 - f);
        if (Math.random() < dt * 30) parts.push({ x: cx + (Math.random() - 0.5) * 8, y: cy, vx: (Math.random() - 0.5) * 8, vy: -15, col: Math.random() < 0.5 ? '#566c86' : '#333c57', t: 0, life: 1, g: -10, s: 2 });
        lights.push({ x: m.x, y: m.y, r: 4 * (1 - f) + 0.5, col: '#ffcd75' });
        break;
      }
      case 'koenig': { // Blitz, Krone fliegt hoch und fällt
        const mk = masks[m.key];
        if (mk && f < 0.3) blit(0, 0, 1, 1 - f / 0.3, mk);
        const kx = Math.round(bx + m.dir * f * 8), ky = Math.round(by - 22 - Math.sin(f * Math.PI) * 12 + f * 14);
        ctx.fillStyle = '#ffcd75'; ctx.fillRect(kx - 4, ky, 9, 3); ctx.fillRect(kx - 4, ky - 2, 1, 2); ctx.fillRect(kx, ky - 2, 1, 2); ctx.fillRect(kx + 4, ky - 2, 1, 2);
        ctx.fillStyle = '#b13e53'; ctx.fillRect(kx - 2, ky + 1, 1, 1); ctx.fillRect(kx + 2, ky + 1, 1, 1);
        lights.push({ x: m.x, y: m.y, r: 4 * (1 - f), col: '#9a4fc0', a: 0.8 });
        break;
      }
      case 'fuerst': { // Feuerexplosion, glühende Risse erlöschen
        blit(0, 0, 1, 1 - f);
        const mk = masks[m.key];
        if (mk) { ctx.globalCompositeOperation = 'lighter'; blit(0, 0, 1, (1 - f) * (0.5 + 0.5 * Math.sin(m.t * 30)), mk); ctx.globalCompositeOperation = 'source-over'; }
        lights.push({ x: m.x, y: m.y, r: 7 * (1 - f) + 1, col: '#ef7d57' });
        if (Math.random() < dt * 40) parts.push({ x: cx + (Math.random() - 0.5) * 20, y: cy - Math.random() * 16, vx: (Math.random() - 0.5) * 20, vy: -30, col: Math.random() < 0.5 ? '#ef7d57' : '#ffcd75', t: 0, life: 0.6, g: -20, s: 2 });
        break;
      }
    }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t > p.life) { parts.splice(i, 1); continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x) + ox, Math.round(p.y) + oy, p.s, p.s);
  }
  ctx.globalAlpha = 1;
}

// Für Vorschau und Tests: aktuelle Spuren (nur lesen)
export const decalCount = () => decals.length;
