// Status bar: which effects, buffs and passives the hero has right now (HUD row under the health bar).
// Read only – no canvas, no random numbers, no changes to the run. Texts come from the game data
// (PERKS, RELICS, SYNERGIES, AFFIX, skills and tree nodes) wherever the data has them.
import { CLASSES, PERKS, RELICS, SYNERGIES, AFFIX, CONSUMABLES, NEW_SKILLS, SKILL_UP, nodeText } from '../game/content';
import { hasNode, hunted, eventGoal } from '../game/run';
import type { Run, Player } from '../game/run';
import { PERK_ICON, type Ref } from './icons';

export type StatusKind = 'bad' | 'good' | 'passive';
export type StatusSrc = 'status' | 'perk' | 'relic' | 'synergy' | 'item' | 'group';
export interface StatusEntry {
  id: string; name: string; desc: string;
  turns?: number;          // remaining turns (temporary effects)
  count?: number;          // stacks or how often a boon was taken
  kind: StatusKind; src: StatusSrc;
  icon: Ref; col: string;  // motif and colour of the icon (border and tint)
  items?: StatusEntry[];   // group icon: the passives it stands for
}

const BAD = '#b13e53', GOOD = '#a7f070';
export const KIND_COL: Record<StatusSrc, string> = { status: GOOD, perk: '#ffcd75', relic: '#73eff7', synergy: '#d08cff', item: '#41a6f6', group: '#94b0c2' };

// every key the game sets on the hero's p.st; helpers (rx, ry: smoke position) are not statuses
export const STATUS_KEYS = ['gift', 'brand', 'netz', 'stein', 'stun', 'stark', 'wall', 'eis', 'sw', 'schild', 'dodge', 'konter', 'rauch', 'aim', 'schatten', 'nachhall', 'riss', 'rausch'];
export const STATUS_HELPERS = ['rx', 'ry'];

const node = (p: Player, id: string) => nodeText(p.cls, id);
const temp = (id: string, name: string, desc: string, kind: 'bad' | 'good', icon: Ref, col: string, turns?: number): StatusEntry =>
  ({ id, name, desc, kind, src: 'status', icon, col, turns });

// Temporary statuses on the hero, bad ones first
function statuses(run: Run): StatusEntry[] {
  const p = run.p, st = p.st, bad: StatusEntry[] = [], good: StatusEntry[] = [];
  if (st.gift) bad.push(temp('gift', 'Poison', `Lose 1 health each turn. A healing potion cures it.`, 'bad', ['poison'], '#38b764', st.gift));
  if (st.brand) {
    const heal = p.relics.includes('glutherz');
    (heal ? good : bad).push(temp('brand', 'Burn', heal ? `${RELICS.glutherz.name}: ${RELICS.glutherz.desc}.` : `Lose 2 health each turn. Water or a healing potion puts it out.`, heal ? 'good' : 'bad', ['flame'], '#ef7d57', st.brand));
  }
  if (st.stein) bad.push(temp('stein', 'Petrified', `Turned to stone: you cannot move, and the gaze keeps hurting you.`, 'bad', ['rock'], '#c9d4dc', st.stein));
  else if (st.netz) bad.push(temp('netz', 'Net', `Caught: you cannot move. Walking only tugs at it. You can still attack and use skills.`, 'bad', ['net'], '#c9d4dc', st.netz));
  if (st.stun) bad.push(temp('stun', 'Stunned', `You lose your turns.`, 'bad', ['snow'], '#73eff7', st.stun));
  if (st.riss) { const t = node(p, 'n2_5'); bad.push(temp('riss', `${t.name} (cooldown)`, `${t.desc}. Blink is ready again in ${st.riss} turn${st.riss === 1 ? '' : 's'}.`, 'bad', ['hourglass'], '#94b0c2', st.riss)); }
  if (st.rausch) { const t = node(p, 'n1_5'); bad.push(temp('rausch', `${t.name} (cooldown)`, `${t.desc}. Ready again in ${st.rausch} turn${st.rausch === 1 ? '' : 's'}.`, 'bad', ['axeblood'], '#94b0c2', st.rausch)); }

  if (st.stark) {
    const k = p.cls === 'krieger', sk = CLASSES.krieger.skills[2];
    good.push(temp('stark', k ? sk.name : CONSUMABLES.kraft.name, `+3 attack.`, 'good', ['fist'], '#b13e53', st.stark));
  }
  if (st.wall) { const [n] = SKILL_UP.krieger2.b; good.push(temp('wall', n, `+3 defense while ${CLASSES.krieger.skills[2].name} lasts.`, 'good', ['shield'], '#41a6f6', st.wall)); }
  if (st.sw) { const t = node(p, 'n0_2a'); good.push(temp('sw', t.name, `${t.desc}.`, 'good', ['helm'], '#94b0c2', st.sw)); }
  if (st.eis) { const t = node(p, 'n1_2b'); good.push(temp('eis', t.name, `${t.desc}.`, 'good', ['crystal'], '#73eff7', st.eis)); }
  if (st.schild) { const s = NEW_SKILLS.arkanschild; good.push(temp('schild', s.name, `${s.desc}. ${p.shield ?? 0} damage left to absorb.`, 'good', ['shield', { d: 'b' }], '#9a4fc0', st.schild)); }
  if (st.dodge) good.push(temp('dodge', 'Dodging', `Enemy attacks miss you.`, 'good', ['boot'], '#94b0c2', st.dodge));
  if (st.konter) { const s = SYNERGIES.find(q => q.id === 'konter')!; good.push(temp('konter', s.name, `${s.desc}. It is ready now.`, 'good', ['target'], '#ffcd75')); }
  if (st.rauch) {
    const s = NEW_SKILLS.rauchbombe, inside = Math.max(Math.abs(p.x - st.rx), Math.abs(p.y - st.ry)) <= 2;
    good.push(temp('rauch', s.name, `${s.desc}. ${inside ? 'You are inside the smoke.' : 'You are outside the smoke.'}`, 'good', ['waves', { s: 'g', w: 'd' }], '#94b0c2', st.rauch));
  }
  if (st.aim) { const t = node(p, 'n0_5'); const e = temp('aim', t.name, `${t.desc}. Next shot +${25 * st.aim} %.`, 'good', ['target', { r: 'l' }], '#a7f070'); e.count = st.aim; good.push(e); }
  if (st.schatten) { const t = node(p, 'n2_2a'); good.push(temp('schatten', t.name, `${t.desc}. It is ready now.`, 'good', ['cloak'], '#9a4fc0')); }
  if (st.nachhall) { const t = node(p, 'n2_2a'); good.push(temp('nachhall', t.name, `${t.desc}. It is ready now.`, 'good', ['manaorb'], '#41a6f6')); }
  return [...bad, ...good];
}

// Effects that are not on p.st but in effect right now: hunt pressure, events, curses, conditional bonuses
function buffs(run: Run): StatusEntry[] {
  const p = run.p, out: StatusEntry[] = [];
  if (hunted(run)) out.push(temp('hunted', 'Hunted', 'Something hunts you on this floor: no passive healing, fountains and altars refuse you. Find the stairs.', 'bad', ['skull'], BAD));
  if (run.ev?.data.fog) out.push(temp('fog', eventGoal(run)?.title ?? 'Fog', 'Thick fog: you see 3 tiles less.', 'bad', ['eye', { s: 'd', w: 'g' }], '#94b0c2'));
  const cursed = p.gear.find(it => it?.cursed && it.lock === run.floor);
  if (cursed) out.push(temp('curse', 'Cursed', `The curse holds ${cursed.name} tight – it only lets go on the next floor.`, 'bad', ['skull', { w: 'v' }], '#9a4fc0'));
  if (p.cls === 'krieger' && hasNode(p, 'n2_5') && p.hp < p.maxHp * 0.5) { const t = node(p, 'n2_5'); out.push(temp('blutrausch', t.name, `${t.desc}. Active now: below 50 % life.`, 'good', ['drop'], BAD)); }
  if (p.shield && !p.st.schild) out.push(temp('shield', NEW_SKILLS.arkanschild.name, `${p.shield} damage left to absorb.`, 'good', ['shield', { d: 'b' }], '#9a4fc0'));
  return out;
}

// Permanent passives: boons (grouped by kind), relics, synergies, effects of worn equipment
function passives(run: Run): StatusEntry[] {
  const p = run.p, out: StatusEntry[] = [];
  const counts = new Map<string, number>();
  for (const id of p.perks) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    const d = PERKS[id];
    if (!d) continue;
    out.push({ id, name: d.name, desc: `${d.desc}.${n > 1 ? ` Taken ${n} times.` : ''}`, count: n > 1 ? n : undefined, kind: 'passive', src: 'perk', icon: PERK_ICON[id] ?? ['soul'], col: KIND_COL.perk });
  }
  for (const id of p.relics) {
    const d = RELICS[id];
    if (!d) continue;
    const note = id === 'eisenwille' ? (run.willUsed ? ' Used on this floor.' : ' Ready on this floor.') : '';
    out.push({ id, name: d.name, desc: `${d.desc}.${note}`, kind: 'passive', src: 'relic', icon: PERK_ICON[id] ?? ['soul'], col: KIND_COL.relic });
  }
  for (const id of p.syn) {
    const s = SYNERGIES.find(q => q.id === id);
    if (!s) continue;
    out.push({ id: `syn:${id}`, name: s.name, desc: `Synergy of ${PERKS[s.need[0]].name} and ${PERKS[s.need[1]].name}: ${s.desc}.`, kind: 'passive', src: 'synergy', icon: PERK_ICON[s.need[0]] ?? ['soul'], col: KIND_COL.synergy });
  }
  // equipment effects: summed per affix over all worn items
  const aff = new Map<string, { v: number; from: string[] }>();
  for (const it of p.gear) for (const [id, v] of it?.aff ?? []) {
    const a = aff.get(id) ?? { v: 0, from: [] };
    a.v += v; if (!a.from.includes(it!.name)) a.from.push(it!.name);
    aff.set(id, a);
  }
  for (const [id, a] of aff) {
    if (!AFFIX[id]) continue;
    const txt = AFFIX[id](a.v);
    out.push({ id: `aff:${id}`, name: txt, desc: `Equipment: ${txt}. From ${a.from.join(', ')}.`, kind: 'passive', src: 'item', icon: AFF_ICON[id] ?? ['amulet'], col: KIND_COL.item });
  }
  return out;
}
const AFF_ICON: Record<string, Ref> = {
  vamp: ['drop'], dorn: ['thorns'], quell: ['manaorb'], macht: ['book'], gold: ['goldbag'], sicht: ['eye'], brand: ['flame'], gift: ['poison'],
  frost: ['snow'], boss: ['crown'], flink: ['boot'], spalt: ['axe'], stoss: ['arrows'], kette: ['lightning'], weite: ['bow'], asche: ['bomb'],
};

// Everything to show, in drawing order: temporary statuses and buffs, then passives
export function statusList(run: Run): StatusEntry[] {
  const t = statuses(run), b = buffs(run);
  return [...t.filter(e => e.kind === 'bad'), ...b.filter(e => e.kind === 'bad'), ...t.filter(e => e.kind === 'good'), ...b.filter(e => e.kind === 'good'), ...passives(run)];
}

// Passives in a row of at most `max` icons: the rest collapses into one group icon with a count
export function groupPassives(list: StatusEntry[], max: number): StatusEntry[] {
  if (list.length <= max) return list;
  const keep = list.slice(0, Math.max(0, max - 1)), rest = list.slice(keep.length);
  return [...keep, {
    id: 'group', name: `${rest.length} more passives`, desc: rest.map(e => e.name).join(', ') + '.',
    count: rest.length, kind: 'passive', src: 'group', icon: ['book', { n: 'd', w: 'g' }], col: KIND_COL.group, items: rest,
  }];
}
