import { RNG } from '../core/rng';
import type { Meta } from '../core/save';
import { W, H, T, Room, genDungeon, center, walkable, opaque, los, computeFov, distMap } from './dungeon';
import { VS, CRATE_TEMPLATES, mirror, genIce, slide, iceStops, genLights, lightsPress, lightCell, LIGHTS_ALL, dartFires, DartLane } from './puzzles';
import { CLASSES, ClassId, MOBS, PERKS, RELICS, Item, Offer, AFFIX, CONSUMABLES, UNIQUES, ULT, ULT_LEVEL, SKILL_UP, SYNERGIES, NEW_SKILLS, TUNE, treeNodes, treeNode, treePool, nodeText, MAGE_WHET, BOSS_BY_BIOME, BIOME_NAMES, FLOORS_PER_BIOME, LAST_FLOOR, biomeOf, spawnTable, FEATURES, HAZARD, EVENT, HUNTER } from './content';
import { EVENTS, EVENT_BY_ID, NOTES } from './events';
import type { EvState, EvPlan, EvApi, EvDef } from './events';

export interface Actor {
  id: number; kind: string; name: string;
  x: number; y: number; hp: number; maxHp: number; atk: number; def: number;
  st: Record<string, number>; // Statuseffekte -> verbleibende Züge
  xp: number; cd: number; awake: boolean; boss?: boolean; arena?: boolean; elite?: boolean;
  f?: [number, number]; // Blickrichtung
  ev?: boolean;          // gehört zu einem laufenden Ereignis
}

export interface Player extends Actor {
  cls: ClassId; lvl: number; exp: number;
  res: number; resMax: number; potions: number; bombs: number;
  crit: number; pow: number; vamp: number; thorns: number; soulMul: number;
  dir: [number, number]; perks: string[]; relics: string[]; hits: number;
  gold: number; gear: (Item | null)[]; bag: Item[]; keys: number;
  aff: Record<string, number>; // Summe aller Eigenschaften aus Ausrüstung und Gaben
  skillLvl: number[];          // Rang 0..2 je Fähigkeit
  ultCd: number; picks: number;
  skillMod: number[];          // Ausprägung bei Rang III: 0 keine, 1 = A, 2 = B
  syn: string[];               // aktive Synergien
  sort: number;                // Ordnung im Rucksack
  tree: string[];              // gelernte Knoten des Fertigkeitsbaums
  pts: number;                 // offene Fertigkeitspunkte
  rest: number;                // Punkte, die mangels Knoten zu Gaben wurden
  resAcc?: number;             // angesammelte Bruchteile aus fokusOnHit
  spells?: string[];           // neue Zauber aus dem Baum, Plätze 4–6
  shield?: number;             // Arkanschild: verbleibender Schutz
  ptsGot?: number;             // bisher erhaltene Fertigkeitspunkte (Grenze TUNE.treePtsMax)
}

export type PuzzleKind = 'crates' | 'runes' | 'ice' | 'arena' | 'braziers' | 'darts';
export interface Puzzle {
  kind: PuzzleKind;
  started: boolean; timer: number; // Arena
  x: number; y: number; // linke obere Ecke der 7x7 Innenfelder
  solved: boolean; dead: boolean; entered: boolean;
  layout: number[];               // Kisten: Ausgangszustand für den Hebel
  order: number[]; runes: Record<number, number>; pressed: number[]; fails: number;
  read?: boolean;                 // Runen: Tafel gelesen – die Reihenfolge steht dann im HUD
  gems?: number[]; gemsMax?: number; // Eis: Feldindizes der noch liegenden Kristalle
  lights?: number;                // Glutschalen: Bitmaske der brennenden Schalen
  lanes?: DartLane[];             // Pfeilgang: Schussreihen
}

export const VAULT_NAMES: Record<PuzzleKind, string> = {
  crates: 'Kistenkammer', runes: 'Runenkammer', ice: 'Eishalle', arena: 'Prüfungskammer', braziers: 'Glutschalenkammer', darts: 'Pfeilgang',
};

export type Fx =
  | { k: 'num'; x: number; y: number; s: string; col: string }
  | { k: 'shake'; n: number }
  | { k: 'lunge'; id: number; dx: number; dy: number }
  | { k: 'flash'; id: number }
  | { k: 'die'; x: number; y: number; kind: string }
  | { k: 'boom'; x: number; y: number; r: number; barrel?: boolean }
  | { k: 'debris'; x: number; y: number }
  | { k: 'loot'; item: Item; how: 'worn' | 'bag' | 'sold' }
  | { k: 'bolt'; x0: number; y0: number; x1: number; y1: number; col: string }
  // Rein visuelle Fähigkeitseffekte (werden von der Logik nie gelesen)
  | { k: 'fireball'; x0: number; y0: number; x1: number; y1: number; r: number }
  | { k: 'nova'; x: number; y: number; r: number }
  | { k: 'bash'; x: number; y: number; dx: number; dy: number }
  | { k: 'arrow'; x0: number; y0: number; x1: number; y1: number; col: string; heavy: boolean }
  | { k: 'swipe'; x: number; y: number; dx: number; dy: number; big: boolean }
  | { k: 'pdeath'; x: number; y: number }
  | { k: 'banner'; title: string; sub: string; col: string };

// Versteckte Bodenfalle. seen: der Held hat sie entdeckt (oder sie wurde ausgelöst) – dann ist sie sichtbar.
export type HazardKind = 'stachel' | 'pfeil' | 'gas' | 'glut';
export interface Hazard { x: number; y: number; kind: HazardKind; seen: boolean; }
export const HAZARD_NAMES: Record<HazardKind, string> = { stachel: 'Stachelfalle', pfeil: 'Pfeilfalle', gas: 'Gasfalle', glut: 'Glutfalle' };

export interface Run {
  seed: number; rng: RNG; floor: number;
  tiles: Uint8Array; seen: Uint8Array; vis: Uint8Array;
  p: Player; mobs: Actor[]; traps: { x: number; y: number }[];
  hazards: Hazard[];           // versteckte Bodenfallen der Ebene (nicht die Fallen des Waldläufers)
  tele?: Record<string, number>; // Zähler für die Balance-Messung (nur von neuen Systemen gesetzt)
  fire: Map<number, number>;   // Feld -> verbleibende Züge
  fuses: Map<number, number>;  // Fass -> Züge bis zur Explosion
  cracks: Map<number, number>; // rissige Wand -> erhaltene Schläge
  puzzle: Puzzle | null; willUsed: boolean;
  shop: Offer[]; target: number; daily: boolean;
  log: string[]; fx: Fx[];
  mode: 'play' | 'perk' | 'tree' | 'shop' | 'dead' | 'win';
  perkChoices: string[];
  pool: string[];  // Knoten, die in diesem Lauf lernbar sind (Lager)
  perkQ: number;   // noch ausstehende Wahl einer Gabe
  runeUsed?: boolean; // Schutzrune auf dieser Ebene verbraucht
  invFocus?: { col: 0 | 1; row: number }; // Rucksack: Auswahl folgt dem zuletzt bewegten Stück
  invNote?: string;                       // Rucksack: Ergebnis der letzten Handlung
  // Zufällige Ereignisse (nur gesetzt, wenn eingeschaltet)
  ev?: EvState | null;       // laufendes Ereignis
  evQ?: EvPlan[];            // für diese Ebene geplant
  evUsed?: string[];         // Deck: in diesem Lauf schon gezogen
  evCalm?: number;           // Züge ohne sichtbaren wachen Gegner
  evDanger?: boolean;        // zuletzt gezogenes Ereignis war gefährlich
  evRooms?: Room[];          // Räume der Ebene (für Raumereignisse)
  evNote?: number;           // Ebene des letzten Fundzettels
  relicOps?: number;         // zusätzliche Reliquienwahlen aus Ereignissen
  warn?: number[];           // Felder, die im nächsten Zug getroffen werden
  // Jäger (nur gesetzt, wenn eingeschaltet)
  floorTurns?: number;       // Züge auf dieser Ebene
  hunt?: { next: number; n: number } | null; // nächster Jäger bei floorTurns = next; n schon erschienen
  entry?: [number, number];  // Eingang der Ebene
  mud?: number[];            // Schlamm eines Ereignisses: wer hineintritt, steckt einen Zug fest
  souls: number; kills: number; turn: number; nextId: number;
}

export type Action =
  | { t: 'move'; dx: number; dy: number }
  | { t: 'wait' } | { t: 'shoot' } | { t: 'potion' } | { t: 'descend' } | { t: 'bomb' } | { t: 'ult' } | { t: 'use'; id: string } | { t: 'drop'; i: number } | { t: 'sort' }
  | { t: 'skill'; i: number } | { t: 'perk'; i: number }
  | { t: 'tree' } | { t: 'learn'; id: string } | { t: 'later' }
  | { t: 'buy'; i: number } | { t: 'leave' } | { t: 'target'; x: number; y: number }
  | { t: 'equip'; i: number } | { t: 'unequip'; slot: number } | { t: 'sell'; i: number };

const FOV_R = 8;
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const xpNeed = (lvl: number) => 10 + lvl * 9;
export const playerAtk = (p: Player) => p.atk + (p.st.stark ? 3 : 0);

function say(run: Run, s: string) { run.log.push(s); if (run.log.length > 40) run.log.shift(); }
const mobAt = (run: Run, x: number, y: number) => run.mobs.find(m => m.x === x && m.y === y);
const isFree = (run: Run, x: number, y: number) =>
  x >= 0 && y >= 0 && x < W && y < H && walkable(run.tiles[y * W + x]) && !mobAt(run, x, y) && !(run.p.x === x && run.p.y === y);

export function newRun(seed: number, cls: ClassId, meta: Meta): Run {
  const c = CLASSES[cls];
  const u = (id: string) => meta.upg[id] ?? 0;
  const hp = c.hp + 2 * u('vit');
  const p: Player = {
    id: 0, kind: cls, name: c.name, // Schleifstein gibt dem Magier Zauberkraft statt Angriff: sein kleiner Grundangriff würde sonst um zwei Drittel wachsen
    x: 0, y: 0, hp, maxHp: hp, atk: c.atk + (cls === 'magier' ? 0 : u('atk')), def: c.def,
    st: {}, xp: 0, cd: 0, awake: true,
    cls, lvl: 1, exp: 0, res: c.resStart, resMax: c.resMax + u('fokus'), potions: 1 + u('trank'), bombs: 1 + u('bombe'),
    crit: 0.05, pow: 1 + (cls === 'magier' ? MAGE_WHET * u('atk') : 0), vamp: 0, thorns: 0, soulMul: 1, dir: [1, 0], perks: [], relics: [], hits: 0, gold: 15 * u('gold'), gear: [null, null, null, null], bag: [], keys: 0,
    aff: { fund: 3 * u('fund') }, skillLvl: [0, 0, 0], ultCd: 0, picks: 3 + u('wahl'), skillMod: [0, 0, 0], syn: [], sort: 0, tree: [], pts: 0, rest: 0, ptsGot: 0,
  };
  const run: Run = {
    seed, rng: new RNG(seed), floor: 0,
    tiles: new Uint8Array(W * H), seen: new Uint8Array(W * H), vis: new Uint8Array(W * H),
    p, mobs: [], traps: [], hazards: [], fire: new Map(), fuses: new Map(), cracks: new Map(), puzzle: null, willUsed: false, shop: [], target: 0, daily: false, log: [], fx: [], mode: 'play', perkChoices: [], pool: treePool(cls, meta), perkQ: 0,
    souls: 0, kills: 0, turn: 0, nextId: 1,
  };
  if (u('erbe')) applyPerk(run, run.rng.pick(Object.keys(RELICS)));
  nextFloor(run);
  return run;
}

function spawnMob(run: Run, kind: string, x: number, y: number): Actor {
  const d = MOBS[kind];
  // Bosse wachsen mit der Tiefe mit, normale Gegner etwas langsamer als früher
  const s = 1 + 0.30 * (run.floor - 1);
  const hp = d.boss ? Math.round(d.hp * (1.2 + 0.12 * run.floor)) : Math.round(d.hp * s);
  const m: Actor = {
    id: run.nextId++, kind, name: d.name, x, y, hp, maxHp: hp,
    atk: d.atk + Math.round(run.floor * 0.8), def: d.def,
    st: {}, xp: d.xp, cd: 0, awake: false, boss: d.boss,
  };
  run.mobs.push(m);
  return m;
}

function freeInRoom(run: Run, r: Room): [number, number] | null {
  for (let i = 0; i < 30; i++) {
    const x = run.rng.int(r.x, r.x + r.w - 1), y = run.rng.int(r.y, r.y + r.h - 1);
    if (run.tiles[y * W + x] === T.FLOOR && isFree(run, x, y)) return [x, y];
  }
  return null;
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- Ausrüstung, Gold und Händler ----------

export const BAG_MAX = 12;
const WEAPONS: Record<ClassId, string[][]> = {
  krieger: [['Eisenklinge', 'Stahlklinge', 'Runenklinge', 'Glutklinge'], ['Handaxt', 'Streitaxt', 'Runenaxt', 'Glutaxt'], ['Jagdspeer', 'Stahlspeer', 'Runenspeer', 'Glutspeer']],
  magier: [['Glimmstab', 'Feuerstab', 'Flammenstab', 'Sonnenstab'], ['Reifstab', 'Froststab', 'Eisstab', 'Gletscherstab'], ['Funkenstab', 'Blitzstab', 'Sturmstab', 'Donnerstab']],
  waldlaeufer: [['Eschenbogen', 'Langbogen', 'Runenbogen', 'Glutbogen'], ['Handarmbrust', 'Armbrust', 'Runenarmbrust', 'Glutarmbrust'], ['Wurfmesser', 'Stahlmesser', 'Runenmesser', 'Glutmesser']],
};
const ARMOR_NAMES = ['Lederrüstung', 'Kettenhemd', 'Runenpanzer', 'Glutpanzer'];
const AMULET_NAMES = ['Kupferamulett', 'Silberamulett', 'Runenamulett', 'Glutamulett'];
const RING_NAMES = ['Kupferring', 'Silberring', 'Runenring', 'Glutring'];
// Zufällige Eigenschaften und ihre Stärke je Seltenheit
const ROLL_AFF: [string, (r: number) => number][] = [
  ['vamp', r => 1 + (r >> 1)], ['dorn', r => 1 + r], ['quell', r => 2 + r], ['macht', r => 8 + 4 * r], ['gold', r => 15 + 10 * r],
  ['sicht', () => 1], ['brand', r => 15 + 5 * r], ['gift', r => 15 + 5 * r], ['boss', r => 15 + 10 * r], ['flink', r => 4 + 2 * r],
];

export function genItem(run: Run, cursed = false, bump = 0): Item {
  const rng = run.rng, cls = run.p.cls, slot = [0, 0, 0, 1, 1, 1, 2, 2, 3, 3][rng.int(0, 9)];
  // Bonus aus Ebene und Schatzsucher hebt vor allem Selten und Episch; Legendär bleibt rar
  const r = rng.next(), b = run.floor * 0.006 + (run.p.aff.fund ?? 0) / 100;
  let rar = r < 0.55 - b ? 0 : r < 0.85 - 0.6 * b ? 1 : r < 0.985 - 0.2 * b ? 2 : 3;
  if (cursed) rar = Math.min(3, rar + 1);
  if (bump) rar = Math.min(3, rar + bump);
  const kind = rng.int(0, 2);
  if (rar === 3 && rng.chance(0.5)) {
    const u = rng.pick(UNIQUES.filter(q => q.slot === slot && (!q.cls || q.cls === cls)));
    return { slot, name: u.name, rar: 3, atk: u.atk ?? 0, def: u.def ?? 0, hp: (u.hp ?? 0) - (cursed ? 6 : 0), crit: u.crit ?? 0, cursed, wk: u.wk, aff: u.aff.map(a => [a[0], a[1]] as [string, number]), uniq: true };
  }
  const aff: [string, number][] = [];
  const it: Item = { slot, name: slot === 0 ? WEAPONS[cls][kind][rar] : [ARMOR_NAMES, AMULET_NAMES, RING_NAMES][slot - 1][rar], rar, atk: 0, def: 0, hp: 0, crit: 0, cursed };
  if (slot === 0) {
    it.atk = 1 + rar;
    it.wk = kind;
    // Jede Waffenart hat eine eigene Wirkung
    if (cls === 'krieger') { if (kind === 0) it.crit = 0.05; else aff.push(kind === 1 ? ['spalt', 40 + 10 * rar] : ['stoss', 50 + 10 * rar]); }
    else if (cls === 'magier') aff.push(kind === 0 ? ['brand', 25 + 10 * rar] : kind === 1 ? ['frost', 12 + 4 * rar] : ['kette', 40 + 10 * rar]);
    else if (kind === 2) it.crit = 0.08 + 0.04 * rar; else aff.push(kind === 0 ? ['weite', rar >= 2 ? 2 : 1] : ['stoss', 50 + 10 * rar]);
  } else if (slot === 1) { it.def = 1 + (rar >= 2 ? 1 : 0); it.hp = rar * 3; }
  else if (slot === 2) { it.crit = 0.04 * (rar + 1); it.hp = 2 * rar; }
  if (cursed) it.hp -= 6;
  const n = slot === 3 ? 1 + (rar >= 2 ? 1 : 0) : rar === 3 ? 2 : rar === 2 ? 1 : rar === 1 && rng.chance(0.5) ? 1 : 0;
  if (n) {
    const pool = rng.shuffle(ROLL_AFF.filter(([id]) => !aff.some(a => a[0] === id)));
    for (let k = 0; k < n; k++) aff.push([pool[k][0], pool[k][1](rar)]);
  }
  if (aff.length) it.aff = aff;
  return it;
}

export function genConsumable(run: Run): Item {
  const use = run.rng.pick(Object.keys(CONSUMABLES));
  return { slot: 4, name: CONSUMABLES[use].name, rar: 0, atk: 0, def: 0, hp: 0, crit: 0, use };
}

export const itemScore = (it: Item) => it.atk * 3 + it.def * 3 + it.hp * 0.5 + it.crit * 40 + (it.aff?.length ?? 0) * 3;
// Jede Wirkung eines Gegenstands als eigene Zeile
export const itemLines = (it: Item): string[] => it.use ? [CONSUMABLES[it.use].desc] : [
  it.atk ? `+${it.atk} Angriff` : '', it.def ? `+${it.def} Vert.` : '', it.hp ? `${it.hp > 0 ? '+' : ''}${it.hp} Leben` : '', it.crit ? `+${Math.round(it.crit * 100)} % Krit` : '',
  ...(it.aff ?? []).map(([id, v]) => AFFIX[id](v)),
].filter(Boolean);
export const itemText = (it: Item) => itemLines(it).join(', ');

function addAff(p: Player, id: string, v: number) {
  p.aff[id] = (p.aff[id] ?? 0) + v;
  if (id === 'vamp') p.vamp += v;
  else if (id === 'dorn') p.thorns += v;
  else if (id === 'quell') { p.resMax += v; p.res = Math.min(p.res, p.resMax); }
  else if (id === 'macht') p.pow += v / 100;
}

// Leben bleibt anteilig erhalten (20/40 → +10 → 25/50 → zurück 20/40). Abgerundet in beide Richtungen,
// damit wiederholtes An- und Ablegen nie heilt.
function wear(p: Player, it: Item, sign: 1 | -1) {
  p.atk += sign * it.atk; p.def += sign * it.def; p.crit += sign * it.crit;
  const max0 = p.maxHp;
  p.maxHp = Math.max(5, p.maxHp + sign * it.hp);
  if (p.maxHp !== max0 && p.hp > 0) p.hp = Math.max(1, Math.floor((p.hp * p.maxHp) / max0));
  p.hp = Math.min(p.hp, p.maxHp);
  for (const [id, v] of it.aff ?? []) addAff(p, id, sign * v);
}

// Verkaufswert: 60 % des früheren Werts, damit sich kein Goldberg ansammelt
export const itemValue = (it: Item) => Math.max(1, Math.round(0.6 * (it.use ? 6 : 5 * (it.rar + 1) * (it.cursed ? 0 : 1) + (it.cursed ? 2 : 0) + (it.aff?.length ?? 0) * 3)));
// Ordnung im Rucksack: nach Platz, nach Seltenheit oder danach, wie viel besser als das Angelegte
export const SORT_NAMES = ['Platz', 'Seltenheit', 'Verbesserung'];
function sortBag(p: Player) {
  const gain = (it: Item) => it.use ? -99 : itemScore(it) - (p.gear[it.slot] ? itemScore(p.gear[it.slot]!) : 0);
  p.bag.sort((a, b) => p.sort === 1 ? b.rar - a.rar || a.slot - b.slot || itemScore(b) - itemScore(a)
    : p.sort === 2 ? gain(b) - gain(a) || a.slot - b.slot
    : a.slot - b.slot || itemScore(b) - itemScore(a));
}

// Neue Ausrüstung: freier Platz wird sofort belegt, sonst wandert sie in den Rucksack.
// Ist der Rucksack voll, wird das schwächste Stück verkauft.
function takeItem(run: Run, it: Item, from: string) {
  const p = run.p;
  let how: 'worn' | 'bag' | 'sold' = 'bag';
  if (it.slot < 4 && !p.gear[it.slot]) {
    wear(p, it, 1);
    p.gear[it.slot] = it;
    if (it.cursed) it.lock = run.floor;
    how = 'worn';
    say(run, `${from}: ${it.name} angelegt.`);
  } else {
    it.neu = true;
    p.bag.push(it);
    say(run, `${from}: ${it.name} – im Rucksack [I].`);
    if (p.bag.length > BAG_MAX) {
      const keep = (o: Item) => o.use ? 50 : itemScore(o) + o.rar;
      const worst = p.bag.reduce((a, b) => keep(b) < keep(a) ? b : a);
      p.bag.splice(p.bag.indexOf(worst), 1);
      p.gold += itemValue(worst);
      if (worst === it) how = 'sold';
      say(run, `Rucksack voll: ${worst.name} für ${itemValue(worst)} Gold verkauft.`);
    }
    sortBag(p);
  }
  run.fx.push({ k: 'loot', item: it, how });
}

// Verbrauchsgegenstand aus dem Rucksack benutzen; kostet einen Zug
function useItem(run: Run, i: number): boolean {
  const p = run.p, it = p.bag[i];
  switch (it.use) {
    case 'karte':
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        let open = false;
        for (let oy = -1; oy <= 1 && !open; oy++) for (let ox = -1; ox <= 1; ox++) if (run.tiles[(y + oy) * W + x + ox] !== T.WALL) { open = true; break; }
        if (open) run.seen[y * W + x] = 1;
      }
      say(run, 'Die Karte zeigt dir die ganze Ebene.');
      break;
    case 'sprung': {
      const spots: number[] = [];
      for (let k = 0; k < W * H; k++) {
        const q = { x: k % W, y: (k / W) | 0 };
        if (!run.seen[k] || (run.tiles[k] !== T.FLOOR && run.tiles[k] !== T.BURNT) || !isFree(run, q.x, q.y) || cheb(q, p) < 6) continue;
        if (run.mobs.every(m => cheb(m, q) >= 6)) spots.push(k);
      }
      if (!spots.length) { say(run, 'Du kennst keinen sicheren Ort.'); return false; }
      const k = run.rng.pick(spots);
      p.x = k % W; p.y = (k / W) | 0;
      say(run, 'Die Rolle trägt dich fort.');
      break;
    }
    case 'kraft': p.st.stark = 10; say(run, 'Kraft durchströmt dich.'); break;
    case 'quell': gain(p, 6); say(run, 'Deine Kräfte sind erneuert.'); break;
    default: return false;
  }
  p.bag.splice(i, 1);
  return true;
}

// Ein verfluchtes Stück lässt sich erst auf der nächsten Ebene wieder ablegen
function cursedHold(run: Run, it: Item | null): boolean {
  if (!it?.cursed || it.lock !== run.floor) return false;
  say(run, `Der Fluch hält ${it.name} fest – erst auf der nächsten Ebene löst er sich.`);
  return true;
}

// Rucksack: kostet keinen Zug. Anlegen tauscht atomar (das alte Stück nimmt den Platz des neuen im
// Rucksack ein, braucht also keinen freien Platz); Ablegen braucht einen freien Platz, sonst bleibt alles,
// wie es ist. run.invFocus sagt der Anzeige, wo das betroffene Stück nach dem Sortieren liegt,
// run.invNote, was geschehen ist (das Protokoll ist hinter dem Rucksack nicht zu sehen).
function invNote(run: Run, s: string) { run.invNote = s; say(run, s); }
function manage(run: Run, a: Action): boolean {
  const p = run.p;
  if (a.t === 'equip') {
    const it = p.bag[a.i];
    if (!it) return true;
    if (it.use || it.slot >= 4) { invNote(run, `${it.name} lässt sich nicht anlegen.`); return true; }
    const cur = p.gear[it.slot];
    if (cursedHold(run, cur)) { run.invNote = run.log[run.log.length - 1]; return true; }
    if (cur) { wear(p, cur, -1); p.bag[a.i] = cur; } else p.bag.splice(a.i, 1);
    wear(p, it, 1);
    p.gear[it.slot] = it;
    if (it.cursed) it.lock = run.floor;
    delete it.neu;
    sortBag(p);
    run.invFocus = { col: 0, row: it.slot };
    invNote(run, cur ? `${it.name} angelegt, ${cur.name} im Rucksack.` : `${it.name} angelegt.`);
    return true;
  }
  if (a.t === 'unequip') {
    const cur = p.gear[a.slot];
    if (!cur) return true;
    if (cursedHold(run, cur)) { run.invNote = run.log[run.log.length - 1]; return true; }
    if (p.bag.length >= BAG_MAX) { invNote(run, 'Kein Platz im Rucksack.'); return true; }
    wear(p, cur, -1);
    p.gear[a.slot] = null;
    p.bag.push(cur);
    sortBag(p);
    run.invFocus = { col: 1, row: p.bag.indexOf(cur) };
    invNote(run, `${cur.name} abgelegt.`);
    return true;
  }
  if (a.t === 'sell') {
    const it = p.bag[a.i];
    if (!it) return true;
    p.bag.splice(a.i, 1);
    p.gold += itemValue(it);
    invNote(run, `${it.name} für ${itemValue(it)} Gold verkauft.`);
    return true;
  }
  if (a.t === 'drop') {
    const it = p.bag[a.i];
    if (!it) return true;
    p.bag.splice(a.i, 1);
    invNote(run, `${it.name} weggeworfen.`);
    return true;
  }
  if (a.t === 'sort') { p.sort = (p.sort + 1) % 3; sortBag(p); return true; }
  return false;
}

// Ware des Händlers: zwei Stücke Ausrüstung und ein Verbrauchsgegenstand
function wares(run: Run): Offer[] {
  const f = run.floor, offers: Offer[] = [];
  for (let k = 0; k < 2; k++) {
    const it = genItem(run);
    offers.push({ kind: 'item', name: it.name, desc: itemText(it), price: Math.round((18 + it.rar * 22 + f * 2) * (it.rar ? 1.2 : 1)), sold: false, item: it });
  }
  const c = genConsumable(run);
  offers.push({ kind: 'item', name: c.name, desc: itemText(c), price: 14 + f, sold: false, item: c });
  return offers;
}

function stock(run: Run): Offer[] {
  const f = run.floor;
  return [
    { kind: 'potion', name: 'Heiltrank', desc: 'Heilt einen großen Teil deines Lebens', price: 20 + 4 * f, sold: false, left: 3 },
    { kind: 'bomb', name: 'Bombe', desc: 'Sprengt Gegner, Wände und Säulen', price: 10 + f, sold: false, left: 2 },
    ...wares(run),
    { kind: 'forge', name: 'Schmied', desc: `Waffe +1 Angriff, sonst Rüstung +1 Vert. (bis +${FORGE_MAX} je Stück)`, price: 30 + 4 * f, sold: false, left: 2 },
    { kind: 'reroll', name: 'Neue Ware', desc: 'Der Händler tauscht seine Ausrüstung aus', price: 12 + 2 * f, sold: false, left: 2 },
  ];
}

// Schmied: angelegte Waffe, sonst Rüstung; jedes Stück höchstens FORGE_MAX-mal
export const FORGE_MAX = 2;
const SHOP_ORDER: Offer['kind'][] = ['potion', 'bomb', 'item', 'forge', 'reroll'];
export function forgeTarget(p: Player): Item | null {
  for (const it of [p.gear[0], p.gear[1]]) if (it && (it.plus ?? 0) < FORGE_MAX) return it;
  return null;
}

// ---------- Rätselkammern ----------

export const MAX_TRAPS = 3;
// Werkzeuggürtel (Waldläufer): 5 Fallen
export const maxTraps = (p: Player) => (p.cls === 'waldlaeufer' && hasNode(p, 'n1_2b') ? 5 : MAX_TRAPS);
export const RUNE_NAMES = ['Sonne', 'Mond', 'Stern', 'Auge'];
const has = (p: Player, id: string) => p.relics.includes(id);
export const hasNode = (p: Player, id: string) => p.tree.includes(id);
export const spellAt = (p: Player, i: number) => (i >= 3 ? p.spells?.[i - 3] : undefined);
const baseCost = (p: Player, i: number) => (i < 3 ? CLASSES[p.cls].skills[i].cost : (NEW_SKILLS[spellAt(p, i)!]?.cost ?? 99) + (p.cls === 'krieger' ? TUNE.kCost : 0));
export const skillCost = (p: Player, i: number) => (p.cls === 'waldlaeufer' && i === 1 && hasNode(p, 'n1_5')) ? 0 : Math.max(1, baseCost(p, i) - (has(p, 'echo') ? 1 : 0) - (p.cls === 'krieger' && i === 0 && p.skillMod[0] === 1 ? 1 : 0) - (p.aff.erz ? 1 : 0) - (p.st.nachhall && !(p.cls === 'magier' && i === 2) ? 2 : 0));
// Fähigkeit jetzt einsetzbar (Ressource, Abklingzeit des Zeitrisses)
export const skillReady = (p: Player, i: number) => (i < 3 || !!spellAt(p, i)) && canPay(p, skillCost(p, i)) && !(p.cls === 'magier' && i === 2 && p.st.riss);
// Blutzorn (Krieger): fehlende Wut wird mit Leben bezahlt, 2 je Wut; man stirbt nicht daran
const blutzorn = (p: Player) => p.cls === 'krieger' && hasNode(p, 'n2_5');
export const canPay = (p: Player, cost: number) => p.res >= cost || (blutzorn(p) && p.hp - 2 * (cost - p.res) >= 1);
function payRes(run: Run, cost: number) {
  const p = run.p;
  if (p.res >= cost) { p.res -= cost; return; }
  const n = 2 * (cost - p.res);
  p.hp -= n; p.res = 0;
  run.fx.push({ k: 'num', x: p.x, y: p.y, s: `-${n}`, col: '#b13e53' });
}
export const shotRange = (p: Player) => CLASSES[p.cls].range + (p.aff.weite ?? 0) + (p.cls === 'waldlaeufer' && hasNode(p, 'n0_5') ? 2 : 0);
// Waldläufer: Bonus des nächsten Schusses aus Anlegen und Schattenschritt; danach verbraucht
let shotUsed = false;
function shotBonus(p: Player): number {
  if (p.cls !== 'waldlaeufer') return 1;
  shotUsed = true;
  const b = (1 + 0.25 * (p.st.aim ?? 0)) * (p.st.schatten ? 1.5 : 1);
  delete p.st.aim; delete p.st.schatten;
  return b;
}
// Nach einer Aktion des Waldläufers: Anlegen zählt Züge ohne Schritt, Rückzugsgefecht schießt beim Lösen
function afterWl(run: Run, a: Action, px: number, py: number, adj0: Actor[]) {
  const p = run.p;
  if (hasNode(p, 'n0_5')) {
    if (p.x !== px || p.y !== py) delete p.st.aim;
    else if (!shotUsed) p.st.aim = Math.min(4, (p.st.aim ?? 0) + 1);
  }
  if (a.t === 'move' && hasNode(p, 'n2_5') && run.mode === 'play' && (p.x !== px || p.y !== py) && adj0.some(m => m.hp > 0 && cheb(m, p) >= 2)) {
    const t = nearestMob(run, shotRange(p));
    if (t) { run.fx.push({ k: 'arrow', x0: p.x, y0: p.y, x1: t.x, y1: t.y, col: '#a7f070', heavy: false }); playerHit(run, t, playerAtk(p) * 0.7); }
  }
}
// Rauchbombe: der Spieler steht im Rauch
const inSmoke = (p: Player) => !!p.st.rauch && cheb(p, { x: p.st.rx, y: p.st.ry }) <= 2;
export const RANKS = ['I', 'II', 'III'];
// Name und Beschreibung einer Wahl beim Stufenaufstieg: Gabe, Reliquie oder Fähigkeitsrang
export function perkInfo(p: Player, id: string): { name: string; desc: string; kind: 'perk' | 'relic' | 'skill'; syn?: string } {
  if (RELICS[id]) return { ...RELICS[id], kind: 'relic' };
  if (id.startsWith('skill')) {
    const i = +id[5], sk = CLASSES[p.cls].skills[i], up = SKILL_UP[`${p.cls}${i}`], m = id[6];
    if (!m) return { name: `${sk.name} II`, desc: up.r2, kind: 'skill' };
    const [n, d] = m === 'a' ? up.a : up.b;
    return { name: `${sk.name} III: ${n}`, desc: d, kind: 'skill' };
  }
  const s = SYNERGIES.find(q => !p.syn.includes(q.id) && q.need.includes(id) && p.perks.includes(q.need[0] === id ? q.need[1] : q.need[0]));
  return { ...PERKS[id], kind: 'perk', syn: s?.name };
}
// Name der gewählten Ausprägung einer Fähigkeit, sonst leer
export const skillModName = (p: Player, i: number) => { const m = p.skillMod[i], up = SKILL_UP[`${p.cls}${i}`]; return m === 1 ? up.a[0] : m === 2 ? up.b[0] : ''; };
const fovR = (run: Run) => FOV_R + (has(run.p, 'geisterlicht') ? 3 : 0) + (run.p.aff.sicht ?? 0) - (run.ev?.data.fog ? 3 : 0);

// Sucht 9x9 massiven Fels, höhlt 7x7 aus und gräbt von der Tür (unten Mitte) einen Gang zum Rest der Ebene.
function addVault(run: Run, rooms: Room[]): boolean {
  const t = run.tiles, rng = run.rng;
  for (let n = 0; n < 150; n++) {
    const x0 = rng.int(1, W - 10), y0 = rng.int(1, H - 11);
    let solid = true;
    for (let y = y0; y < y0 + 9 && solid; y++) for (let x = x0; x < x0 + 9; x++) if (t[y * W + x] !== T.WALL) { solid = false; break; }
    if (!solid) continue;
    const dx = x0 + 4, dy = y0 + 8, start = (dy + 1) * W + dx;
    const inRing = (x: number, y: number) => x >= x0 && x < x0 + 9 && y >= y0 && y < y0 + 9;
    const from = new Map<number, number>([[start, -1]]);
    let end = -1;
    if (walkable(t[start])) from.clear();
    else if (t[start] !== T.WALL) continue;
    else {
      const q = [start];
      for (let h = 0; h < q.length && end < 0; h++) {
        const c = q[h], cx = c % W, cy = (c / W) | 0;
        for (const [ox, oy] of DIRS4) {
          const nx = cx + ox, ny = cy + oy, ni = ny * W + nx;
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || inRing(nx, ny) || from.has(ni)) continue;
          if (walkable(t[ni])) { end = c; break; }
          if (t[ni] !== T.WALL) continue;
          from.set(ni, c);
          q.push(ni);
        }
      }
      if (end < 0) continue;
      for (let c = end; c !== -1; c = from.get(c)!) t[c] = T.FLOOR;
    }
    t[dy * W + dx] = T.FLOOR;
    const ix = x0 + 1, iy = y0 + 1;
    const pz: Puzzle = { kind: rng.pick(['crates', 'runes', 'ice', 'arena', 'braziers', 'darts'] as const), started: false, timer: 0, x: ix, y: iy, solved: false, dead: false, entered: false, layout: [], order: [], runes: {}, pressed: [], fails: 0 };
    const put = (x: number, y: number, tile: number) => { t[(iy + y) * W + ix + x] = tile; };
    if (pz.kind === 'crates') {
      let tpl = rng.pick(CRATE_TEMPLATES);
      if (rng.chance(0.5)) tpl = mirror(tpl);
      const map: Record<string, number> = { '.': T.FLOOR, '#': T.WALL, c: T.CRATE, p: T.PLATE, L: T.LEVER };
      for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) { put(x, y, map[tpl[y][x]]); pz.layout.push(map[tpl[y][x]]); }
    } else if (pz.kind === 'ice') {
      const grid = genIce(rng);
      for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) put(x, y, grid[y][x] === '#' ? T.WALL : grid[y][x] === 'g' ? T.GOAL : T.ICE);
      // Eiskristalle auf Haltefeldern abseits des kürzesten Wegs
      const stops = iceStops(grid);
      const n = Math.min(stops.length, rng.int(1, 2));
      pz.gems = rng.shuffle(stops).slice(0, n).map(c => (iy + ((c / 8) | 0)) * W + ix + (c % 8));
      pz.gemsMax = pz.gems.length;
    } else if (pz.kind === 'arena') {
      for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) put(x, y, T.FLOOR);
      put(3, 3, T.GOAL);
    } else if (pz.kind === 'braziers') {
      for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) put(x, y, T.FLOOR);
      pz.lights = genLights(rng);
      for (let k = 0; k < 9; k++) { const [lx, ly] = lightCell(k); put(lx, ly, pz.lights & (1 << k) ? T.BRAZIER_ON : T.BRAZIER); }
    } else if (pz.kind === 'darts') {
      for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) put(x, y, T.FLOOR);
      pz.lanes = [1, 3, 5].map(y => {
        const side = rng.int(0, 1) as 0 | 1, period = rng.int(2, 3);
        put(side ? VS - 1 : 0, y, T.STATUE);
        return { y, side, period, off: rng.int(0, period - 1) };
      });
      put(3, 0, T.GOAL);
    } else {
      for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) put(x, y, T.FLOOR);
      const kinds = rng.shuffle([0, 1, 2, 3]);
      [[1, 1], [5, 1], [1, 4], [5, 4]].forEach(([x, y], k) => { put(x, y, T.RUNE); pz.runes[(iy + y) * W + ix + x] = kinds[k]; });
      pz.order = rng.shuffle([0, 1, 2, 3]);
      // Die Tafel mit der Reihenfolge steht in einem anderen Raum
      let placed = false;
      for (const r of rng.shuffle(rooms.slice(1))) {
        if (placeIn(run, r, T.TABLET)) { placed = true; break; }
      }
      if (!placed) put(3, 0, T.TABLET);
    }
    run.puzzle = pz;
    return true;
  }
  return false;
}

export function inVault(run: Run, x: number, y: number): boolean {
  const z = run.puzzle;
  return !!z && x >= z.x && x < z.x + VS && y >= z.y && y < z.y + VS;
}

function solve(run: Run) {
  const z = run.puzzle!, p = run.p;
  z.solved = true;
  say(run, 'Das Rätsel ist gelöst!');
  run.souls += Math.round(15 * p.soulMul);
  run.fx.push({ k: 'shake', n: 3 });
  const pool = run.rng.shuffle(Object.keys(RELICS).filter(id => !has(p, id)));
  if (!pool.length) { p.potions += 2; return; }
  run.perkChoices = pool.slice(0, 2);
  run.mode = 'perk';
}

// Wird nach jedem Schritt des Spielers aufgerufen.
function afterStep(run: Run) {
  const z = run.puzzle, p = run.p;
  if (!z) return;
  const i = p.y * W + p.x, t = run.tiles[i];
  if (!z.entered && inVault(run, p.x, p.y)) {
    z.entered = true;
    say(run, z.kind === 'crates' ? 'Rätsel: Schiebe jede Kiste auf eine Platte. Der Hebel setzt zurück.'
      : z.kind === 'ice' ? 'Rätsel: Auf dem Eis rutschst du bis zum nächsten Hindernis. Erreiche die leuchtende Platte – Kristalle unterwegs bringen Gold.'
      : z.kind === 'arena' ? 'Prüfung: Betritt die Platte in der Mitte – und besiege alle in kurzer Zeit.'
      : z.kind === 'braziers' ? 'Rätsel: Entzünde alle neun Glutschalen. Jeder Tritt schaltet die Schale und ihre Nachbarn um.'
      : z.kind === 'darts' ? 'Rätsel: Erreiche die Platte oben. Rot leuchtende Reihen schießen im nächsten Zug.'
      : z.read ? 'Rätsel: Betritt die Runen in der Reihenfolge der Tafel – sie steht oben.'
      : 'Rätsel: Betritt die Runen in der richtigen Reihenfolge. Eine Tafel in einem anderen Raum kennt sie.');
  }
  if (z.solved || z.dead) return;
  if (t === T.GOAL && z.kind === 'arena') {
    if (z.started) return;
    z.started = true;
    z.timer = 22;
    const table = spawnTable(run.floor);
    const spots = run.rng.shuffle([[0, 0], [6, 0], [0, 6], [6, 6], [3, 0], [0, 3], [6, 3]]);
    for (let k = 0; k < 3 + Math.floor(run.floor / 4); k++) {
      const [sx, sy] = spots[k];
      if (!isFree(run, z.x + sx, z.y + sy)) continue;
      const m = spawnMob(run, run.rng.pick(table), z.x + sx, z.y + sy);
      m.awake = true; m.arena = true;
    }
    run.fx.push({ k: 'shake', n: 5 });
    say(run, 'Die Prüfung beginnt! Besiege alle in 22 Zügen.');
  } else if (t === T.GOAL) solve(run);
  else if ((t === T.BRAZIER || t === T.BRAZIER_ON) && z.kind === 'braziers' && z.lights !== undefined) {
    const k = ((p.y - z.y - 1) >> 1) * 3 + ((p.x - z.x - 1) >> 1);
    z.lights = lightsPress(z.lights, k);
    for (let q = 0; q < 9; q++) { const [lx, ly] = lightCell(q); run.tiles[(z.y + ly) * W + z.x + lx] = z.lights & (1 << q) ? T.BRAZIER_ON : T.BRAZIER; }
    if (z.lights === LIGHTS_ALL) solve(run);
  } else if (t === T.ICE && z.gems?.includes(i)) {
    z.gems.splice(z.gems.indexOf(i), 1);
    const g = Math.round((4 + run.floor) * (1 + (p.aff.gold ?? 0) / 100));
    p.gold += g;
    run.fx.push({ k: 'num', x: p.x, y: p.y, s: `+${g}`, col: '#73eff7' });
    say(run, `Eiskristall! +${g} Gold.`);
  } else if (t === T.RUNE) {
    const k = z.runes[i];
    if (z.pressed.includes(k)) return;
    if (k === z.order[z.pressed.length]) {
      z.pressed.push(k);
      say(run, `${RUNE_NAMES[k]} leuchtet auf.`);
      if (z.pressed.length === z.order.length) solve(run);
    } else {
      z.pressed = [];
      z.fails++;
      run.fx.push({ k: 'shake', n: 5 });
      if (z.fails >= 3) { z.dead = true; say(run, 'Falsch! Die Runen zerfallen zu Staub.'); }
      else {
        // Runenwächter erscheinen an der Tür: einer beim ersten Fehler, zwei beim zweiten
        const table = spawnTable(run.floor);
        let n = 0;
        for (const [sx, sy] of [[3, 6], [2, 6], [4, 6], [1, 6], [5, 6]]) {
          if (n >= z.fails) break;
          if (!isFree(run, z.x + sx, z.y + sy)) continue;
          const m = spawnMob(run, run.rng.pick(table), z.x + sx, z.y + sy);
          m.awake = true; n++;
        }
        say(run, `Falsch! Die Runen erlöschen – ${n > 1 ? 'Runenwächter erscheinen' : 'ein Runenwächter erscheint'} an der Tür. Noch ${3 - z.fails} Versuch${3 - z.fails > 1 ? 'e' : ''}.`);
      }
    }
  }
}

function checkCrates(run: Run) {
  const z = run.puzzle;
  if (!z || z.solved || z.kind !== 'crates') return;
  for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) if (run.tiles[(z.y + y) * W + z.x + x] === T.PLATE) return;
  solve(run);
}

function resetCrates(run: Run) {
  const z = run.puzzle;
  if (!z || z.kind !== 'crates') return;
  if (z.solved) { say(run, 'Das Rätsel ist bereits gelöst.'); return; }
  if (run.mobs.some(m => inVault(run, m.x, m.y))) { say(run, 'Der Hebel klemmt, solange Gegner im Raum sind.'); return; }
  z.layout.forEach((tile, k) => { run.tiles[(z.y + ((k / VS) | 0)) * W + z.x + (k % VS)] = tile; });
  say(run, 'Die Kisten rumpeln zurück an ihren Platz.');
}



// Pfeilgang: die Statue schießt quer durch ihre Reihe; der Pfeil trifft das erste Wesen
function fireLane(run: Run, z: Puzzle, l: DartLane) {
  const y = z.y + l.y, dir = l.side ? -1 : 1, sx = z.x + (l.side ? VS - 1 : 0);
  let x = sx + dir, hit: Actor | undefined;
  for (; x >= z.x && x < z.x + VS; x += dir) {
    hit = run.p.x === x && run.p.y === y ? run.p : mobAt(run, x, y);
    if (hit || !walkable(run.tiles[y * W + x])) break;
  }
  const ex = hit ? x : x - dir;
  if (inVault(run, run.p.x, run.p.y)) run.fx.push({ k: 'arrow', x0: sx, y0: y, x1: ex, y1: y, col: '#c9d4dc', heavy: false });
  if (hit) damage(run, hit, 3 + Math.floor(run.floor / 3), hit === run.p ? '#b13e53' : '#c9d4dc');
}

// Pfeilgang: Reihen, die im nächsten Gegnerzug schießen (für die Warnung). Nur lesend.
export function dartWarn(run: Run): number[] {
  const z = run.puzzle;
  if (!z || z.kind !== 'darts' || !z.lanes || z.solved || !z.entered) return [];
  return z.lanes.filter(l => dartFires(l, run.turn + 1)).map(l => z.y + l.y);
}

// Ziel und Fortschritt der Kammer, in der der Held gerade steht (für die Anzeige). Nur lesend.
export function puzzleGoal(run: Run): string | null {
  const z = run.puzzle, p = run.p;
  if (!z) return null;
  const arenaOn = z.kind === 'arena' && z.started && !z.solved && !z.dead;
  if (!inVault(run, p.x, p.y) && !arenaOn) return null;
  if (z.solved) return `${VAULT_NAMES[z.kind]}: gelöst`;
  if (z.dead) return `${VAULT_NAMES[z.kind]}: verloren`;
  const count = (...ts: number[]) => { let n = 0; for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) if (ts.includes(run.tiles[(z.y + y) * W + z.x + x])) n++; return n; };
  switch (z.kind) {
    case 'crates': return `Kisten ${count(T.CRATE_ON)}/${count(T.CRATE_ON, T.PLATE)} auf Platten · Hebel setzt zurück`;
    case 'runes': {
      const tries = `Versuche ${3 - z.fails}/3`;
      if (!z.read) return `Runen: die Reihenfolge steht auf einer Tafel · ${tries}`;
      return `Runen: ${z.order.map((k, n) => (n < z.pressed.length ? `+${RUNE_NAMES[k]}` : RUNE_NAMES[k])).join(' – ')} · ${tries}`;
    }
    case 'ice': return `Eis: rutsche zur leuchtenden Platte${z.gemsMax ? ` · Kristalle ${z.gemsMax - (z.gems?.length ?? 0)}/${z.gemsMax}` : ''}`;
    case 'arena': return z.started ? `Prüfung: noch ${z.timer} Züge · ${run.mobs.filter(m => m.arena).length} Gegner` : 'Prüfung: Betritt die Mitte, dann besiege alle in 22 Zügen';
    case 'braziers': { let n = 0; for (let k = 0; k < 9; k++) if ((z.lights ?? 0) & (1 << k)) n++; return `Glutschalen: ${n}/9 brennen · Tritt schaltet Nachbarn um`; }
    case 'darts': return 'Pfeilgang: erreiche die Platte oben · rote Reihen schießen gleich';
  }
}

// Setzt ein blockierendes Objekt nur, wenn danach noch alles erreichbar bleibt.
function tryBlock(run: Run, x: number, y: number, tile: number): boolean {
  const i = y * W + x;
  if (run.tiles[i] !== T.FLOOR || !isFree(run, x, y)) return false;
  // Nie in einen Durchgang: die begehbaren Nachbarn müssen ringsum eine einzige zusammenhängende Gruppe bilden
  const ring = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]].map(([ox, oy]) => walkable(run.tiles[(y + oy) * W + x + ox]));
  let groups = 0;
  for (let k = 0; k < 8; k++) if (ring[k] && !ring[(k + 7) % 8]) groups++;
  if (groups > 1) return false;
  const reach = (d: Int16Array) => d.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
  const before = reach(distMap(run.tiles, run.p.x, run.p.y));
  run.tiles[i] = tile;
  if (reach(distMap(run.tiles, run.p.x, run.p.y)) === before - 1) return true;
  run.tiles[i] = T.FLOOR;
  return false;
}

// Kammer im Fels neben einem Raum: Versteck hinter rissiger Wand oder Schatzkammer hinter einem Gitter.
function addSecret(run: Run, rooms: Room[], gate = false): boolean {
  const t = run.tiles;
  for (let n = 0; n < 80; n++) {
    const r = run.rng.pick(rooms), [ox, oy] = run.rng.pick(DIRS4);
    const wx = ox ? (ox > 0 ? r.x + r.w : r.x - 1) : run.rng.int(r.x, r.x + r.w - 1);
    const wy = oy ? (oy > 0 ? r.y + r.h : r.y - 1) : run.rng.int(r.y, r.y + r.h - 1);
    const cx = wx + ox * 2, cy = wy + oy * 2; // Mitte der Kammer
    if (cx < 3 || cy < 3 || cx >= W - 3 || cy >= H - 3) continue;
    if (t[(wy - oy) * W + wx - ox] !== T.FLOOR) continue; // davor muss freier Raumboden liegen
    let solid = true;
    for (let y = cy - 2; y <= cy + 2 && solid; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      if (t[y * W + x] !== T.WALL) { solid = false; break; }
    }
    if (!solid) continue;
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) t[y * W + x] = T.FLOOR;
    if (gate) {
      // zwei Truhen in den hinteren Ecken
      t[(cy + oy + (ox ? -1 : 0)) * W + cx + ox + (oy ? -1 : 0)] = T.CHEST;
      t[(cy + oy + (ox ? 1 : 0)) * W + cx + ox + (oy ? 1 : 0)] = T.CHEST;
      t[wy * W + wx] = T.GATE;
    } else {
      t[cy * W + cx] = T.CHEST;
      t[wy * W + wx] = T.CRACKED;
    }
    return true;
  }
  return false;
}

// Stellt ein Objekt in einen Raum: bevorzugt in eine Ecke, sonst irgendwo, ohne Wege zu versperren.
function placeIn(run: Run, r: Room, tile: number): boolean {
  const rng = run.rng;
  const spots = rng.shuffle([[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]]);
  for (let k = 0; k < 8; k++) spots.push([rng.int(r.x, r.x + r.w - 1), rng.int(r.y, r.y + r.h - 1)]);
  const [mx, my] = center(r);
  return spots.some(([x, y]) => !(x === mx && y === my) && tryBlock(run, x, y, tile));
}

function nextFloor(run: Run) {
  run.floor++;
  if (run.floor > 1) run.souls += Math.round(5 * run.p.soulMul);
  const rng = run.rng, biome = biomeOf(run.floor);
  const { tiles, rooms } = genDungeon(rng, biome);
  run.tiles = tiles;
  run.seen = new Uint8Array(W * H);
  run.mobs = [];
  run.traps = [];
  run.hazards = [];
  run.fire = new Map(); run.fuses = new Map(); run.cracks = new Map();
  run.puzzle = null; run.willUsed = false;
  if (run.runeUsed) run.runeUsed = false;
  run.p.keys = 0;
  if (has(run.p, 'sprengmeister') && run.floor > 1) run.p.bombs++;
  [run.p.x, run.p.y] = center(rooms[0]);
  const last = rooms[rooms.length - 1];
  const bossFloor = run.floor % FLOORS_PER_BIOME === 0;
  if (bossFloor) {
    const [bx, by] = center(last);
    spawnMob(run, BOSS_BY_BIOME[biome], bx, by);
  } else {
    const [sx, sy] = center(last);
    run.tiles[sy * W + sx] = T.STAIRS;
  }
  if (!bossFloor && rng.chance(0.8)) addVault(run, rooms);
  // Bewuchs (brennbar): Moos in der Gruft, Pilzrasen in der Höhle, Kohlenstaub in der Schmiede
  for (const r of rooms) {
    if (!rng.chance([0.3, 0.6, 0.35][biome])) continue;
    let x = rng.int(r.x, r.x + r.w - 1), y = rng.int(r.y, r.y + r.h - 1);
    for (let k = rng.int(4, 12); k > 0; k--) {
      if (run.tiles[y * W + x] === T.FLOOR) run.tiles[y * W + x] = T.GRASS;
      const [ox, oy] = rng.pick(DIRS4);
      x = Math.max(r.x, Math.min(r.x + r.w - 1, x + ox)); y = Math.max(r.y, Math.min(r.y + r.h - 1, y + oy));
    }
  }
  const table = spawnTable(run.floor);
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    // auf Boss-Ebenen ein Gegner weniger je Raum
    const n = (bossFloor && r === last) ? 0 : rng.int(1, 2) + Math.floor(run.floor / 5) - (bossFloor ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const f = freeInRoom(run, r);
      if (f) spawnMob(run, rng.pick(table), f[0], f[1]);
    }
    if (rng.chance(0.4)) {
      const roll = rng.next();
      let tile: number = roll < 0.22 ? T.ALTAR : roll < 0.34 ? T.CURSED : T.CHEST;
      // Mimik: sieht aus wie eine Truhe (nur wenn eingeschaltet – sonst keine Zufallszahl)
      if (tile === T.CHEST && FEATURES.mimics && run.floor >= HAZARD.minFloor && rng.chance(HAZARD.mimic)) tile = T.MIMIC;
      placeIn(run, r, tile);
    }
    // Säulen in großen Räumen, Fässer verstreut
    if (r.w >= 6 && r.h >= 5 && rng.chance(0.5)) {
      for (const [px, py] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) tryBlock(run, px, py, T.PILLAR);
    }
    if (rng.chance(0.35)) {
      for (let k = rng.int(1, 2); k > 0; k--) tryBlock(run, rng.int(r.x, r.x + r.w - 1), rng.int(r.y, r.y + r.h - 1), T.BARREL);
    }
  }
  // Brüchiger Boden: Abkürzung nach unten, nie an einem Boss vorbei
  if (!bossFloor && run.floor < LAST_FLOOR && rng.chance(0.4)) {
    // nur dort, wo man auch außen herum käme
    const f = freeInRoom(run, rng.pick(rooms.slice(1)));
    if (f && tryBlock(run, f[0], f[1], T.BARREL)) run.tiles[f[1] * W + f[0]] = T.FRAGILE;
  }
  run.shop = [];
  run.target = 0;
  if (!bossFloor && rng.chance(0.5)) {
    if (placeIn(run, rng.pick(rooms.slice(1)), T.TRADER)) run.shop = stock(run);
  }
  if (rng.chance(0.65)) addSecret(run, rooms);
  if (rng.chance(0.45)) placeIn(run, rng.pick(rooms.slice(1)), T.FOUNTAIN);
  // Schatzkammer hinter einem Gitter; den Schlüssel trägt ein Elitegegner am anderen Ende der Ebene
  const cands = run.mobs.filter(m => !m.boss);
  if (cands.length && rng.chance(0.6) && addSecret(run, rooms, true)) {
    const d0 = distMap(run.tiles, run.p.x, run.p.y);
    const e = cands.reduce((a, b) => (d0[a.y * W + a.x] >= d0[b.y * W + b.x] ? a : b));
    e.elite = true;
    e.name = `Elite-${e.name}`;
    e.maxHp = e.hp = Math.round(e.hp * 1.8);
    e.atk += 2; e.xp *= 2;
  }
  if (FEATURES.hazards && !bossFloor && run.floor >= HAZARD.minFloor) addHazards(run, rooms[0], biome);
  if (run.ev) { tele(run, `evLost_${run.ev.id}`); tele(run, 'evAbandon'); run.ev = null; }
  if (run.warn?.length) run.warn = [];
  if (run.mud?.length) run.mud = [];
  if (FEATURES.events && !bossFloor) planEvents(run, rooms);
  if (FEATURES.hunters) { run.floorTurns = 0; run.entry = [run.p.x, run.p.y]; run.hunt = bossFloor ? null : { next: HUNTER.first, n: 0 }; }
  else if (run.evQ?.length) run.evQ = [];
  computeFov(run.tiles, run.p.x, run.p.y, fovR(run), run.vis, run.seen);
  say(run, `Ebene ${run.floor} – ${BIOME_NAMES[biome]}`);
  if (bossFloor) say(run, 'Etwas Mächtiges lauert hier ...');
}

// ---------- Versteckte Fallen und Mimiks ----------

const tele = (run: Run, k: string, n = 1) => { (run.tele ??= {})[k] = (run.tele[k] ?? 0) + n; };
const FLYERS = new Set(['fledermaus', 'glutgeist', 'irrlicht']);
const HAZARD_KINDS: HazardKind[][] = [['stachel', 'stachel', 'pfeil'], ['stachel', 'gas', 'gas', 'pfeil'], ['stachel', 'glut', 'glut', 'pfeil']];
const BLOCKERS: number[] = [T.CHEST, T.CURSED, T.MIMIC, T.TRADER, T.ALTAR, T.FOUNTAIN, T.TABLET, T.STAIRS, T.LEVER];

// Fallen bevorzugt in Gängen und Durchgängen; nie im Startraum, in der Rätselkammer, vor Truhe oder Händler
function addHazards(run: Run, start: Room, biome: number) {
  const t = run.tiles, rng = run.rng, z = run.puzzle;
  const okAt = (x: number, y: number) => {
    const i = y * W + x;
    if (t[i] !== T.FLOOR || mobAt(run, x, y)) return false;
    if (x >= start.x - 1 && x <= start.x + start.w && y >= start.y - 1 && y <= start.y + start.h) return false;
    if (z && x >= z.x - 1 && x <= z.x + VS && y >= z.y - 1 && y <= z.y + VS + 1) return false;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (BLOCKERS.includes(t[i + oy * W + ox])) return false;
    return !run.hazards.some(h => cheb(h, { x, y }) <= 2);
  };
  const corridor: number[] = [], open: number[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (t[y * W + x] !== T.FLOOR) continue;
    const n = DIRS4.filter(([ox, oy]) => walkable(t[(y + oy) * W + x + ox])).length;
    (n <= 2 ? corridor : open).push(y * W + x);
  }
  const want = rng.int(2, 4) + Math.floor(run.floor / 5);
  for (let k = 0, tries = 0; k < want && tries < 200; tries++) {
    const pool = corridor.length && rng.chance(0.7) ? corridor : open;
    if (!pool.length) break;
    const i = rng.pick(pool), x = i % W, y = (i / W) | 0;
    if (!okAt(x, y)) continue;
    run.hazards.push({ x, y, kind: rng.pick(HAZARD_KINDS[biome]), seen: false });
    k++;
  }
}

// Ein Wesen betritt ein Feld: liegt dort eine Falle, löst sie aus. Fliegende Gegner schweben darüber.
function stepHazard(run: Run, a: Actor) {
  const h = run.hazards.find(q => q.x === a.x && q.y === a.y);
  if (!h) return;
  const p = run.p, isP = a === p;
  if (!isP && FLYERS.has(a.kind)) return;
  const shown = isP || !!run.vis[a.y * W + a.x];
  h.seen = h.seen || shown;
  const name = HAZARD_NAMES[h.kind];
  if (isP) { tele(run, 'trapHit'); run.fx.push({ k: 'shake', n: 3 }); }
  else tele(run, 'trapMob');
  const hp0 = p.hp;
  switch (h.kind) {
    case 'stachel':
      if (shown) say(run, isP ? `${name}! Stacheln schießen aus dem Boden.` : `${a.name} tritt in eine ${name}!`);
      damage(run, a, 3 + Math.floor(run.floor / 2), isP ? '#b13e53' : '#c9d4dc');
      break;
    case 'pfeil': {
      // Der Pfeil kommt aus der nächsten Wand in einer der vier Richtungen
      let src: [number, number] | null = null;
      for (let d = 1; d <= 8 && !src; d++) for (const [ox, oy] of DIRS4) {
        const x = a.x + ox * d, y = a.y + oy * d;
        if (opaque(run.tiles[y * W + x])) { src = [x, y]; break; }
      }
      if (src && shown) run.fx.push({ k: 'arrow', x0: src[0], y0: src[1], x1: a.x, y1: a.y, col: '#c9d4dc', heavy: false });
      if (shown) say(run, isP ? `${name}! Ein Pfeil zischt aus der Wand.` : `${a.name} löst eine ${name} aus!`);
      damage(run, a, 2 + Math.floor(run.floor / 2), isP ? '#b13e53' : '#c9d4dc');
      break;
    }
    case 'gas':
      // Giftwolke über 3x3, danach ist die Falle leer
      if (shown) say(run, isP ? `${name}! Grünes Gas strömt aus dem Boden.` : `Unter ${a.name} zischt eine ${name}!`);
      for (const q of [p, ...run.mobs]) if (cheb(q, a) <= 1) q.st.gift = Math.max(q.st.gift ?? 0, 4);
      run.hazards = run.hazards.filter(q => q !== h);
      break;
    case 'glut':
      if (shown) say(run, isP ? `${name}! Glut bricht aus dem Boden.` : `${a.name} tritt auf eine ${name}!`);
      for (const [ox, oy] of [[0, 0], ...DIRS4]) ignite(run, a.x + ox, a.y + oy, 2);
      a.st.brand = Math.max(a.st.brand ?? 0, 2);
      break;
  }
  if (isP && p.hp < hp0) tele(run, 'trapDmg', hp0 - p.hp);
}

// Am Ende jedes Zugs: nahe, sichtbare Fallen kann der Held entdecken (keine Erfahrung dafür – das Wissen ist der Lohn)
function spotHazards(run: Run) {
  const p = run.p;
  for (const h of run.hazards) {
    if (h.seen || !run.vis[h.y * W + h.x] || cheb(h, p) > 2) continue;
    const sure = p.cls === 'waldlaeufer' && cheb(h, p) <= 1;
    if (!sure && !run.rng.chance(HAZARD.spot + HAZARD.spotSicht * (p.aff.sicht ?? 0))) continue;
    h.seen = true;
    tele(run, 'trapSpot');
    run.fx.push({ k: 'num', x: h.x, y: h.y, s: '!', col: '#ffcd75' });
    say(run, `Falle entdeckt! ${HAZARD_NAMES[h.kind]}.`);
  }
}

// Ein Mimik zeigt sich: aus der „Truhe“ wird ein Gegner. bite: er schnappt sofort zu (wenn man ihn anstößt).
function revealMimic(run: Run, i: number, bite: boolean) {
  const x = i % W, y = (i / W) | 0;
  run.tiles[i] = T.FLOOR;
  const m = spawnMob(run, 'mimik', x, y);
  m.awake = true;
  m.cd = bite ? 1 : 0; // nach dem Biss beim Aufdecken setzt er in diesem Zug aus
  tele(run, 'mimicMet');
  run.fx.push({ k: 'shake', n: 4 });
  say(run, 'Die Truhe hat Zähne! Ein Mimik!');
  if (bite) hitPlayer(run, m, true);
}

// ---------- Zerstörung und Feuer ----------

// ---------- Zufällige Ereignisse ----------

// Plant die Ereignisse einer Ebene. Ohne eingeschaltete Ereignisse: keine Zufallszahl, kein Zustand.
function planEvents(run: Run, rooms: Room[]) {
  run.ev = null; run.warn = [];
  const rate = FEATURES.eventRate, rng = run.rng, biome = biomeOf(run.floor);
  let n = rate >= 2 ? 2 : rate === 1 ? 1 + (rng.chance(EVENT.second) ? 1 : 0) : 0;
  const q: EvPlan[] = [];
  run.evQ = q; run.evCalm = 0;
  run.evRooms = rooms;
  // Räume für Raumereignisse: nicht Start, nicht Treppe, nicht die Rätselkammer
  const free = rooms.map((r, i) => i).filter(i => i > 0 && i < rooms.length - 1 && !(run.puzzle && rooms[i].x < run.puzzle.x + VS && run.puzzle.x < rooms[i].x + rooms[i].w && rooms[i].y < run.puzzle.y + VS && run.puzzle.y < rooms[i].y + rooms[i].h));
  const used = (run.evUsed ??= []);
  for (; n > 0; n--) {
    let cands: EvDef[];
    if (FEATURES.eventForce) cands = EVENTS.filter(d => d.id === FEATURES.eventForce && (!FEATURES.eventForceBiome || d.biome === undefined || d.biome === biome));
    else {
      const ok = (d: EvDef, deck: boolean) => (d.biome === undefined || d.biome === biome) && (!deck || !used.includes(d.id)) && !(run.evDanger && d.cat === 'danger') && (d.trigger === 'calm' || free.length > 0) && !q.some(pl => pl.id === d.id);
      cands = EVENTS.filter(d => ok(d, true));
      if (!cands.length) cands = EVENTS.filter(d => ok(d, false)); // Deck aufgebraucht: von vorn
    }
    if (!cands.length) break;
    // Gebietsereignisse und allgemeine etwa 60 : 40
    const bio = cands.filter(c => c.biome !== undefined), gen = cands.filter(c => c.biome === undefined);
    const d = rng.pick(bio.length && gen.length ? (rng.chance(EVENT.biomeShare) ? bio : gen) : cands);
    if (d.trigger === 'room' && !free.length) continue;
    const plan: EvPlan = { id: d.id };
    if (d.trigger === 'room') plan.room = free.splice(rng.int(0, free.length - 1), 1)[0];
    q.push(plan);
    used.push(d.id);
    run.evDanger = d.cat === 'danger';
  }
}

const inRoomRect = (r: Room, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function evApi(run: Run): EvApi {
  const p = run.p, rng = run.rng, goldMul = () => 1 + (p.aff.gold ?? 0) / 100;
  const api: EvApi = {
    floor: run.floor, turn: run.turn, p,
    chance: x => rng.chance(x), int: (a, b) => rng.int(a, b),
    say: s => say(run, s),
    table: () => spawnTable(run.floor),
    spawn(e, kind, x, y) { const m = spawnMob(run, kind, x, y); m.awake = true; m.ev = true; e.mobs.push(m.id); e.total++; return m; },
    alive: e => run.mobs.filter(m => e.mobs.includes(m.id) && m.hp > 0),
    vanish(e) {
      for (const m of api.alive(e)) run.fx.push({ k: 'num', x: m.x, y: m.y, s: 'puff', col: '#94b0c2' });
      run.mobs = run.mobs.filter(m => !e.mobs.includes(m.id));
    },
    near(min, max) {
      const d = distMap(run.tiles, p.x, p.y), c: number[] = [];
      for (let i = 0; i < W * H; i++) {
        const x = i % W, y = (i / W) | 0;
        if (d[i] >= min && d[i] <= max && run.tiles[i] === T.FLOOR && isFree(run, x, y) && !inVault(run, x, y) && !run.hazards.some(h => h.x === x && h.y === y)) c.push(i);
      }
      if (!c.length) return null;
      const i = c[rng.int(0, c.length - 1)];
      return [i % W, (i / W) | 0, d[i]];
    },
    inRoom: r => freeInRoom(run, r),
    edge(r) {
      const out: [number, number][] = [];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        if ((x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) && run.tiles[y * W + x] === T.FLOOR && isFree(run, x, y) && cheb(p, { x, y }) >= 2) out.push([x, y]);
      }
      return out;
    },
    roomTiles(r) {
      const out: number[] = [];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (walkable(run.tiles[y * W + x])) out.push(y * W + x);
      return out;
    },
    seal(e) {
      const r = e.room!;
      e.seal = [];
      for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
        if (inRoomRect(r, x, y) || x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x, t = run.tiles[i];
        if (!walkable(t) || mobAt(run, x, y) || (p.x === x && p.y === y)) continue;
        e.seal.push([i, t]);
        run.tiles[i] = T.GATE;
      }
    },
    warn(tiles) { run.warn = tiles; },
    strike(dmg, kind) {
      const hit = run.warn ?? [];
      run.warn = [];
      if (!hit.length) return;
      run.fx.push({ k: 'shake', n: kind === 'rock' || kind === 'hammer' ? 3 : 2 });
      for (const i of hit) {
        const x = i % W, y = (i / W) | 0;
        if (kind === 'rock' || kind === 'hammer') run.fx.push({ k: 'debris', x, y });
        if (kind === 'fire') ignite(run, x, y, 3);
        const a = p.x === x && p.y === y ? p : mobAt(run, x, y);
        if (!a || a.hp <= 0) continue;
        if (kind === 'gas') { a.st.gift = Math.max(a.st.gift ?? 0, 3); run.fx.push({ k: 'num', x, y, s: 'Gift', col: '#38b764' }); }
        if (dmg > 0) damage(run, a, dmg, '#b13e53');
      }
      tele(run, 'evStrike');
    },
    elite(m, mul, name) { m.maxHp = m.hp = Math.round(m.hp * mul); m.atk += 2; m.xp *= 2; m.name = name; },
    rival(e, x, y) {
      const other = (['krieger', 'magier', 'waldlaeufer'] as const).filter(c => c !== p.cls), cls = other[rng.int(0, other.length - 1)];
      const m = api.spawn(e, `rivale_${cls[0]}`, x, y), c = CLASSES[cls];
      m.maxHp = m.hp = Math.round(c.hp * (0.7 + 0.12 * run.floor));
      m.atk = Math.round(c.atk + 0.7 * run.floor); m.def = c.def;
      m.xp = 12 + 2 * run.floor;
      return m;
    },
    barrel(x, y, fuse) {
      const i = y * W + x;
      if (run.tiles[i] !== T.FLOOR || mobAt(run, x, y) || (p.x === x && p.y === y)) return false;
      run.tiles[i] = T.BARREL; run.fuses.set(i, fuse);
      return true;
    },
    hurt(n, why) { if (p.hp > 0) { damage(run, p, n, '#9a4fc0'); tele(run, `evHurt`); if (p.hp <= 0) say(run, why); } },
    heal(frac) { const n = Math.min(p.maxHp - p.hp, Math.ceil(p.maxHp * frac)); p.hp += n; if (n) run.fx.push({ k: 'num', x: p.x, y: p.y, s: `+${n}`, col: '#a7f070' }); return n; },
    mud(tiles) { run.mud = tiles; },
    isFloor: i => run.tiles[i] === T.FLOOR || run.tiles[i] === T.GRASS || run.tiles[i] === T.BURNT,
    free: i => isFree(run, i % W, (i / W) | 0) && !inVault(run, i % W, (i / W) | 0),
    reward: tier => evReward(run, tier),
    remove(m) { run.mobs = run.mobs.filter(o => o.id !== m.id); },
    near2(x, y, min, max) {
      const out: number[] = [];
      for (let yy = y - max; yy <= y + max; yy++) for (let xx = x - max; xx <= x + max; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.max(Math.abs(xx - x), Math.abs(yy - y));
        if (d >= min && d <= max && walkable(run.tiles[yy * W + xx]) && !inVault(run, xx, yy)) out.push(yy * W + xx);
      }
      return out;
    },
    wake(e, max, range) {
      const d = distMap(run.tiles, p.x, p.y);
      const sleepers = run.mobs.filter(m => !m.awake && !m.boss && d[m.y * W + m.x] >= 0 && d[m.y * W + m.x] <= range).sort((a, b) => d[a.y * W + a.x] - d[b.y * W + b.x]).slice(0, max);
      for (const m of sleepers) { m.awake = true; e.mobs.push(m.id); e.total++; }
      return sleepers.length;
    },
    root(turns) { p.st.netz = turns; },
    gold(n) { const g = Math.round(n * goldMul()); p.gold += g; tele(run, 'evGold', g); return g; },
    takeGold(n) { const g = Math.min(p.gold, n); p.gold -= g; return g; },
    souls(n) { const s = Math.round(n * p.soulMul); run.souls += s; tele(run, 'evSouls', s); return s; },
    atPlayer: i => p.y * W + p.x === i,
    shadow(e, x, y) {
      const kind = `schatten_${p.cls[0]}`, m = api.spawn(e, kind, x, y);
      m.maxHp = m.hp = Math.max(6, Math.round(p.maxHp * EVENT.twinHp));
      m.atk = Math.max(2, Math.round(playerAtk(p) * EVENT.twinAtk * (CLASSES[p.cls].range ? 0.8 : 1)));
      m.def = Math.floor(p.def / 2);
      m.xp = 10 + 2 * run.floor;
      return m;
    },
  };
  return api;
}

// Lohn nach einem geschafften Ereignis. Stufe 3 kann (selten, gedeckelt) eine Reliquienwahl sein.
function evReward(run: Run, tier: number): string {
  const p = run.p, rng = run.rng, a = evApi(run);
  if (tier === 1) {
    const g = a.gold(6 + 2 * run.floor);
    if (rng.chance(0.5)) { p.potions++; return `${g} Gold, ein Heiltrank`; }
    p.bombs++; return `${g} Gold, eine Bombe`;
  }
  if (tier === 2) {
    const s = a.souls(8);
    if (rng.chance(0.5)) { const it = genItem(run); takeItem(run, it, 'Lohn'); tele(run, 'evItems'); return `${it.name}, ${s} Seelen`; }
    p.potions++; p.bombs++; return `Heiltrank und Bombe, ${s} Seelen`;
  }
  const pool = rng.shuffle(Object.keys(RELICS).filter(id => !has(p, id)));
  if ((run.relicOps ?? 0) < EVENT.relicCap && pool.length >= 2 && rng.chance(EVENT.relicChance)) {
    run.relicOps = (run.relicOps ?? 0) + 1;
    tele(run, 'evRelic');
    run.perkChoices = pool.slice(0, 2);
    run.mode = 'perk';
    return 'Wahl einer Reliquie';
  }
  const it = genItem(run, false, 1);
  takeItem(run, it, 'Lohn'); tele(run, 'evItems');
  return `${it.name}, ${a.gold(8 + 2 * run.floor)} Gold, ${a.souls(12)} Seelen`;
}

function evStart(run: Run, plan: EvPlan): boolean {
  const d = EVENT_BY_ID[plan.id];
  const e: EvState = { id: d.id, turns: 0, limit: d.limit, mobs: [], total: 0, data: {} };
  if (plan.room !== undefined && run.evRooms) e.room = run.evRooms[plan.room];
  const ok = d.start(evApi(run), e);
  run.evQ = (run.evQ ?? []).filter(q => q !== plan);
  if (!ok) { tele(run, 'evSkip'); return false; }
  run.ev = e;
  const intro = d.intro[run.rng.int(0, d.intro.length - 1)];
  say(run, `Ereignis: ${d.title} – ${intro}`);
  run.fx.push({ k: 'banner', title: `EREIGNIS: ${d.title}`, sub: intro, col: d.cat === 'danger' ? '#ef7d57' : d.cat === 'challenge' ? '#ffcd75' : '#73eff7' }, { k: 'shake', n: d.cat === 'danger' ? 4 : 1 });
  tele(run, `evStart_${d.id}`);
  return true;
}

function evEnd(run: Run, won: boolean) {
  const e = run.ev!, d = EVENT_BY_ID[e.id], a = evApi(run);
  for (const [i, t] of e.seal ?? []) if (run.tiles[i] === T.GATE) run.tiles[i] = t;
  run.warn = []; if (run.mud?.length) run.mud = [];
  for (const m of run.mobs) if (e.mobs.includes(m.id)) m.ev = false;
  if (d.vanish && a.alive(e).length) a.vanish(e);
  run.ev = null;
  tele(run, `ev${won ? 'Won' : 'Lost'}_${d.id}`);
  if (won) {
    const what = d.won ? d.won(a, e) : evReward(run, d.tier);
    say(run, `Geschafft! Lohn: ${what}.`);
    run.fx.push({ k: 'banner', title: 'GESCHAFFT!', sub: `Lohn: ${what}`, col: '#a7f070' });
  } else {
    const why = d.lost ? d.lost(a, e) : 'Das Ereignis ist vorbei.';
    say(run, why);
    run.fx.push({ k: 'banner', title: 'VORBEI', sub: why, col: '#94b0c2' });
  }
}

// Am Ende jedes Zugs: laufendes Ereignis fortschreiben oder ein geplantes auslösen
function evTick(run: Run) {
  if (run.mode !== 'play' || run.p.hp <= 0) return;
  const p = run.p;
  if (run.ev) {
    const e = run.ev, d = EVENT_BY_ID[e.id];
    e.turns++;
    let r = d.tick(evApi(run), e);
    if (r === 'run' && e.turns >= e.limit) r = d.survive ? 'won' : 'lost';
    if (r !== 'run' && p.hp > 0) evEnd(run, r === 'won');
    return;
  }
  const q = run.evQ;
  if (!q?.length || inVault(run, p.x, p.y)) return;
  const roomPlan = q.find(pl => pl.room !== undefined && run.evRooms && inRoomRect(run.evRooms[pl.room], p.x, p.y));
  if (roomPlan) { evStart(run, roomPlan); return; }
  const calm = !run.mobs.some(m => m.awake && run.vis[m.y * W + m.x]);
  run.evCalm = calm ? (run.evCalm ?? 0) + 1 : 0;
  // Fundstück: einmal je Ebene an einer ruhigen Stelle
  if (run.evCalm === 12 && run.evNote !== run.floor && run.rng.chance(EVENT.noteChance)) {
    run.evNote = run.floor;
    say(run, `Ein Zettel an der Wand: "${NOTES[run.rng.int(0, NOTES.length - 1)]}"`);
  }
  const calmPlan = q.find(pl => pl.room === undefined);
  if (calmPlan && run.evCalm >= EVENT.calmMin && (run.evCalm >= EVENT.calmMax || run.rng.chance(EVENT.calmChance))) { run.evCalm = 0; evStart(run, calmPlan); }
}

// Für die Anzeige: Ziel des laufenden Ereignisses, Zielfeld und Ereignisgegner
export function eventGoal(run: Run): { title: string; goal: string; col: string } | null {
  const e = run.ev;
  if (!e) return null;
  const d = EVENT_BY_ID[e.id];
  return { title: d.title, goal: d.goal(evApi(run), e), col: d.cat === 'danger' ? '#ef7d57' : d.cat === 'challenge' ? '#ffcd75' : '#73eff7' };
}

// ---------- Jäger: wer zu lange auf einer Ebene bleibt, wird gejagt ----------

const isHunter = (m: Actor) => !!MOBS[m.kind].hunter;

// Am Ende jedes Zugs (nur mit eingeschalteten Jägern)
function hunterTick(run: Run) {
  const h = run.hunt;
  if (!h || run.mode !== 'play' || run.p.hp <= 0) return;
  run.floorTurns = (run.floorTurns ?? 0) + 1;
  const t = run.floorTurns;
  if (t === HUNTER.first - HUNTER.warn) say(run, 'Etwas verfolgt dich ...');
  if (t < h.next) return;
  // aufgeschoben (nicht verloren): in der Rätselkammer, in einem versiegelten Ereignis, bei voller Zahl
  if (inVault(run, run.p.x, run.p.y) || run.ev?.seal?.length || run.mobs.filter(isHunter).length >= HUNTER.cap) return;
  if (spawnHunter(run)) { h.n++; h.next = t + HUNTER.interval; }
}

function spawnHunter(run: Run): boolean {
  const p = run.p, rng = run.rng;
  let kind = FEATURES.hunterForce;
  if (!kind) {
    let r = rng.int(1, HUNTER.pool.reduce((a, [, w]) => a + w, 0));
    for (const [k, w] of HUNTER.pool) { if ((r -= w) <= 0) { kind = k; break; } }
  }
  // nahe dem Eingang der Ebene, auf einem freien Feld, das den Helden erreicht, nicht direkt neben ihm
  const [ex, ey] = run.entry ?? [p.x, p.y];
  const de = distMap(run.tiles, ex, ey), dp = distMap(run.tiles, p.x, p.y);
  let best = -1;
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    if (de[i] < 0 || dp[i] < 0 || cheb(p, { x, y }) < 5 || run.tiles[i] !== T.FLOOR || !isFree(run, x, y) || inVault(run, x, y)) continue;
    if (best < 0 || de[i] < de[best]) best = i;
  }
  if (best < 0) return false;
  const m = spawnMob(run, kind, best % W, (best / W) | 0);
  m.awake = true; m.st.born = run.turn;
  tele(run, `hunt_${kind}`);
  say(run, `DER JÄGER IST DA: ${m.name}!`);
  run.fx.push({ k: 'banner', title: 'DER JÄGER IST DA', sub: m.name, col: '#b13e53' }, { k: 'shake', n: 5 });
  return true;
}

// ein Schritt auf den Helden zu (über die Wegkarte); false, wenn es nicht weitergeht
function stepToward(run: Run, m: Actor, dist: Int16Array): boolean {
  let best: number[] | null = null, bd = dist[m.y * W + m.x];
  if (bd < 0) return false;
  for (const [ox, oy] of DIRS4) {
    const x = m.x + ox, y = m.y + oy;
    if (!isFree(run, x, y)) continue;
    const v = dist[y * W + x];
    if (v >= 0 && v < bd) { bd = v; best = [x, y]; }
  }
  if (!best) return false;
  moveMob(run, m, best[0], best[1]);
  return m.hp > 0;
}
const orth = (run: Run, m: Actor) => Math.abs(run.p.x - m.x) + Math.abs(run.p.y - m.y) === 1;
const walk = (run: Run, m: Actor, dist: Int16Array, n: number) => { for (let k = 0; k < n && !orth(run, m); k++) if (!stepToward(run, m, dist)) break; };

// Felder, die ein Jäger im nächsten Zug trifft (Tentakel, Feueratem, Sense) – für Anzeige und Bot
export function hunterWarn(run: Run): number[] {
  const out: number[] = [];
  for (const m of run.mobs) {
    if (m.st.tt !== undefined) out.push(m.st.tt);
    if (m.st.bt) for (const i of breathLine(run, m)) out.push(i);
    if (m.st.zt) for (const i of scythe(run, m)) out.push(i);
  }
  return out;
}
// Sense: ein Bogen aus drei Feldern quer zur Richtung des Todes, mittig auf dem Helden –
// ein Schritt zur Seite oder nach hinten führt hinaus
function scythe(run: Run, m: Actor): number[] {
  const out: number[] = [];
  for (const k of [-1, 0, 1]) {
    const x = m.st.zx + (m.st.zv ? 0 : k), y = m.st.zy + (m.st.zv ? k : 0);
    if (x >= 0 && y >= 0 && x < W && y < H && walkable(run.tiles[y * W + x])) out.push(y * W + x);
  }
  return out;
}
function breathLine(run: Run, m: Actor): number[] {
  const out: number[] = [];
  let x = m.x, y = m.y;
  for (let k = 0; k < 3; k++) { x += m.st.bdx; y += m.st.bdy; if (x < 0 || y < 0 || x >= W || y >= H || opaque(run.tiles[y * W + x])) break; out.push(y * W + x); }
  return out;
}

function hunterAct(run: Run, m: Actor, dist: Int16Array) {
  const p = run.p, near = cheb(m, p);
  if (m.cd > 0 && m.kind !== 'medusa') m.cd--;
  switch (m.kind) {
    case 'echse': // bewegt sich bis zu zwei Felder ODER beißt
      if (orth(run, m)) { hitPlayer(run, m, true); if (p.hp > 0 && run.rng.chance(0.15)) { p.st.gift = Math.max(p.st.gift ?? 0, 3); run.fx.push({ k: 'num', x: p.x, y: p.y, s: 'Gift', col: '#38b764' }); } }
      else walk(run, m, dist, 2);
      return;
    case 'krake': // Tentakel auf bis zu 3 Felder, einen Zug vorher angekündigt
      if (m.st.tt !== undefined) {
        const t = m.st.tt; delete m.st.tt;
        run.fx.push({ k: 'bolt', x0: m.x, y0: m.y, x1: t % W, y1: (t / W) | 0, col: '#9a4fc0' });
        if (p.y * W + p.x === t) hitPlayer(run, m, true); else run.fx.push({ k: 'num', x: t % W, y: (t / W) | 0, s: 'verfehlt', col: '#94b0c2' });
        m.cd = 1;
        return;
      }
      if (near <= 3 && !m.cd) { m.st.tt = p.y * W + p.x; run.fx.push({ k: 'num', x: m.x, y: m.y, s: '!', col: '#9a4fc0' }); return; }
      walk(run, m, dist, 1);
      return;
    case 'drache': // fliegt bis zu drei Felder ODER beißt ODER speit Feuer (einen Zug vorher angekündigt)
      if (m.st.bt) {
        delete m.st.bt;
        run.fx.push({ k: 'boom', x: m.x + m.st.bdx, y: m.y + m.st.bdy, r: 1 });
        for (const i of breathLine(run, m)) {
          const x = i % W, y = (i / W) | 0;
          ignite(run, x, y, 3);
          if (p.x === x && p.y === y) damage(run, p, m.atk, '#ef7d57');
        }
        m.cd = 3;
        return;
      }
      if (orth(run, m)) { hitPlayer(run, m, true); return; }
      if (!m.cd && near <= 3 && near >= 2 && (p.x === m.x || p.y === m.y || Math.abs(p.x - m.x) === Math.abs(p.y - m.y))) {
        m.st.bt = 1; m.st.bdx = Math.sign(p.x - m.x); m.st.bdy = Math.sign(p.y - m.y);
        if (breathLine(run, m).includes(p.y * W + p.x)) { say(run, `${m.name} holt tief Luft ...`); return; }
        delete m.st.bt;
      }
      walk(run, m, dist, 3);
      return;
    case 'medusa':
      if (orth(run, m)) hitPlayer(run, m, true); else walk(run, m, dist, 1);
      return;
    case 'tod': // Sense: Zone um den Helden, einen Zug vorher angekündigt; wer drinbleibt, stirbt
      if (m.st.zt) {
        delete m.st.zt;
        const inZone = scythe(run, m).includes(p.y * W + p.x);
        run.fx.push({ k: 'swipe', x: m.st.zx, y: m.st.zy, dx: 1, dy: 0, big: true });
        m.cd = 4;
        if (inZone) {
          say(run, 'Die Sense trifft. Der Tod holt dich.');
          tele(run, 'todExec');
          p.hp = 0; // Rüstung und Schild helfen nicht – nur Lebensretter wie Eisenwille
          run.fx.push({ k: 'shake', n: 8 });
          fatal(run);
        } else say(run, 'Die Sense trifft ins Leere.');
        return;
      }
      if (m.st.born !== run.turn && !m.cd && near <= 2) {
        m.st.zt = 1; m.st.zx = p.x; m.st.zy = p.y; m.st.zv = Math.abs(p.x - m.x) >= Math.abs(p.y - m.y) ? 1 : 0;
        say(run, 'DER TOD HOLT AUS! Raus aus dem Feld!');
        run.fx.push({ k: 'banner', title: 'DER TOD HOLT AUS', sub: 'Verlasse das rote Feld!', col: '#b13e53' });
        return;
      }
      if (orth(run, m)) { hitPlayer(run, m, true); return; }
      walk(run, m, dist, 3);
      return;
  }
}

// Medusa: wer sie trifft, weckt Schlangen (höchstens eine je Zug, vier zugleich)
function medusaHurt(run: Run, m: Actor) {
  if (m.hp <= 0 || m.st.sumT === run.turn) return;
  if (run.mobs.filter(o => o.kind === 'schlange' && o.st.mom === m.id).length >= HUNTER.snakes) return;
  const spot = DIRS4.map(([ox, oy]) => [m.x + ox, m.y + oy]).find(([x, y]) => isFree(run, x, y));
  if (!spot) return;
  m.st.sumT = run.turn;
  const s = spawnMob(run, 'schlange', spot[0], spot[1]);
  s.awake = true; s.st.mom = m.id;
  say(run, 'Aus Medusas Haar fällt eine Schlange!');
}

// Anzeige oben: Zugzähler und Warnung vor dem nächsten Jäger
export function hunterInfo(run: Run): { text: string; col: string } | null {
  if (!run.hunt) return null;
  const t = run.floorTurns ?? 0, h = run.hunt;
  if (h.n) return { text: `Nächster Jäger: ${Math.max(0, h.next - t)} Züge`, col: '#b13e53' };
  if (t >= HUNTER.first - 10) return { text: `Die Jagd beginnt bald ... ${Math.max(0, HUNTER.first - t)}`, col: '#b13e53' };
  if (t >= HUNTER.first - HUNTER.warn) return { text: 'Etwas verfolgt dich ...', col: '#ef7d57' };
  return { text: `Züge: ${t}`, col: '#566c86' };
}

function ignite(run: Run, x: number, y: number, turns = 3) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x, t = run.tiles[i];
  if (t === T.BARREL) { if (!run.fuses.has(i)) run.fuses.set(i, 1); return; }
  if (!walkable(t) || t === T.STAIRS) return;
  run.fire.set(i, Math.max(run.fire.get(i) ?? 0, t === T.GRASS ? turns + 1 : turns));
}

// Fester Wert je Feld und Zug (statt Zufall): Brandspuren und Lunten verändern den Zufallsstrom nicht
const spot = (x: number, y: number, s: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0;

// Explosion. r = 1: Quadrat 3×3 (Bombe). r ≥ 2: rund (Fass), nur was die Druckwelle vom Zentrum
// aus erreicht – nicht durch Wände; im äußeren Ring 60 % Schaden. Der Boden verbrennt (bleibt Brandfläche),
// nahe am Zentrum glimmt er kurz weiter.
export function explode(run: Run, x: number, y: number, r = 1, barrel = false) {
  const p = run.p;
  run.fx.push({ k: 'boom', x, y, r, barrel }, { k: 'shake', n: r >= 2 ? 9 : 6 });
  const ring = (xx: number, yy: number) => Math.max(Math.abs(xx - x), Math.abs(yy - y));
  const blast = new Set<number>();
  for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
    if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
    const dx = xx - x, dy = yy - y;
    if (r >= 2 && (dx * dx + dy * dy > r * r + 1 || !los(run.tiles, x, y, xx, yy))) continue;
    blast.add(yy * W + xx);
  }
  const chain: number[] = [];
  if (run.hazards.length) run.hazards = run.hazards.filter(h => !blast.has(h.y * W + h.x)); // die Druckwelle zerstört Fallen
  for (const i of blast) {
    const xx = i % W, yy = (i / W) | 0, t = run.tiles[i];
    if (t === T.CRACKED) breakWall(run, i);
    else if (t === T.MIMIC) revealMimic(run, i, false);
    else if (t === T.PILLAR) collapse(run, xx, yy);
    else if (t === T.BARREL) chain.push(i);
    else if (t === T.GRASS) ignite(run, xx, yy);
    else if (t === T.FLOOR && r >= 2) {
      const h = spot(xx, yy, run.turn + run.floor * 977);
      if (ring(xx, yy) <= 1 || h % 10 < 6) run.tiles[i] = T.BURNT;
      if (ring(xx, yy) === 1 && h % 3 === 0) ignite(run, xx, yy, 2);
    }
  }
  const dmg = 6 + Math.round(2.5 * run.floor), at = (q: { x: number; y: number }) => blast.has(q.y * W + q.x);
  const dmgAt = (q: { x: number; y: number }) => (ring(q.x, q.y) <= 1 ? dmg : Math.round(dmg * 0.6));
  for (const m of run.mobs.filter(at)) damage(run, m, dmgAt(m), '#ef7d57');
  if (!has(p, 'pulverfass') && at(p)) damage(run, p, Math.ceil(dmgAt(p) * 0.3), '#b13e53');
  for (const i of chain) if (run.tiles[i] === T.BARREL) burst(run, i);
}

function breakWall(run: Run, i: number) {
  run.tiles[i] = T.RUBBLE;
  run.cracks.delete(i);
  run.fx.push({ k: 'debris', x: i % W, y: (i / W) | 0 });
  say(run, 'Die Wand bricht ein!');
}

function burst(run: Run, i: number) {
  run.tiles[i] = T.BURNT;
  run.fuses.delete(i);
  explode(run, i % W, (i / W) | 0, 2, true);
}

// Eine Säule stürzt ein und begräbt, was direkt daneben steht.
function collapse(run: Run, x: number, y: number) {
  run.tiles[y * W + x] = T.RUBBLE;
  run.fx.push({ k: 'debris', x, y });
  say(run, 'Eine Säule stürzt ein!');
  for (const [ox, oy] of DIRS4) {
    const m = mobAt(run, x + ox, y + oy);
    if (m) { stun(run, m, 2); damage(run, m, 8 + run.floor, '#94b0c2'); }
    else if (run.p.x === x + ox && run.p.y === y + oy) damage(run, run.p, 4 + Math.floor(run.floor / 2), '#b13e53');
  }
}

function tickWorld(run: Run) {
  for (const [i, t] of [...run.fuses]) {
    if (run.tiles[i] !== T.BARREL) { run.fuses.delete(i); continue; }
    if (t <= 1) burst(run, i); else run.fuses.set(i, t - 1);
  }
  // Feuer breitet sich über Bewuchs aus und brennt herunter: frisches Feuer springt eher über
  // als verglimmendes; was abgebrannt ist, bleibt Brandfläche
  for (const [i, t] of [...run.fire]) {
    const x = i % W, y = (i / W) | 0, spread = t >= 3 ? 0.7 : t === 2 ? 0.5 : 0.25;
    for (const [ox, oy] of DIRS4) {
      const n = (y + oy) * W + x + ox, nt = run.tiles[n];
      if (nt === T.BARREL) ignite(run, x + ox, y + oy);
      else if (nt === T.GRASS && !run.fire.has(n) && run.rng.chance(spread)) ignite(run, x + ox, y + oy);
    }
    if (t <= 1) { run.fire.delete(i); if (run.tiles[i] === T.GRASS || run.tiles[i] === T.FLOOR) run.tiles[i] = T.BURNT; }
    else run.fire.set(i, t - 1);
  }
}

// ---------- Schaden ----------

// Betäubt ein Ziel. Danach ist es kurz immun, Bosse nur einen Zug lang betäubt.
function stun(run: Run, a: Actor, turns: number) {
  if (a.st.immun) return;
  // betäubte Jäger brechen ihren angekündigten Angriff ab
  if (a.st.zt || a.st.bt || a.st.tt !== undefined) { delete a.st.zt; delete a.st.bt; delete a.st.tt; }
  a.st.stun = (a.boss ? 1 : turns) + (has(run.p, 'frostkern') ? 1 : 0);
}


// true, solange die eigene Aktion des Spielers ausgeführt wird (für Kryomant)
let playerActing = false;

function damage(run: Run, dst: Actor, amt: number, col = '#f4f4f4', crit = false) {
  const p = run.p;
  if (dst.st.sproede) amt *= 1.5;
  if (dst !== p && dst.st.stun && hasNode(p, 'n1_2a') && p.cls === 'magier') amt *= 1.25; // Raureif
  if (dst !== p && dst.st.mark) amt *= 1.3; // Markieren
  amt = Math.max(1, Math.round(amt));
  if (dst === p && p.shield) {
    const ab = Math.min(p.shield, amt);
    p.shield -= ab; amt -= ab;
    if (!p.shield) delete p.st.schild;
    if (amt <= 0) { run.fx.push({ k: 'num', x: p.x, y: p.y, s: 'Schild', col: '#9a4fc0' }); return; }
  }
  // Kryomant: Treffer gegen Betäubte und Bosse geben Mana (TUNE.kryoMana)
  if (dst !== p && playerActing && p.cls === 'magier' && hasNode(p, 'n1_5') && (dst.st.stun || dst.boss)) gain(p, TUNE.kryoMana);
  dst.hp -= amt;
  run.fx.push({ k: 'flash', id: dst.id });
  run.fx.push({ k: 'num', x: dst.x, y: dst.y, s: crit ? `${amt}!` : `${amt}`, col: crit ? '#ffcd75' : col });
  if (dst !== run.p && dst.hp <= 0) kill(run, dst);
  else if (dst.kind === 'medusa' && playerActing) medusaHurt(run, dst);
  // Schutzrune: einmal je Ebene ein Blinzeln, wenn das Leben knapp wird
  if (dst === p && p.hp > 0 && p.hp < p.maxHp * 0.3 && p.cls === 'magier' && hasNode(p, 'n2_2b') && !run.runeUsed) {
    const spot = blinkSpot(run);
    if (spot) { run.runeUsed = true; [p.x, p.y] = spot; say(run, 'Die Schutzrune reißt dich fort!'); }
  }
}

// Brand durch den Magier hält mit Schwelbrand einen Zug länger
const burnT = (p: Player, n: number) => n + (p.cls === 'magier' && hasNode(p, 'n0_2b') ? 1 : 0);

// Bester Zielpunkt für Blinzeln: möglichst weit weg von sichtbaren Gegnern
function blinkSpot(run: Run): [number, number] | null {
  const p = run.p;
  let best: [number, number] | null = null, bs = -1;
  for (let y = p.y - 6; y <= p.y + 6; y++) for (let x = p.x - 6; x <= p.x + 6; x++) {
    if (!isFree(run, x, y) || !run.vis[y * W + x]) continue;
    let s = cheb({ x, y }, p) * 0.1;
    let near = 99;
    for (const m of run.mobs) if (run.vis[m.y * W + m.x]) near = Math.min(near, cheb(m, { x, y }));
    s += near === 99 ? cheb({ x, y }, p) : near;
    if (s > bs) { bs = s; best = [x, y]; }
  }
  return best;
}

function playerHit(run: Run, dst: Actor, base: number, sure = false) {
  const p = run.p, a = p.aff;
  if (a.hexen && (dst.st.brand || dst.st.gift)) base *= 1.3;
  if (p.st.konter) { sure = true; delete p.st.konter; }
  if (dst.boss) base *= (has(p, 'jaeger') ? 1.5 : 1) * (1 + (a.boss ?? 0) / 100);
  if (a.henker && dst.hp * 2 < dst.maxHp) base *= 1 + a.henker / 100;
  if (blutzorn(p) && p.hp * 2 < p.maxHp) base *= 1.3;
  const crit = sure || run.rng.chance(p.crit);
  if (has(p, 'giftzahn')) dst.st.gift = 3;
  if (a.gift && run.rng.chance(a.gift / 100)) dst.st.gift = 3;
  if (a.brand && run.rng.chance(a.brand / 100)) dst.st.brand = 3;
  if (a.frost && run.rng.chance(Math.min(35, a.frost) / 100)) stun(run, dst, 1);
  damage(run, dst, (crit ? base * 2 : base) - dst.def, '#f4f4f4', crit);
  if (has(p, 'donnerfaust') && ++p.hits % 5 === 0) {
    run.fx.push({ k: 'shake', n: 4 });
    for (const m of run.mobs.filter(m => m !== dst && cheb(m, dst) <= 1)) damage(run, m, base * 0.6, '#ffcd75');
  }
}

// Nebenwirkungen einfacher Angriffe: Spalten, Durchstoßen, Überspringen
function sideHits(run: Run, dst: Actor, base: number, col: string) {
  const p = run.p, a = p.aff;
  if (a.spalt) for (const m of run.mobs.filter(m => m !== dst && cheb(m, p) <= 1)) damage(run, m, (base * a.spalt) / 100 - m.def, col);
  if (a.stoss) {
    const m = mobAt(run, dst.x + Math.sign(dst.x - p.x), dst.y + Math.sign(dst.y - p.y));
    if (m && m !== dst) damage(run, m, (base * a.stoss) / 100 - m.def, col);
  }
  if (a.kette) {
    let best: Actor | undefined, bd = 3;
    for (const m of run.mobs) { const d = cheb(m, dst); if (m !== dst && d < bd && run.vis[m.y * W + m.x]) { bd = d; best = m; } }
    if (best) {
      run.fx.push({ k: 'bolt', x0: dst.x, y0: dst.y, x1: best.x, y1: best.y, col });
      damage(run, best, (base * a.kette) / 100 - best.def, col);
    }
  }
}

// Tödlicher Treffer? Eisenwille rettet einmal pro Ebene.
function fatal(run: Run) {
  const p = run.p;
  if (p.hp > 0) return;
  if (has(p, 'eisenwille') && !run.willUsed) { run.willUsed = true; p.hp = 1; say(run, 'Eisenwille hält dich am Leben!'); return; }
  p.hp = 0;
  run.mode = 'dead';
  run.fx.push({ k: 'pdeath', x: p.x, y: p.y });
  say(run, 'Du bist gefallen.');
}

function kill(run: Run, m: Actor) {
  const p = run.p;
  run.mobs = run.mobs.filter(o => o !== m);
  run.fx.push({ k: 'die', x: m.x, y: m.y, kind: m.kind });
  run.kills++;
  p.exp += m.xp;
  run.souls += Math.max(1, Math.round((m.xp / 10) * p.soulMul));
  p.gold += Math.ceil((m.xp / 6) * (1 + (p.aff.gold ?? 0) / 100));
  if (p.aff.ausdauer) gain(p, p.aff.ausdauer);
  if (p.aff.asche && !m.boss) {
    run.fx.push({ k: 'boom', x: m.x, y: m.y, r: 1 });
    for (const o of run.mobs.filter(o => cheb(o, m) <= 1)) damage(run, o, 4 + p.lvl, '#ef7d57');
  }
  if (m.st.mark && p.cls === 'waldlaeufer') gain(p, 2); // Markieren
  // Klingenrausch: ein Sieg gibt einen freien Zug, höchstens alle 3 Züge
  if (p.cls === 'krieger' && playerActing && hasNode(p, 'n1_5') && !p.st.rausch) { p.st.rausch = 3; freeTurn = true; say(run, 'Klingenrausch!'); }
  if (p.cls === 'magier' && m.st.brand && hasNode(p, 'n0_5')) {
    // Flächenbrand: brennende Gegner explodieren und stecken Nachbarn an
    run.fx.push({ k: 'boom', x: m.x, y: m.y, r: 1 });
    for (const o of run.mobs.filter(o => cheb(o, m) <= 1)) {
      if (o.hp <= 0) continue;
      o.st.brand = Math.max(o.st.brand ?? 0, burnT(p, 2));
      damage(run, o, 4 + p.lvl, '#ef7d57');
    }
  }
  if (run.target === m.id) run.target = 0;
  if (MOBS[m.kind].hunter) tele(run, `huntKill_${m.kind}`);
  if (p.vamp) p.hp = Math.min(p.maxHp, p.hp + p.vamp);
  if (p.cls === 'waldlaeufer') gain(p, 1);
  if (m.boss) {
    say(run, `${m.name} ist besiegt!`);
    run.souls += Math.round(25 * p.soulMul);
    run.fx.push({ k: 'shake', n: 8 });
    if (run.floor >= LAST_FLOOR) { run.mode = 'win'; return; }
    run.tiles[m.y * W + m.x] = T.STAIRS;
    p.potions++;
  } else if (m.kind === 'mimik') {
    // Beute wie aus einer Truhe, etwas Gold dazu, manchmal ein besseres Stück
    const up = run.rng.chance(HAZARD.mimicRarUp) ? 1 : 0;
    tele(run, 'mimicKilled'); if (up) tele(run, 'mimicRarUp');
    const g = Math.round((2 + run.floor / 2) * (1 + (p.aff.gold ?? 0) / 100));
    p.gold += g;
    say(run, `Der Mimik ist besiegt: ${g} Gold${up ? ', und er hütete etwas Besonderes' : ''}.`);
    chestLoot(run, 'Mimik', up);
  } else if (m.elite) {
    p.keys++;
    p.potions++;
    say(run, `${m.name} lässt einen Schlüssel und einen Heiltrank fallen.`);
  } else if (run.rng.chance(0.025)) {
    p.potions++;
    say(run, `${m.name} lässt einen Heiltrank fallen.`);
  }
  checkLevel(run);
}

export const TREE_EVERY = 3;
export function checkLevel(run: Run) {
  const p = run.p;
  if (run.mode !== 'play' || p.exp < xpNeed(p.lvl)) return;
  p.exp -= xpNeed(p.lvl);
  p.lvl++;
  p.maxHp += 3;
  p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.2));
  say(run, `Stufe ${p.lvl} erreicht!`);
  // jede dritte Stufe (3, 6, 9 …) ein Fertigkeitspunkt, sonst eine Gabe
  // höchstens TUNE.treePtsMax Punkte je Lauf, danach Gaben
  const point = p.lvl % TREE_EVERY === 0 && (p.ptsGot ?? 0) < TUNE.treePtsMax;
  if (point) { p.pts++; p.ptsGot = (p.ptsGot ?? 0) + 1; } else run.perkQ++;
  settlePoints(run);
  if (point && p.pts > 0) run.mode = 'tree';
  else nextChoice(run);
}

// Knoten, die jetzt gelernt werden können
export function availableNodes(run: Run): string[] {
  const p = run.p;
  return run.pool.filter(id => {
    const n = treeNode(p.cls, id);
    if (!n || n.bundled || p.tree.includes(id) || (n.parent && !p.tree.includes(n.parent)) || (n.excl && p.tree.includes(n.excl))) return false;
    if (n.needAny && !n.needAny.some(q => p.tree.includes(q))) return false;
    return p.tree.filter(q => treeNode(p.cls, q)?.branch === n.branch).length >= n.minPts;
  });
}

// Restpunkt: Punkte, für die es keinen Knoten mehr gibt, werden zu Gaben
function settlePoints(run: Run) {
  const p = run.p;
  if (p.pts <= 0 || availableNodes(run).length) return;
  run.perkQ += p.pts;
  p.rest += p.pts;
  p.pts = 0;
}

function nextChoice(run: Run) {
  if (run.mode !== 'play' || run.perkQ <= 0) return;
  run.perkQ--;
  offerPerks(run);
}

const nodeName = (p: Player, id: string) => nodeText(p.cls, id).name;

function learnNode(run: Run, id: string) {
  const p = run.p, n = treeNode(p.cls, id)!, i = n.branch;
  p.tree.push(id);
  // gebündelte Knoten (T2a) kommen mit
  for (const b of treeNodes(p.cls)) if (b.bundled && b.parent === id && run.pool.includes(b.id) && !p.tree.includes(b.id)) { p.tree.push(b.id); say(run, `Dazu: ${nodeName(p, b.id)}`); }
  if (n.spell) { (p.spells ??= []).push(n.spell); say(run, `${p.cls === 'magier' ? 'Neuer Zauber' : 'Neue Fähigkeit'}: ${NEW_SKILLS[n.spell].name} [${2 + p.spells.length}]`); return; }
  if (n.tier !== '1' && n.tier !== '4a' && n.tier !== '4b') { say(run, `Gelernt: ${nodeName(p, id)}`); return; }
  if (n.tier === '1') p.skillLvl[i] = Math.max(1, p.skillLvl[i]);
  else if (n.tier === '4a' || n.tier === '4b') { p.skillLvl[i] = 2; p.skillMod[i] = n.tier === '4a' ? 1 : 2; }
  say(run, `${CLASSES[p.cls].skills[i].name}: Rang ${RANKS[p.skillLvl[i]]}${p.skillMod[i] ? ` – ${skillModName(p, i)}` : ''}`);
}

function offerPerks(run: Run) {
  const p = run.p, n = p.picks;
  const ch = run.rng.shuffle(Object.keys(PERKS).filter(id => (!PERKS[id].cls || PERKS[id].cls === p.cls) && p.perks.filter(q => q === id).length < 3)).slice(0, n);
  run.perkChoices = ch;
  run.mode = 'perk';
}

function applyPerk(run: Run, id: string) {
  const p = run.p;
  if (RELICS[id]) {
    p.relics.push(id);
    if (id === 'blutpakt') { p.atk += 3; p.maxHp = Math.max(5, Math.round(p.maxHp * 0.8)); p.hp = Math.min(p.hp, p.maxHp); }
    say(run, `Reliquie: ${RELICS[id].name}`);
    return;
  }
  if (id.startsWith('skill')) {
    const i = +id[5];
    // Karte aus einem älteren Spielstand: auch im Baum vermerken
    if (id[6]) { p.skillLvl[i] = 2; p.skillMod[i] = id[6] === 'a' ? 1 : 2; }
    else p.skillLvl[i] = Math.max(1, p.skillLvl[i]);
    p.tree = [...new Set([...p.tree, ...nodesFromRanks(p.skillLvl, p.skillMod)])];
    say(run, `${CLASSES[p.cls].skills[i].name}: Rang ${RANKS[p.skillLvl[i]]}${id[6] ? ` – ${skillModName(p, i)}` : ''}`);
    return;
  }
  p.perks.push(id);
  switch (id) {
    case 'flink': addAff(p, 'flink', 8); break;
    case 'gier': addAff(p, 'gold', 40); break;
    case 'weitblick': addAff(p, 'sicht', 2); break;
    case 'brandklinge': addAff(p, 'brand', 25); break;
    case 'giftklinge': addAff(p, 'gift', 25); break;
    case 'frosthauch': addAff(p, 'frost', 10); break;
    case 'riese': addAff(p, 'boss', 30); break;
    case 'sprengsatz': p.bombs += 2; break;
    case 'berserker': p.atk += 2; p.def -= 1; break;
    case 'atem': addAff(p, 'regen', 1); break;
    case 'pilz': addAff(p, 'fund', 8); break;
    case 'ausdauer': addAff(p, 'ausdauer', 1); break;
    case 'henker': addAff(p, 'henker', 25); break;
    case 'spalter': addAff(p, 'spalt', 40); break;
    case 'kettenblitz': addAff(p, 'kette', 50); break;
    case 'durchschuss': addAff(p, 'stoss', 60); break;
    case 'zaeh': p.maxHp += 6; p.hp = Math.min(p.maxHp, p.hp + 6); break;
    case 'scharf': p.atk += 1; break;
    case 'panzer': p.def += 1; break;
    case 'vampir': p.vamp += 2; break;
    case 'krit': p.crit += 0.12; break;
    case 'quelle': p.resMax += 3; break;
    case 'meister': p.pow += 0.25; break;
    case 'vorrat': p.potions += 2; break;
    case 'dornen': p.thorns += 2; break;
    case 'seelen': p.soulMul += 0.5; break;
  }
  say(run, `Neue Gabe: ${PERKS[id].name}`);
  for (const s of SYNERGIES) {
    if (p.syn.includes(s.id) || !s.need.every(q => p.perks.includes(q))) continue;
    p.syn.push(s.id);
    if (s.id === 'rausch') addAff(p, 'vamp', 3); else addAff(p, s.id, 1);
    say(run, `Synergie: ${s.name} – ${s.desc}`);
  }
}

// ---------- Spieleraktionen ----------

function nearestMob(run: Run, range: number): Actor | undefined {
  const tg = run.target ? run.mobs.find(m => m.id === run.target) : undefined;
  if (tg && run.vis[tg.y * W + tg.x] && cheb(tg, run.p) <= range) return tg;
  let best: Actor | undefined, bd = 99;
  for (const m of run.mobs) {
    if (!run.vis[m.y * W + m.x]) continue;
    const d = cheb(m, run.p);
    if (d <= range && d < bd) { bd = d; best = m; }
  }
  return best;
}

function gain(p: Player, n: number) { p.res = Math.max(0, Math.min(p.resMax, p.res + n)); }

function openChest(run: Run, i: number) {
  const p = run.p, cursed = run.tiles[i] === T.CURSED;
  run.tiles[i] = T.CHEST_OPEN;
  if (cursed) { takeItem(run, genItem(run, true), 'Verfluchte Truhe'); return; }
  chestLoot(run, 'Truhe');
}

// Inhalt einer Truhe (auch die Beute eines Mimiks). bump hebt die Seltenheit eines Gegenstands.
function chestLoot(run: Run, from: string, bump = 0) {
  const p = run.p;
  for (let k = has(p, 'muenze') ? 2 : 1; k > 0; k--) {
    const r = run.rng.next();
    if (r < 0.22) { p.potions++; say(run, `${from}: ein Heiltrank.`); }
    else if (r < 0.38) { p.bombs += 2; say(run, `${from}: zwei Bomben.`); }
    else if (r < 0.70) takeItem(run, genItem(run, false, bump), from);
    else if (r < 0.80) takeItem(run, genConsumable(run), from);
    else if (r < 0.92) { const g = Math.round((8 + run.floor * 2) * (1 + (p.aff.gold ?? 0) / 100)); p.gold += g; say(run, `${from}: ${g} Gold.`); }
    else { const n = Math.round(10 * p.soulMul); run.souls += n; say(run, `${from}: ${n} Seelensplitter.`); }
  }
  if (p.aff.midas) p.gold += 10 + run.floor * 2;
}

function useSkill(run: Run, i: number): boolean {
  const p = run.p, sk = i < 3 ? CLASSES[p.cls].skills[i] : NEW_SKILLS[spellAt(p, i) ?? ''];
  if (!sk) return false;
  if (p.cls === 'magier' && i === 2 && p.st.riss) { say(run, `Zeitriss: noch ${p.st.riss} Züge.`); return false; }
  const cost = skillCost(p, i);
  if (!canPay(p, cost)) { say(run, `Nicht genug ${CLASSES[p.cls].resName}.`); return false; }
  if (i >= 3) {
    if (!castSpell(run, spellAt(p, i)!)) return false;
    payRes(run, cost);
    delete p.st.nachhall;
    return true;
  }
  const atk = playerAtk(p), L = p.skillLvl[i], mod = p.skillMod[i], sp = p.pow * (1 + 0.3 * L);
  const around = (r: number) => run.mobs.filter(m => cheb(m, p) <= r && run.vis[m.y * W + m.x]);
  const noTarget = () => { say(run, 'Kein Ziel in Reichweite.'); return false; };
  let refund = 0; // Wut, die erst nach dem Bezahlen gutgeschrieben wird
  switch (`${p.cls}${i}`) {
    case 'krieger0': {
      const t = nearestMob(run, 1);
      if (!t) return noTarget();
      stun(run, t, L ? 3 : 2);
      run.fx.push({ k: 'lunge', id: 0, dx: Math.sign(t.x - p.x), dy: Math.sign(t.y - p.y) }, { k: 'bash', x: t.x, y: t.y, dx: Math.sign(t.x - p.x), dy: Math.sign(t.y - p.y) });
      playerHit(run, t, atk * 1.3 * sp + 1);
      if (mod === 2 && t.hp > 0) {
        // Rammstoß: bis zu zwei Felder zurück, ein Hindernis tut weh
        const dx = Math.sign(t.x - p.x), dy = Math.sign(t.y - p.y);
        let k = 0;
        while (k < 2 && isFree(run, t.x + dx, t.y + dy)) { moveMob(run, t, t.x + dx, t.y + dy); k++; if (t.hp <= 0) break; }
        if (k < 2 && t.hp > 0) damage(run, t, 4 + p.lvl, '#ffcd75');
      }
      // Vergelter: betäubt alle Nachbarn
      if (hasNode(p, 'n0_5')) for (const o of around(1)) if (o !== t) stun(run, o, 2);
      break;
    }
    case 'krieger1': {
      const ts = around(mod === 1 ? 2 : 1);
      if (!ts.length) return noTarget();
      for (const t of ts) {
        playerHit(run, t, atk * 1.7 * sp);
        if (hasNode(p, 'n1_2b') && t.hp > 0) t.st.gift = 3; // Gezackte Klinge
      }
      if (hasNode(p, 'n1_2a')) refund = ts.length; // Schwungkraft
      if (mod === 2) { const n = Math.min(p.maxHp - p.hp, 2 * ts.length); if (n > 0) { p.hp += n; run.fx.push({ k: 'num', x: p.x, y: p.y, s: `+${n}`, col: '#a7f070' }); } }
      run.fx.push({ k: 'shake', n: 3 });
      break;
    }
    case 'krieger2':
      p.st.stark = 7 + 3 * L;
      if (mod === 1) for (const t of around(1)) stun(run, t, 1);
      if (mod === 2) p.st.wall = p.st.stark;
      // Einschüchterung: Gegner ringsum schlagen schwächer, solange der Schrei wirkt
      if (hasNode(p, 'n2_2b')) for (const t of around(2)) t.st.schwach = p.st.stark + 1;
      say(run, 'Kriegsschrei!');
      break;
    case 'magier0': {
      const t = nearestMob(run, 7);
      if (!t) return noTarget();
      run.fx.push({ k: 'fireball', x0: p.x, y0: p.y, x1: t.x, y1: t.y, r: mod === 1 ? 2 : 1 }, { k: 'shake', n: 3 });
      for (let y = t.y - 1; y <= t.y + 1; y++) for (let x = t.x - 1; x <= t.x + 1; x++) ignite(run, x, y, 2);
      for (const m of run.mobs.filter(m => cheb(m, t) <= (mod === 1 ? 2 : 1))) {
        m.st.brand = burnT(p, 2);
        damage(run, m, (m === t ? atk * 0.8 + p.lvl * 0.3 : 3) * sp - m.def, '#ef7d57');
      }
      if (mod === 2) {
        const o = run.mobs.filter(m => m !== t && run.vis[m.y * W + m.x] && cheb(m, p) <= 7).sort((a, b) => cheb(a, p) - cheb(b, p))[0];
        if (o) {
          run.fx.push({ k: 'fireball', x0: p.x, y0: p.y, x1: o.x, y1: o.y, r: 0 });
          o.st.brand = burnT(p, 2);
          damage(run, o, (atk * 0.8 + p.lvl * 0.3) * sp * 0.6 - o.def, '#ef7d57');
        }
      }
      break;
    }
    case 'magier1': {
      const ts = around(mod === 1 ? 3 : 2);
      if (!ts.length) return noTarget();
      run.fx.push({ k: 'nova', x: p.x, y: p.y, r: mod === 1 ? 3 : 2 });
      for (const i of [...run.fire.keys()]) if (cheb({ x: i % W, y: (i / W) | 0 }, p) <= 2) run.fire.delete(i);
      for (const t of ts) { stun(run, t, L ? 2 : 1); delete t.st.brand; damage(run, t, 3 * sp, '#73eff7'); if (mod === 2 && t.hp > 0) t.st.sproede = 4; }
      if (hasNode(p, 'n1_2b')) p.st.eis = 2; // Eisrüstung
      break;
    }
    case 'magier2': {
      const best = blinkSpot(run);
      if (!best) return noTarget();
      const from = { x: p.x, y: p.y };
      [p.x, p.y] = best;
      if (L >= 1) p.st.dodge = Math.max(p.st.dodge ?? 0, 1);
      if (mod === 2) { gain(p, 3); p.st.dodge = 2; }
      if (mod === 1) {
        run.fx.push({ k: 'boom', x: from.x, y: from.y, r: 1 });
        for (const m of run.mobs.filter(m => cheb(m, from) <= 1)) damage(run, m, 5 * p.pow, '#9a4fc0');
      }
      if (hasNode(p, 'n2_2a')) p.st.nachhall = 1;
      // Zeitriss: kein Zug, danach Abklingzeit
      if (hasNode(p, 'n2_5')) { p.st.riss = 3; freeTurn = true; }
      payRes(run, cost);
      return true;
    }
    case 'waldlaeufer0': {
      const t = nearestMob(run, 8);
      if (!t) return noTarget();
      run.fx.push({ k: 'arrow', x0: p.x, y0: p.y, x1: t.x, y1: t.y, col: '#ffcd75', heavy: true });
      const weak = hasNode(p, 'n0_2b') && run.rng.chance(0.15); // Schwachstelle
      playerHit(run, t, atk * 1.8 * sp * shotBonus(p), (mod === 2 && t.hp >= t.maxHp) || weak);
      if (weak && t.hp > 0) stun(run, t, 1);
      if (mod === 1) {
        const b = mobAt(run, t.x + Math.sign(t.x - p.x), t.y + Math.sign(t.y - p.y));
        if (b && b !== t) damage(run, b, atk * 1.1 * sp - b.def, '#ffcd75');
      }
      break;
    }
    case 'waldlaeufer1': {
      if (run.traps.some(t => t.x === p.x && t.y === p.y)) { say(run, 'Hier liegt schon eine Falle.'); return false; }
      run.traps.push({ x: p.x, y: p.y });
      if (mod === 2) for (let k = 1; k <= 2; k++) {
        const x = p.x + p.dir[0] * k, y = p.y + p.dir[1] * k;
        if (!walkable(run.tiles[y * W + x])) break;
        if (!run.traps.some(t => t.x === x && t.y === y)) run.traps.push({ x, y });
      }
      while (run.traps.length > maxTraps(p)) run.traps.shift();
      break;
    }
    case 'waldlaeufer2': {
      const from = { x: p.x, y: p.y }, wasAdj = run.mobs.some(m => cheb(m, p) <= 1);
      let moved = 0;
      for (let k = 0; k < 2 + (L ? 1 : 0) + (mod === 1 ? 1 : 0); k++) {
        const nx = p.x + p.dir[0], ny = p.y + p.dir[1];
        if (!isFree(run, nx, ny)) break;
        p.x = nx; p.y = ny; moved++;
      }
      if (!moved) { say(run, 'Kein Platz zum Rollen.'); return false; }
      p.st.dodge = mod === 1 ? 2 : 1;
      if (hasNode(p, 'n2_2a')) p.st.schatten = 1; // Schattenschritt
      if (hasNode(p, 'n2_2b') && wasAdj) refund = 1; // Leichtfuß
      // Minenfeld: Falle am Startfeld
      if (hasNode(p, 'n1_5') && !run.traps.some(t => t.x === from.x && t.y === from.y)) { run.traps.push(from); while (run.traps.length > maxTraps(p)) run.traps.shift(); }
      if (mod === 2) {
        const t = nearestMob(run, shotRange(p));
        if (t) { run.fx.push({ k: 'arrow', x0: p.x, y0: p.y, x1: t.x, y1: t.y, col: '#ffcd75', heavy: false }); playerHit(run, t, atk * 0.75 * shotBonus(p)); }
      }
      break;
    }
  }
  payRes(run, cost);
  if (refund) gain(p, refund);
  delete p.st.nachhall;
  return true;
}

// Zeitriss: die nächste Aktion lässt die Gegner aus
let freeTurn = false;

// Gerade Linie (Bresenham) vom Spieler zum Ziel und darüber hinaus, bis zur Wand
export function lineFrom(run: Run, tx: number, ty: number, len: number): [number, number][] {
  const p = run.p, out: [number, number][] = [];
  const dx = tx - p.x, dy = ty - p.y, n = Math.max(Math.abs(dx), Math.abs(dy));
  if (!n) return out;
  for (let k = 1; k <= len; k++) {
    const x = p.x + Math.round((dx * k) / n), y = p.y + Math.round((dy * k) / n);
    if (x < 0 || y < 0 || x >= W || y >= H || !walkable(run.tiles[y * W + x])) break;
    out.push([x, y]);
  }
  return out;
}

// Neue Fähigkeiten aus dem Baum (Plätze 4–6)
function castSpell(run: Run, id: string): boolean {
  const p = run.p, atk = playerAtk(p);
  if (id === 'flammenwand') {
    const t = nearestMob(run, 7);
    if (!t) { say(run, 'Kein Ziel in Reichweite.'); return false; }
    const dx = t.x - p.x, dy = t.y - p.y;
    const s: [number, number] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    const k = Math.max(1, Math.min(2, cheb(t, p) - 1)), cx = p.x + s[0] * k, cy = p.y + s[1] * k;
    for (const o of [-1, 0, 1]) ignite(run, cx - s[1] * o, cy + s[0] * o, 4);
    run.fx.push({ k: 'boom', x: cx, y: cy, r: 0 });
    say(run, 'Flammenwand!');
    return true;
  }
  if (id === 'eislanze') {
    const t = nearestMob(run, 6);
    if (!t) { say(run, 'Kein Ziel in Reichweite.'); return false; }
    const path = lineFrom(run, t.x, t.y, 6), end = path[path.length - 1] ?? [t.x, t.y];
    run.fx.push({ k: 'bolt', x0: p.x, y0: p.y, x1: end[0], y1: end[1], col: '#73eff7' });
    for (const [x, y] of path) {
      const m = mobAt(run, x, y);
      if (!m) continue;
      const stunned = !!m.st.stun;
      damage(run, m, (atk * 0.9 + p.lvl * 0.4) * p.pow * (stunned ? 2 : 1) - m.def, '#73eff7');
      if (stunned && m.hp > 0) { delete m.st.stun; m.st.immun = 3; } // "Zerschmettern"
    }
    return true;
  }
  if (id === 'arkanschild') {
    p.shield = 8 + p.lvl;
    p.st.schild = 5;
    say(run, 'Arkanschild!');
    return true;
  }
  if (id === 'schildwurf') {
    const t = nearestMob(run, 4);
    if (!t) { say(run, 'Kein Ziel in Reichweite.'); return false; }
    run.fx.push({ k: 'arrow', x0: p.x, y0: p.y, x1: t.x, y1: t.y, col: '#94b0c2', heavy: true });
    playerHit(run, t, atk * 0.9 * p.pow);
    return true;
  }
  if (id === 'sturmangriff') {
    // Sturm in gerader Linie bis neben das Ziel; ohne freien Weg kein Sturm
    const t = nearestMob(run, 5);
    if (!t) { say(run, 'Kein Ziel in Reichweite.'); return false; }
    let stop = -1;
    const path = lineFrom(run, t.x, t.y, 5);
    if (cheb(t, p) > 1) {
      for (let k = 0; k < path.length && k < 4; k++) {
        if (!isFree(run, path[k][0], path[k][1])) break;
        if (cheb(t, { x: path[k][0], y: path[k][1] }) <= 1) { stop = k; break; }
      }
      if (stop < 0) { say(run, 'Kein freier Weg zum Ziel.'); return false; }
      [p.x, p.y] = path[stop];
    }
    p.dir = [Math.sign(t.x - p.x), Math.sign(t.y - p.y)];
    run.fx.push({ k: 'lunge', id: 0, dx: p.dir[0], dy: p.dir[1] });
    playerHit(run, t, atk * 1.2 * p.pow);
    return true;
  }
  if (id === 'markieren') {
    const t = nearestMob(run, shotRange(p) + 3);
    if (!t) { say(run, 'Kein Ziel in Reichweite.'); return false; }
    for (const m of run.mobs) delete m.st.mark;
    t.st.mark = 7; // 6 Züge des Gegners
    run.fx.push({ k: 'num', x: t.x, y: t.y, s: 'markiert', col: '#ffcd75' });
    return true;
  }
  if (id === 'fangnetz') {
    const t = nearestMob(run, 4);
    if (!t) { say(run, 'Kein Ziel in Reichweite.'); return false; }
    t.st.netz = 4; // 3 Züge des Gegners
    run.fx.push({ k: 'arrow', x0: p.x, y0: p.y, x1: t.x, y1: t.y, col: '#c9d4dc', heavy: false });
    say(run, `${t.name} hängt im Netz.`);
    return true;
  }
  if (id === 'rauchbombe') {
    p.st.rauch = 4; p.st.rx = p.x; p.st.ry = p.y;
    run.fx.push({ k: 'boom', x: p.x, y: p.y, r: 2 });
    say(run, 'Rauchbombe!');
    return true;
  }
  if (id === 'herausforderung') {
    const ts = run.mobs.filter(m => cheb(m, p) <= 4 && run.vis[m.y * W + m.x]);
    if (!ts.length) { say(run, 'Kein Ziel in Reichweite.'); return false; }
    for (const m of ts) { m.awake = true; m.st.taunt = 2; } // Schützen schweigen einen Zug
    say(run, 'Herausforderung!');
    return true;
  }
  return false;
}

function useUlt(run: Run): boolean {
  const p = run.p, u = ULT[p.cls], atk = playerAtk(p);
  if (p.lvl < ULT_LEVEL) { say(run, `${u.name}: erst ab Stufe ${ULT_LEVEL}.`); return false; }
  if (p.ultCd > 0) { say(run, `${u.name} ist in ${p.ultCd} Zügen bereit.`); return false; }
  const seen = (m: Actor) => !!run.vis[m.y * W + m.x];
  if (p.cls === 'krieger') {
    const ts = run.mobs.filter(m => cheb(m, p) <= 2 && seen(m));
    if (!ts.length) { say(run, 'Kein Ziel in Reichweite.'); return false; }
    run.fx.push({ k: 'boom', x: p.x, y: p.y, r: 2 }, { k: 'shake', n: 6 });
    for (const t of ts) { stun(run, t, 2); playerHit(run, t, atk * 3 * p.pow); }
  } else if (p.cls === 'magier') {
    const t = nearestMob(run, 8);
    if (!t) { say(run, 'Kein Ziel in Reichweite.'); return false; }
    const c = { x: t.x, y: t.y };
    run.fx.push({ k: 'bolt', x0: p.x, y0: p.y - 6, x1: c.x, y1: c.y, col: '#ef7d57' }, { k: 'boom', x: c.x, y: c.y, r: 2 }, { k: 'shake', n: 8 });
    for (let y = c.y - 1; y <= c.y + 1; y++) for (let x = c.x - 1; x <= c.x + 1; x++) ignite(run, x, y, 2);
    for (const m of run.mobs.filter(m => cheb(m, c) <= 2)) { m.st.brand = 3; damage(run, m, (14 + p.lvl * 1.5) * p.pow - m.def, '#ef7d57'); }
  } else {
    const ts = run.mobs.filter(m => cheb(m, p) <= 9 && seen(m));
    if (!ts.length) { say(run, 'Kein Ziel in Reichweite.'); return false; }
    for (const t of ts) { run.fx.push({ k: 'bolt', x0: p.x, y0: p.y, x1: t.x, y1: t.y, col: '#ffcd75' }); playerHit(run, t, atk * 0.9 * p.pow); }
  }
  say(run, `${u.name}!`);
  p.ultCd = u.cost;
  return true;
}

export function act(run: Run, a: Action): void {
  const p = run.p;
  if (run.mode === 'perk') {
    if (a.t === 'perk' && run.perkChoices[a.i]) {
      applyPerk(run, run.perkChoices[a.i]);
      run.mode = 'play';
      nextChoice(run);
      checkLevel(run);
    }
    return;
  }
  if (run.mode === 'tree') {
    if (a.t === 'learn' && p.pts > 0 && availableNodes(run).includes(a.id)) {
      learnNode(run, a.id);
      p.pts--;
      settlePoints(run);
      if (p.pts > 0) return;
    } else if (a.t !== 'later') return;
    run.mode = 'play';
    nextChoice(run);
    checkLevel(run);
    return;
  }
  if (a.t === 'tree') {
    // Baum öffnen kostet keinen Zug; unverwendbare Punkte werden jetzt zu Gaben
    settlePoints(run);
    if (p.pts > 0) run.mode = 'tree';
    else nextChoice(run);
    return;
  }
  if (run.mode === 'shop') {
    if (a.t === 'leave') run.mode = 'play';
    else if (a.t === 'buy') {
      const o = run.shop[a.i];
      if (!o || o.sold) return;
      if (p.gold < o.price) { say(run, 'Dafür reicht dein Gold nicht.'); return; }
      const it = o.kind === 'forge' ? forgeTarget(p) : null;
      if (o.kind === 'forge' && !it) { say(run, 'Der Schmied findet nichts mehr zu verbessern.'); return; }
      p.gold -= o.price;
      if (o.kind === 'forge' || o.kind === 'reroll') {
        if (it) {
          if (it.slot === 0) { it.atk++; p.atk++; } else { it.def++; p.def++; }
          it.plus = (it.plus ?? 0) + 1;
          it.name = `${it.name.replace(/ \+\d$/, '')} +${it.plus}`;
          say(run, `Schmied: ${it.name}.`);
        } else {
          run.shop = [...run.shop.filter(q => q.kind !== 'item'), ...wares(run)];
          run.shop.sort((a, b) => SHOP_ORDER.indexOf(a.kind) - SHOP_ORDER.indexOf(b.kind));
          say(run, 'Der Händler bringt neue Ware.');
        }
        o.left = (o.left ?? 1) - 1;
        o.price = Math.ceil(o.price * 1.5);
        if (o.left <= 0) o.sold = true;
      } else if (o.kind === 'potion' || o.kind === 'bomb') {
        if (o.kind === 'potion') p.potions++; else p.bombs++;
        // begrenzter Vorrat, jedes weitere Stück wird teurer
        o.left = (o.left ?? (o.kind === 'potion' ? 3 : 2)) - 1;
        o.price = Math.ceil(o.price * 1.25);
        if (o.left <= 0) o.sold = true;
      } else { o.sold = true; takeItem(run, o.item!, 'Händler'); }
    }
    return;
  }
  if (run.mode !== 'play') return;
  if (a.t === 'equip' && p.bag[a.i]?.use) { if (useItem(run, a.i)) endTurn(run); return; }
  if (a.t === 'use') { const i = p.bag.findIndex(it => it.use === a.id); if (i >= 0 && useItem(run, i)) endTurn(run); return; }
  if (manage(run, a)) return;
  if (a.t === 'target') {
    const m = mobAt(run, a.x, a.y);
    run.target = m && run.vis[m.y * W + m.x] ? m.id : 0;
    return;
  }
  let used = false;
  playerActing = true; freeTurn = false; shotUsed = false;
  const px = p.x, py = p.y, adj0 = run.mobs.filter(m => cheb(m, p) <= 1);
  switch (a.t) {
    case 'move': {
      const nx = p.x + a.dx, ny = p.y + a.dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) break;
      p.dir = [a.dx, a.dy];
      const i = ny * W + nx, t = run.tiles[i], m = mobAt(run, nx, ny);
      if (p.st.netz && !m) { say(run, 'Du zerrst am Netz ...'); used = true; break; }
      if (m) {
        run.fx.push({ k: 'lunge', id: 0, dx: a.dx, dy: a.dy });
        const base = playerAtk(p) * (CLASSES[p.cls].range ? 0.6 : 1);
        playerHit(run, m, base);
        sideHits(run, m, base, '#f4f4f4');
        if (p.cls === 'krieger' && !hasNode(p, 'n0_5')) gain(p, 2); // Vergelter: keine Wut aus eigenen Schlägen
        used = true;
      } else if (t === T.MIMIC) { revealMimic(run, i, true); used = true; }
      else if (t === T.CHEST || t === T.CURSED) { openChest(run, i); used = true; }
      else if (t === T.FOUNTAIN) {
        const n = Math.ceil(p.maxHp * 0.35);
        p.hp = Math.min(p.maxHp, p.hp + n);
        delete p.st.gift; delete p.st.brand;
        run.tiles[i] = T.FOUNTAIN_DRY;
        run.fx.push({ k: 'num', x: p.x, y: p.y, s: `+${n}`, col: '#a7f070' });
        say(run, 'Du trinkst aus dem Brunnen. Er versiegt.');
        used = true;
      } else if (t === T.GATE && run.ev?.seal?.some(([g]) => g === i)) say(run, 'Das Gitter rührt sich nicht – erst muss das Ereignis vorbei sein.');
      else if (t === T.GATE) {
        if (p.keys > 0) { p.keys--; run.tiles[i] = T.FLOOR; say(run, 'Der Schlüssel passt. Das Gitter öffnet sich.'); used = true; }
        else say(run, 'Ein verschlossenes Gitter. Ein Elitegegner auf dieser Ebene trägt den Schlüssel.');
      }
      else if (t === T.TRADER) { if (run.shop.length) { run.mode = 'shop'; say(run, 'Händler: "Sieh dich um, Wanderer."'); } }
      else if (t === T.CRACKED) {
        const n = (run.cracks.get(i) ?? 0) + 1;
        run.fx.push({ k: 'lunge', id: 0, dx: a.dx, dy: a.dy }, { k: 'shake', n: 2 });
        if (n >= 3) breakWall(run, i); else { run.cracks.set(i, n); say(run, n === 1 ? 'Die Wand ist rissig – sie gibt nach.' : 'Noch ein Schlag ...'); }
        used = true;
      } else if (t === T.CRATE || t === T.CRATE_ON) {
        const bx = nx + a.dx, by = ny + a.dy, bi = by * W + bx, bt = run.tiles[bi];
        if ((bt === T.FLOOR || bt === T.BURNT || bt === T.PLATE) && !mobAt(run, bx, by)) {
          run.tiles[bi] = bt === T.PLATE ? T.CRATE_ON : T.CRATE;
          run.tiles[i] = t === T.CRATE_ON ? T.PLATE : T.FLOOR;
          p.x = nx; p.y = ny; used = true;
          checkCrates(run);
        } else say(run, 'Die Kiste lässt sich so nicht schieben.');
      } else if (t === T.LEVER) { resetCrates(run); used = true; }
      else if (t === T.TABLET) {
        const z = run.puzzle;
        if (z && z.kind === 'runes') z.read = true;
        say(run, z && z.kind === 'runes' ? `Die Tafel zeigt: ${z.order.map(k => RUNE_NAMES[k]).join(' – ')} – du merkst sie dir.` : 'Die Tafel ist verwittert.');
      } else if (t === T.ICE) {
        const kind = (x: number, y: number) => {
          const tt = run.tiles[y * W + x];
          if (mobAt(run, x, y)) return 'block' as const;
          return tt === T.ICE ? 'ice' as const : walkable(tt) ? 'floor' as const : 'block' as const;
        };
        [p.x, p.y] = slide(kind, p.x, p.y, a.dx, a.dy);
        used = true;
        afterStep(run);
        stepHazard(run, p);
      } else if (t === T.BARREL) {
        // Lunte: 2 oder 3 Züge Zeit, um Abstand zu gewinnen (der Zähler sinkt schon am Ende dieses Zugs)
        if (!run.fuses.has(i)) { run.fuses.set(i, 3 + (spot(nx, ny, run.turn) % 2)); say(run, 'Die Lunte brennt – weg hier!'); }
        used = true;
      }
      else if (t === T.ALTAR) {
        const cost = Math.ceil(p.maxHp * 0.25);
        if (p.hp <= cost) say(run, 'Du bist zu schwach für das Opfer.');
        else {
          p.hp -= cost;
          run.tiles[i] = T.ALTAR_USED;
          say(run, `Der Altar nimmt ${cost} Leben und gewährt eine Gabe.`);
          offerPerks(run);
          used = true;
        }
      } else if (walkable(t)) {
        p.x = nx; p.y = ny; used = true;
        if (t === T.STAIRS) say(run, 'Eine Treppe nach unten. [E] zum Abstieg.');
        else if (t === T.FRAGILE) { run.tiles[i] = T.FRAGILE2; say(run, 'Der Boden knackt unter dir ...'); }
        else if (t === T.FRAGILE2) {
          say(run, 'Der Boden bricht ein!');
          nextFloor(run);
          damage(run, p, Math.ceil(p.maxHp * 0.15), '#b13e53');
          run.fx.push({ k: 'shake', n: 8 });
          used = false;
          fatal(run);
        } else { afterStep(run); stepHazard(run, p); if (run.mud?.includes(i)) { p.st.netz = 2; say(run, 'Du steckst im Schlamm fest!'); } }
      }
      break;
    }
    case 'wait':
      // Schildwall: Warten im Kampf schützt und gibt Wut
      if (a.t === 'wait' && p.cls === 'krieger' && hasNode(p, 'n0_2a') && run.mobs.some(m => m.awake && run.vis[m.y * W + m.x])) { p.st.sw = 1; gain(p, 1); }
      // Fokus sammelt sich nur, wenn ein wacher Gegner in Sicht ist
      // Ruhige Hand: doppelt ohne Gegner daneben; Rückzugsgefecht: Warten gibt nichts
      if (p.cls === 'waldlaeufer' && !(a.t === 'wait' && hasNode(p, 'n2_5')) && run.mobs.some(m => m.awake && run.vis[m.y * W + m.x]))
        gain(p, a.t === 'wait' && hasNode(p, 'n0_2a') && !run.mobs.some(m => cheb(m, p) <= 1) ? 2 : 1);
      used = true;
      break;
    case 'shoot': {
      const c = CLASSES[p.cls];
      if (!c.range) break;
      const t = nearestMob(run, shotRange(p));
      if (!t) { say(run, 'Kein Ziel in Reichweite.'); break; }
      run.fx.push({ k: 'bolt', x0: p.x, y0: p.y, x1: t.x, y1: t.y, col: c.resCol });
      const base = playerAtk(p) * (p.cls === 'waldlaeufer' ? (hasNode(p, 'n1_5') ? 0.49 : 0.7) * shotBonus(p) : 1); // Minenfeld –30 %
      playerHit(run, t, base);
      sideHits(run, t, base, c.resCol);
      if (p.cls === 'magier' && hasNode(p, 'n0_2a') && t.hp > 0 && run.rng.chance(0.3)) t.st.brand = Math.max(t.st.brand ?? 0, burnT(p, 2)); // Zunder
      if (c.fokusOnHit) {
        p.resAcc = (p.resAcc ?? 0) + c.fokusOnHit;
        const n = Math.floor(p.resAcc + 1e-9);
        if (n > 0) { gain(p, n); p.resAcc -= n; }
      }
      used = true;
      break;
    }
    case 'potion':
      if (p.potions <= 0) say(run, 'Keine Heiltränke mehr.');
      else if (p.hp >= p.maxHp) say(run, 'Du bist bereits bei voller Gesundheit.');
      else {
        p.potions--;
        const n = has(p, 'seelenkelch') ? p.maxHp : Math.ceil(p.maxHp * 0.45);
        p.hp = Math.min(p.maxHp, p.hp + n);
        delete p.st.gift; delete p.st.brand;
        run.fx.push({ k: 'num', x: p.x, y: p.y, s: `+${n}`, col: '#a7f070' });
        used = true;
      }
      break;
    case 'bomb': {
      if (p.bombs <= 0) { say(run, 'Keine Bomben mehr.'); break; }
      // Ziel: Hindernis in Blickrichtung, sonst nächster Gegner, sonst drei Felder voraus
      let tx = p.x, ty = p.y, found = false;
      for (let k = 1; k <= 3; k++) {
        const x = p.x + p.dir[0] * k, y = p.y + p.dir[1] * k, t = run.tiles[y * W + x];
        if (t === T.CRACKED || t === T.PILLAR || t === T.BARREL) { tx = x; ty = y; found = true; break; }
        if (opaque(t) || t === undefined) break;
        tx = x; ty = y;
      }
      const m = found ? undefined : nearestMob(run, 5);
      if (m) { tx = m.x; ty = m.y; }
      p.bombs--;
      run.fx.push({ k: 'bolt', x0: p.x, y0: p.y, x1: tx, y1: ty, col: '#1a1c2c' });
      explode(run, tx, ty, 1);
      used = true;
      break;
    }
    case 'descend':
      if (run.tiles[p.y * W + p.x] === T.STAIRS) nextFloor(run);
      break;
    case 'skill':
      used = useSkill(run, a.i);
      break;
    case 'ult':
      used = useUlt(run);
      break;
  }
  if (used && p.cls === 'waldlaeufer') afterWl(run, a, px, py, adj0);
  playerActing = false;
  if (used && freeTurn) { freeTurn = false; computeFov(run.tiles, p.x, p.y, fovR(run), run.vis, run.seen); return; }
  if (used) endTurn(run);
}

// ---------- Gegnerzug ----------

function hitPlayer(run: Run, m: Actor, melee: boolean) {
  const p = run.p, d = MOBS[m.kind];
  m.f = Math.abs(p.x - m.x) >= Math.abs(p.y - m.y) ? [Math.sign(p.x - m.x), 0] : [0, Math.sign(p.y - m.y)];
  if (melee) run.fx.push({ k: 'lunge', id: m.id, dx: Math.sign(p.x - m.x), dy: Math.sign(p.y - m.y) }, { k: 'swipe', x: p.x, y: p.y, dx: Math.sign(p.x - m.x), dy: Math.sign(p.y - m.y), big: !!m.boss });
  if (melee && inSmoke(p) && run.rng.chance(0.5)) { run.fx.push({ k: 'num', x: p.x, y: p.y, s: 'verfehlt', col: '#94b0c2' }); return; }
  if (p.st.dodge || (p.aff.flink && run.rng.chance(Math.min(40, p.aff.flink) / 100))) { run.fx.push({ k: 'num', x: p.x, y: p.y, s: 'verfehlt', col: '#94b0c2' }); if (p.aff.konter) p.st.konter = 1; return; }
  const atk = Math.max(1, (melee ? m.atk : Math.round(m.atk * 0.7)) - (m.st.schwach ? 1 : 0)); // Fernschüsse treffen schwächer
  damage(run, p, Math.max(Math.ceil(atk * 0.3), atk - p.def - (p.st.wall ? 3 : 0) - (p.st.eis ? 2 : 0) - (p.st.sw ? 2 : 0)) - (has(p, 'steinhaut') ? 1 : 0), '#b13e53');
  run.fx.push({ k: 'shake', n: m.boss ? 5 : 2 });
  // Krieger: Wut aus Treffern; Vergelter doppelt, Schmerzensgeld +1 im Nahkampf
  if (p.cls === 'krieger') gain(p, (hasNode(p, 'n0_5') ? 2 : 1) + (melee && hasNode(p, 'n2_2a') ? 1 : 0));
  // Gegenschlag
  if (melee && p.cls === 'krieger' && hasNode(p, 'n0_2b') && p.hp > 0 && m.hp > 0 && run.rng.chance(0.25)) {
    run.fx.push({ k: 'lunge', id: 0, dx: Math.sign(m.x - p.x), dy: Math.sign(m.y - p.y) });
    playerHit(run, m, playerAtk(p));
  }
  if (d.poison && run.rng.chance(0.5)) p.st.gift = 4;
  if (d.burn && run.rng.chance(0.5)) p.st.brand = 3;
  if (melee && p.thorns) damage(run, m, p.thorns * (p.aff.stachel ? 2 : 1), '#a7f070');
}

function moveMob(run: Run, m: Actor, x: number, y: number) {
  m.f = [Math.sign(x - m.x), Math.sign(y - m.y)];
  m.x = x; m.y = y;
  if (run.hazards.length) { stepHazard(run, m); if (m.hp <= 0) return; }
  const ti = run.traps.findIndex(t => t.x === x && t.y === y);
  if (ti >= 0) {
    run.traps.splice(ti, 1);
    const L = run.p.skillLvl[1];
    stun(run, m, run.p.skillMod[1] === 1 ? 3 : 2);
    say(run, `${m.name} tritt in die Falle!`);
    damage(run, m, (8 * run.p.pow + run.p.lvl) * (1 + 0.3 * L), '#ffcd75');
    if (hasNode(run.p, 'n1_2a') && m.hp > 0) m.st.gift = 3; // Stacheldraht
  }
}

function mobAct(run: Run, m: Actor, dist: Int16Array) {
  const p = run.p, d = MOBS[m.kind];
  if (!m.awake) { if (run.vis[m.y * W + m.x]) m.awake = true; return; }
  if (m.kind === 'mimik' && m.cd) { m.cd = 0; return; }
  if (d.ai === 'flee' || d.ai === 'wisp') { fleeAct(run, m, dist, d.ai === 'wisp'); return; }
  if (d.ai === 'idle') return;
  if (d.hunter) { hunterAct(run, m, dist); return; }
  const man = Math.abs(p.x - m.x) + Math.abs(p.y - m.y);
  if (d.ai === 'boss' && ++m.cd >= 5) {
    m.cd = 0;
    const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oy]) => [m.x + ox, m.y + oy]).filter(([x, y]) => isFree(run, x, y));
    if (spots.length && run.mobs.filter(o => o !== m && cheb(o, m) <= 6).length < 5) {
      const [x, y] = run.rng.pick(spots);
      spawnMob(run, d.minion!, x, y).awake = true;
      say(run, `${m.name} ruft Verstärkung!`);
      return;
    }
  }
  if (man === 1) {
    // Schützen weichen oft einen Schritt zurück, wenn Platz ist
    if (d.range && !m.st.taunt && !m.st.netz && run.rng.chance(0.5)) {
      const back = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oy]) => [m.x + ox, m.y + oy]).find(([x, y]) => isFree(run, x, y) && Math.abs(p.x - x) + Math.abs(p.y - y) === 2);
      if (back) { moveMob(run, m, back[0], back[1]); return; }
    }
    // Golems holen nach jedem Schlag einen Zug lang aus
    if (d.ai === 'slow') { if (m.cd) { m.cd = 0; return; } m.cd = 1; }
    hitPlayer(run, m, true);
    return;
  }
  if (d.range && !m.st.taunt && !inSmoke(p) && cheb(m, p) <= d.range && los(run.tiles, m.x, m.y, p.x, p.y)) {
    run.fx.push({ k: 'arrow', x0: m.x, y0: m.y, x1: p.x, y1: p.y, col: '#c9d4dc', heavy: false });
    hitPlayer(run, m, false);
    return;
  }
  if (m.st.netz) return; // Fangnetz: kann nicht laufen
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (d.ai === 'erratic' && run.rng.chance(0.35)) {
    const [ox, oy] = run.rng.pick(dirs);
    if (isFree(run, m.x + ox, m.y + oy)) moveMob(run, m, m.x + ox, m.y + oy);
    return;
  }
  let best: number[] | null = null, bd = dist[m.y * W + m.x];
  if (bd < 0) return;
  for (const [ox, oy] of dirs) {
    const x = m.x + ox, y = m.y + oy;
    if (!isFree(run, x, y)) continue;
    const v = dist[y * W + x];
    if (v >= 0 && v < bd) { bd = v; best = [x, y]; }
  }
  if (best) moveMob(run, m, best[0], best[1]);
  else if (d.smash) {
    // Schwere Gegner brechen rissige Wände auf dem Weg zum Spieler ein
    for (const [ox, oy] of dirs) {
      const i = (m.y + oy) * W + m.x + ox;
      if (run.tiles[i] === T.CRACKED && Math.abs(p.x - m.x - ox) + Math.abs(p.y - m.y - oy) < man) { breakWall(run, i); break; }
    }
  }
}

// Diebe und Goblins laufen weg (nicht immer – man soll sie stellen können), Seelenlichter treiben umher.
function fleeAct(run: Run, m: Actor, dist: Int16Array, wisp: boolean) {
  if (m.st.netz) return;
  const p = run.p, dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (wisp) {
    if (!run.rng.chance(0.5)) return;
    const [ox, oy] = run.rng.pick(dirs);
    if (isFree(run, m.x + ox, m.y + oy)) moveMob(run, m, m.x + ox, m.y + oy);
    return;
  }
  if (cheb(m, p) > 5 || !run.rng.chance(0.7)) return;
  let best: number[] | null = null, bd = dist[m.y * W + m.x];
  for (const [ox, oy] of dirs) {
    const x = m.x + ox, y = m.y + oy;
    if (!isFree(run, x, y) || inVault(run, x, y)) continue;
    const v = dist[y * W + x];
    if (v > bd) { bd = v; best = [x, y]; }
  }
  if (best) moveMob(run, m, best[0], best[1]);
}

function tickDots(run: Run, a: Actor) {
  if (a.st.gift) { a.st.gift--; damage(run, a, 1, '#38b764'); }
  if (a.hp > 0 && a.st.brand) {
    a.st.brand--;
    if (a === run.p && has(run.p, 'glutherz')) {
      if (a.hp < a.maxHp) { a.hp++; run.fx.push({ k: 'num', x: a.x, y: a.y, s: '+1', col: '#a7f070' }); }
    } else damage(run, a, a !== run.p && run.p.cls === 'magier' && hasNode(run.p, 'n0_2b') ? 3 : 2, '#ef7d57');
  }
}

function endTurn(run: Run) {
  const p = run.p;
  if (run.mode === 'win') return;
  run.turn++;
  tickWorld(run);
  if (run.fire.has(p.y * W + p.x)) p.st.brand = Math.max(p.st.brand ?? 0, 2);
  for (const m of run.mobs) if (run.fire.has(m.y * W + m.x)) m.st.brand = Math.max(m.st.brand ?? 0, burnT(p, 2));
  tickDots(run, p);
  if (p.cls === 'magier' && run.turn % (hasNode(p, 'n1_5') ? Math.round(3 / TUNE.kryoRegen) : 3) === 0) gain(p, 1); // Kryomant: langsamere Erholung
  // Krieger: Wut wächst, solange ein sichtbarer Gegner direkt daneben steht
  if (p.cls === 'krieger' && run.mobs.some(m => cheb(m, p) <= 1 && run.vis[m.y * W + m.x])) gain(p, 1);
  const dist = distMap(run.tiles, p.x, p.y);
  computeFov(run.tiles, p.x, p.y, fovR(run), run.vis, run.seen);
  if (run.hazards.length) spotHazards(run);
  for (const m of [...run.mobs]) {
    if (m.hp <= 0) continue;
    tickDots(run, m);
    if (m.hp <= 0) continue;
    if (m.st.schwach) m.st.schwach--;
    if (m.st.mark && !--m.st.mark) delete m.st.mark;
    if (m.st.netz) m.st.netz--;
    if (m.st.taunt) m.st.taunt--;
    if (m.st.stun) { if (--m.st.stun === 0) m.st.immun = 3; continue; }
    if (m.st.immun) m.st.immun--;
    if (m.st.sproede) m.st.sproede--;
    if (has(p, 'zeitsand') && run.rng.chance(0.12)) continue;
    mobAct(run, m, dist);
    if (p.hp <= 0) break;
  }
  if (p.st.stark) p.st.stark--;
  if (p.st.wall) p.st.wall--;
  if (p.st.dodge) p.st.dodge--;
  if (p.st.eis) p.st.eis--;
  if (p.st.riss) p.st.riss--;
  if (p.st.sw) p.st.sw--;
  if (p.st.rausch) p.st.rausch--;
  if (p.st.rauch && !--p.st.rauch) { delete p.st.rauch; delete p.st.rx; delete p.st.ry; }
  if (p.st.schild && !--p.st.schild) { delete p.st.schild; p.shield = 0; }
  if (p.ultCd) p.ultCd--;
  if (p.aff.regen && run.turn % 6 === 0 && p.hp > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.aff.regen);
  const z = run.puzzle;
  if (z && z.kind === 'darts' && z.entered && !z.solved && z.lanes && run.mode !== 'dead') {
    for (const l of z.lanes) if (dartFires(l, run.turn)) fireLane(run, z, l);
  }
  if (z && z.kind === 'arena' && z.started && !z.solved && !z.dead && run.mode !== 'dead') {
    if (!run.mobs.some(m => m.arena)) {
      if (run.mode === 'play') {
        if (z.timer >= 8) { const g = 10 + 2 * run.floor; p.gold += g; say(run, `Schnell bestanden: +${g} Gold.`); }
        solve(run);
      }
    }
    else if (--z.timer <= 0) { z.dead = true; say(run, 'Die Zeit ist um – die Prüfung ist gescheitert.'); }
  }
  if (p.st.netz) p.st.netz--;
  if (run.ev || run.evQ?.length) evTick(run);
  if (run.hunt) hunterTick(run);
  fatal(run);
}

// ---------- Speichern eines laufenden Abstiegs ----------

const SAVE_VERSION = 5;

export function serialize(run: Run): string {
  return JSON.stringify({
    ...run, v: SAVE_VERSION, rng: run.rng.s, fx: [], invFocus: undefined, invNote: undefined,
    tiles: [...run.tiles], seen: [...run.seen], vis: [...run.vis],
    fire: [...run.fire], fuses: [...run.fuses], cracks: [...run.cracks],
  });
}

export function deserialize(json: string): Run | null {
  try {
    const o = JSON.parse(json);
    if (o.v !== SAVE_VERSION) return null;
    delete o.v;
    migrateRun(o);
    return {
      ...o, rng: new RNG(o.rng), fx: [],
      tiles: Uint8Array.from(o.tiles), seen: Uint8Array.from(o.seen), vis: Uint8Array.from(o.vis),
      fire: new Map(o.fire), fuses: new Map(o.fuses), cracks: new Map(o.cracks),
    } as Run;
  } catch {
    return null;
  }
}

// Knoten, die den Rängen entsprechen (für Spielstände von vor dem Baum)
export function nodesFromRanks(lvl: number[], mod: number[]): string[] {
  const out: string[] = [];
  lvl.forEach((l, i) => {
    if (l >= 1) out.push(`n${i}_1`, `n${i}_2a`); // T2a kommt mit T1
    if (l >= 2 && mod[i]) out.push(`n${i}_4${mod[i] === 1 ? 'a' : 'b'}`);
  });
  return out;
}

function migrateRun(o: { p: Player; pool?: string[]; perkQ?: number; hazards?: Hazard[] }) {
  const p = o.p;
  if (!p.tree) p.tree = nodesFromRanks(p.skillLvl, p.skillMod);
  p.pts ??= 0;
  p.ptsGot ??= Math.floor(p.lvl / TREE_EVERY);
  p.rest ??= 0;
  o.pool ??= treeNodes(p.cls).filter(n => n.cost === 0).map(n => n.id);
  o.perkQ ??= 0;
  o.hazards ??= [];
}
