// Render timeline (combat feel). Game logic resolves a whole turn in one call;
// here it is played back in order: hero strike → hit → reply of enemy 1 → enemy 2 …
// Rendering only: never touches run.rng, never writes to the run.
// Also holds the per-actor state (ActorAnim) shared by hit reactions and poses.
import type { Fx } from '../game/run';
import { fxScale, reducedFx } from './fxopts';

// Gap between two acting enemies; a whole turn plays back in at most BUDGET seconds
export const STAGGER = 0.03, BUDGET = 0.3, MELEE_HIT = 0.06, MAX_STOP = 0.17;
export const LUNGE_T = 0.16, FLASH_T = 0.12, RECOIL_T = 0.12, HURT_T = 0.3;

// ---------- Per-actor state ----------
export type Phase = 'idle' | 'windup' | 'strike' | 'recover' | 'hurt' | 'cast';
export interface ActorAnim {
  lunge: { dx: number; dy: number; t: number } | null; // attack lunge (t runs up to LUNGE_T)
  pose: { k: string; t: number } | null;               // frame a (attack) / c (cast), time left
  flash: number;                                        // time left of the white hit flash
  recoil: { dx: number; dy: number; t: number } | null; // recoil of the target (t runs up to RECOIL_T)
  hurt: number;                                         // time since the last hit (Infinity: none)
  knocked: boolean;                                     // this hit already pushed the actor as a knockback
}
const anims = new Map<number, ActorAnim>();
export function anim(id: number): ActorAnim {
  let a = anims.get(id);
  if (!a) anims.set(id, (a = { lunge: null, pose: null, flash: 0, recoil: null, hurt: Infinity, knocked: false }));
  return a;
}
export const peekAnim = (id: number) => anims.get(id);

// ---------- Poses and transitions (animation pass) ----------
// Weight of an actor: heavy ones wind up longer and strike further, quick ones snap
const HEAVY = new Set(['golem', 'koenig', 'mutter', 'fuerst', 'koenig2', 'mutter2', 'fuerst2', 'echse', 'krake', 'drache', 'medusa', 'tod']);
const QUICK = new Set(['ratte', 'fledermaus', 'glutgeist']);
export const weightOf = (kind: string) => (HEAVY.has(kind) ? 2 : QUICK.has(kind) ? 0 : 1);
// Attack offset in pixels along the lunge direction: wind-up (pull back) → strike → recover.
// The whole move fits LUNGE_T; the blow lands near MELEE_HIT (the peak), as the timeline expects.
export function lungeOffset(t: number, weight: number): number {
  const f = t / LUNGE_T, wind = weight === 2 ? 0.3 : weight === 0 ? 0.12 : 0.2, back = weight === 2 ? 2 : 1, reach = weight === 2 ? 8 : weight === 0 ? 5 : 6;
  if (f < wind) return -back * (f / wind);
  const g = (f - wind) / (1 - wind);
  return g < 0.35 ? -back + (reach + back) * (g / 0.35) : reach * (1 - (g - 0.35) / 0.65) ** 2;
}
// Lean while hurt: shear factor (0 … 0.18) that decays over RECOIL_T
export const hurtLean = (a: ActorAnim | undefined) => (a && a.hurt < RECOIL_T ? 0.18 * (1 - a.hurt / RECOIL_T) : 0);

// Phase for poses (read by the animation pass; derived from the same state)
export function phaseOf(id: number): Phase {
  const a = anims.get(id);
  if (!a) return 'idle';
  if (a.pose?.k === 'c') return 'cast';
  if (a.lunge) return a.lunge.t < LUNGE_T * 0.5 ? 'strike' : 'recover';
  if (a.hurt < RECOIL_T) return 'hurt';
  return 'idle';
}

export const startLunge = (id: number, dx: number, dy: number) => { anim(id).lunge = { dx, dy, t: 0 }; };
export const setPose = (id: number, k: string, t = 0.22) => { anim(id).pose = { k, t }; };
export function hitActor(id: number, dir: [number, number] | null) {
  const a = anim(id);
  a.flash = FLASH_T; a.hurt = 0; a.knocked = false;
  if (dir && (dir[0] || dir[1])) { const n = Math.hypot(dir[0], dir[1]); a.recoil = { dx: dir[0] / n, dy: dir[1] / n, t: 0 }; }
}

function stepAnims(dt: number) {
  for (const [id, a] of anims) {
    if (a.lunge && (a.lunge.t += dt) > LUNGE_T) a.lunge = null;
    if (a.pose && (a.pose.t -= dt) <= 0) a.pose = null;
    if (a.flash) a.flash = Math.max(0, a.flash - dt);
    if (a.recoil && (a.recoil.t += dt) > RECOIL_T) a.recoil = null;
    a.hurt += dt;
    if (!a.lunge && !a.pose && !a.flash && !a.recoil && a.hurt > HURT_T) anims.delete(id);
  }
}

// ---------- Effect queue ----------
type Item = { f: Fx; at: number };
const queue: Item[] = [];
const holds = new Map<number, number>(); // enemy stays at its old screen position until this time
let clock = 0, stop = 0, stopCool = 0, speed = 1;

// Projectiles: flight time; hits in the same beat (number, flash, death …) appear on impact
const PROJ = new Set<Fx['k']>(['fireball', 'arrow', 'bolt']);
const IMPACT = new Set<Fx['k']>(['num', 'flash', 'die', 'pdeath', 'debris', 'boom', 'shake', 'swipe', 'break']);
export function flightOf(f: Fx): number {
  if (f.k === 'bolt') return 0.12;
  if (f.k !== 'fireball' && f.k !== 'arrow') return 0;
  const fire = f.k === 'fireball', d = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
  return Math.min(fire ? 0.3 : 0.18, (fire ? 0.06 : 0.03) + d * (fire ? 0.03 : 0.018));
}

const queueEnd = () => queue.reduce((m, q) => Math.max(m, q.at), clock);

// Schedule the effects of a turn. Beats separate the actors.
export function schedule(list: Fx[]) {
  if (!list.length) return;
  const segs: { id: number | null; fx: Fx[] }[] = [{ id: null, fx: [] }];
  for (const f of list) if (f.k === 'beat') segs.push({ id: f.id, fx: [] }); else segs[segs.length - 1].fx.push(f);
  const live = segs.filter((s, i) => i === 0 || s.fx.length || (s.id ?? -1) >= 0);
  const acting = live.filter(s => s.fx.length > 0 || (s.id ?? -1) >= 0);
  const beats = Math.max(0, acting.length - 1);
  // When does a segment's blow land (relative to its start)?
  const landOf = (fx: Fx[]) => fx.reduce((m, f) => Math.max(m, f.k === 'lunge' ? MELEE_HIT : PROJ.has(f.k) ? flightOf(f) : 0), 0);
  // Steps between actors: gap + until the previous hit lands (at most 0.12 s);
  // many enemies: from seven on a single wave, and the whole turn is squeezed into BUDGET
  const gap = beats > 6 ? 0 : STAGGER;
  const steps = acting.slice(0, -1).map(s => gap + Math.min(landOf(s.fx), 0.12));
  const total = steps.reduce((a, b) => a + b, 0), squeeze = total > BUDGET ? BUDGET / total : 1;
  let cur = Math.max(clock, queueEnd());
  acting.forEach((s, i) => {
    if (s.id !== null && s.id >= 0) holds.set(s.id, cur);
    const land = cur + landOf(s.fx);
    for (const f of s.fx) queue.push({ f, at: IMPACT.has(f.k) ? land : cur });
    if (i < steps.length) cur += steps[i] * squeeze;
  });
  queue.sort((a, b) => a.at - b.at);
}

// Playback speed: 1 normal, 3 with a pending input, Infinity = show everything now
export const setPlayback = (s: number) => { speed = s; };
export const busy = () => queue.length > 0;

// Hitstop: freezes rendering only (input, logic and saving keep running)
export function hitstop(sec: number) {
  if (reducedFx() || stopCool > 0 || speed > 1) return;
  stop = Math.min(MAX_STOP, Math.max(stop, sec * fxScale()));
  stopCool = 0.15 + stop;
}
export const stopping = () => stop > 0;

// One frame: returns the scaled frame time (0 during hitstop) and the due effects
export function advance(dt: number): { sdt: number; out: Fx[] } {
  let sdt = dt;
  if (speed > 1) stop = 0;
  if (stop > 0) { const s = Math.min(stop, dt); stop -= s; sdt = dt - s; }
  stopCool = Math.max(0, stopCool - dt);
  clock = speed === Infinity ? Math.max(clock + sdt, queueEnd()) : clock + sdt * speed;
  const out: Fx[] = [];
  while (queue.length && queue[0].at <= clock + 1e-9) out.push(queue.shift()!.f);
  for (const [id, t] of holds) if (t <= clock) holds.delete(id);
  stepAnims(sdt * (speed === Infinity ? 1 : speed));
  return { sdt, out };
}

// An enemy whose beat has not come yet stays at its old screen position
export const held = (id: number) => (holds.get(id) ?? -Infinity) > clock;

export function resetTimeline() {
  queue.length = 0; holds.clear(); anims.clear();
  stop = 0; stopCool = 0; speed = 1;
}

// For tests: planned effect times relative to now
export const plannedTimes = () => queue.map(q => ({ k: q.f.k, at: q.at - clock }));
