// Zufällige Ereignisse: reine Beschreibung. Den Spielzustand ändern sie nur über die EvApi aus run.ts,
// damit es keine Kreisbezüge gibt und jedes Ereignis dieselben Bausteine nutzt.
import { W } from './dungeon';
import type { Room } from './dungeon';

export type EvCat = 'flavour' | 'challenge' | 'danger';
export type EvResult = 'run' | 'won' | 'lost';

// Laufendes Ereignis (wird mit dem Lauf gespeichert)
export interface EvState {
  id: string;
  turns: number;               // vergangene Züge seit dem Start
  limit: number;               // harte Zeitgrenze – danach endet das Ereignis immer
  room?: Room;
  mobs: number[];              // Ids der Gegner, die zum Ereignis gehören
  total: number;               // so viele Ereignisgegner gab es insgesamt
  mark?: number;               // Zielfeld (Geist, Truhe)
  marks?: number[];            // mehrere Zielfelder (Kerzen, Pilze, Kühlplatten); data.look wählt das Bild
  seal?: [number, number][];   // versiegelte Durchgänge: Feld und ursprüngliche Kachel
  data: Record<string, number>;
}

// Geplant für die Ebene: Raumereignisse warten auf das Betreten ihres Raums
export interface EvPlan { id: string; room?: number; }

export interface EvActor { id: number; x: number; y: number; hp: number; maxHp: number; atk: number; def: number; name: string; xp: number; st: Record<string, number>; awake: boolean; }

export interface EvApi {
  floor: number; turn: number;
  p: EvActor;
  chance(p: number): boolean;
  int(a: number, b: number): number;
  say(s: string): void;
  table(): string[];                        // Gegner dieser Tiefe
  spawn(e: EvState, kind: string, x: number, y: number): EvActor;
  alive(e: EvState): EvActor[];
  vanish(e: EvState): void;                 // Ereignisgegner verschwinden spurlos (ohne Beute)
  near(min: number, max: number): [number, number, number] | null; // freies Feld mit Wegstrecke in [min, max]: x, y, Weglänge
  inRoom(r: Room): [number, number] | null;
  edge(r: Room): [number, number][];        // freie Felder am Rand des Raums
  roomTiles(r: Room): number[];             // begehbare Bodenfelder des Raums
  seal(e: EvState): void;
  warn(tiles: number[]): void;              // Felder, die im nächsten Zug getroffen werden
  strike(dmg: number, fx: 'spike' | 'rock' | 'fire' | 'gas' | 'hammer'): void; // trifft alle auf den gewarnten Feldern, löscht die Warnung
  elite(m: EvActor, mul: number, name: string): void;
  rival(e: EvState, x: number, y: number): EvActor;
  barrel(x: number, y: number, fuse: number): boolean;
  hurt(n: number, why: string): void;      // Schaden am Helden ohne Angreifer
  heal(frac: number): number;
  mud(tiles: number[]): void;              // Schlamm: wer hineintritt, steckt einen Zug fest
  isFloor(i: number): boolean;
  free(i: number): boolean;                // begehbar und von niemandem besetzt
  remove(m: EvActor): void;                // verschwindet ohne Beute
  reward(tier: number): string;
  near2(x: number, y: number, min: number, max: number): number[]; // begehbare Felder im Abstand [min, max] (Schachbrett) um x, y
  wake(e: EvState, max: number, range: number): number;
  root(turns: number): void;
  gold(n: number): number;                  // mit Goldfund verrechnet, gibt die echte Menge zurück
  takeGold(n: number): number;
  souls(n: number): number;
  atPlayer(i: number): boolean;
  shadow(e: EvState, x: number, y: number): EvActor;
}

export interface EvDef {
  id: string; cat: EvCat; trigger: 'room' | 'calm';
  biome?: 0 | 1 | 2;           // nur in diesem Gebiet (sonst überall)
  title: string; intro: string[];
  tier: 0 | 1 | 2 | 3;         // Lohnstufe; 0 = eigener Lohn in won()
  limit: number;
  survive?: boolean;           // Ablauf der Zeit = geschafft
  vanish?: boolean;            // übrige Ereignisgegner verschwinden am Ende
  start(a: EvApi, e: EvState): boolean;   // false: geht hier nicht – Ereignis entfällt
  tick(a: EvApi, e: EvState): EvResult;
  goal(a: EvApi, e: EvState): string;
  won?(a: EvApi, e: EvState): string;     // eigener Lohn (tier 0)
  lost?(a: EvApi, e: EvState): string;
}

const left = (e: EvState) => Math.max(0, e.limit - e.turns);
const killAll = (a: EvApi, e: EvState): EvResult => (a.alive(e).length ? 'run' : 'won');
const beaten = (a: EvApi, e: EvState) => `${e.total - a.alive(e).length}/${e.total}`;
const spawnAt = (a: EvApi, e: EvState, spots: [number, number][], n: number, stun = 0) => {
  for (const [x, y] of spots.slice(0, n)) { const m = a.spawn(e, a.table()[a.int(0, a.table().length - 1)], x, y); if (stun) m.st.stun = stun; }
  return e.mobs.length > 0;
};
const shuffled = <T>(a: EvApi, xs: T[]) => { const o = [...xs]; for (let i = o.length - 1; i > 0; i--) { const j = a.int(0, i); [o[i], o[j]] = [o[j], o[i]]; } return o; };

// Fallenkammer: ein Drittel des Raums wird rot, neben dem Helden bleibt immer ein Feld frei
function spikeWarn(a: EvApi, e: EvState) {
  const room = a.roomTiles(e.room!), tiles = room.filter(() => a.chance(0.3)), p = a.p;
  const around = room.filter(i => Math.abs((i % W) - p.x) <= 1 && Math.abs(((i / W) | 0) - p.y) <= 1);
  if (around.length && around.every(i => tiles.includes(i))) tiles.splice(tiles.indexOf(around[a.int(0, around.length - 1)]), 1);
  a.warn(tiles);
}
// Einsturz: 4–6 Felder, oft genau dort, wo der Held steht
function rockWarn(a: EvApi, e: EvState) {
  const tiles = shuffled(a, a.roomTiles(e.room!)).slice(0, a.int(4, 6)), p = a.p, pi = p.y * W + p.x;
  if (a.chance(0.5) && !tiles.includes(pi)) tiles.push(pi);
  a.warn(tiles);
}

// Skelettparade: nächstes Feld, aus dem ein Skelett steigt (rot markiert)
function parade(a: EvApi, e: EvState): boolean {
  const c = a.roomTiles(e.room!).filter(i => a.free(i) && Math.max(Math.abs((i % W) - a.p.x), Math.abs(((i / W) | 0) - a.p.y)) >= 2);
  if (!c.length) return false;
  e.data.next = c[a.int(0, c.length - 1)];
  a.warn([e.data.next]);
  return true;
}
// freies Feld im Raum, möglichst weit weg vom Helden (mindestens min Felder)
function far(a: EvApi, e: EvState, min: number): number {
  const c = a.roomTiles(e.room!).filter(i => a.free(i) && Math.max(Math.abs((i % W) - a.p.x), Math.abs(((i / W) | 0) - a.p.y)) >= min);
  return c.length ? c[a.int(0, c.length - 1)] : -1;
}
// Zielfelder einsammeln: steht der Held auf einem, verschwindet es
function take(a: EvApi, e: EvState, got: () => void) {
  const i = e.marks!.findIndex(m => a.atPlayer(m));
  if (i >= 0) { e.marks!.splice(i, 1); got(); }
}

// Lavariss: die Glut frisst sich je Zug zwei Felder weiter die Linie entlang
function lava(a: EvApi, e: EvState) {
  const d = e.data, from = d.at, line: number[] = [];
  for (let k = 0; k < d.len; k++) line.push((d.y0 + (d.dx ? 0 : k)) * W + d.x0 + (d.dx ? k : 0));
  d.at = Math.min(line.length, from + 2);
  a.warn(line.slice(Math.max(0, from - 1), d.at).filter(i => a.isFloor(i)));
}
// Esse: eine ganze Zeile oder Spalte des Raums
function esse(a: EvApi, e: EvState) {
  const r = e.room!, out: number[] = [];
  if (a.chance(0.5)) { const y = r.y + a.int(0, r.h - 1); for (let x = r.x; x < r.x + r.w; x++) out.push(y * W + x); }
  else { const x = r.x + a.int(0, r.w - 1); for (let y = r.y; y < r.y + r.h; y++) out.push(y * W + x); }
  a.warn(out.filter(i => a.isFloor(i)));
}
// Funken: vier Felder nahe dem Helden, oft auch seines
function sparks(a: EvApi) {
  const c = a.near2(a.p.x, a.p.y, 0, 4).filter(i => a.isFloor(i)), out = shuffled(a, c).slice(0, 4), pi = a.p.y * W + a.p.x;
  if (a.chance(0.3) && !out.includes(pi)) out.push(pi);
  a.warn(out);
}
// Amboss: jedes zweite Feld im Wechsel – wer jeden Zug einen Schritt macht, bleibt heil
function anvil(a: EvApi, e: EvState) {
  const par = (e.turns + 1) % 2;
  a.warn(a.roomTiles(e.room!).filter(i => ((i % W) + ((i / W) | 0)) % 2 === par));
}
// Schmelzofen: zwei Fässer mit kurzer Lunte, nicht direkt neben dem Helden
function kegs(a: EvApi, e: EvState) {
  let n = 0;
  for (const i of shuffled(a, a.roomTiles(e.room!))) {
    if (n >= 2) break;
    if (Math.max(Math.abs((i % W) - a.p.x), Math.abs(((i / W) | 0) - a.p.y)) >= 3 && a.barrel(i % W, (i / W) | 0, 3)) n++;
  }
}

export const EVENTS: EvDef[] = [
  {
    id: 'hinterhalt', cat: 'danger', trigger: 'room', title: 'Ambush!', tier: 2, limit: 40,
    intro: ['Enemies leap out of the shadows!', 'A whistle – and they come from all sides.', 'That was a trap. Now you fight.'],
    start(a, e) { return spawnAt(a, e, shuffled(a, a.edge(e.room!)), 2 + (a.floor >= 6 ? 1 : 0), 1); },
    tick: killAll,
    goal: (a, e) => `Defeat the attackers ${beaten(a, e)}`,
  },
  {
    id: 'fallenkammer', cat: 'danger', trigger: 'room', title: 'Trap room!', tier: 2, limit: 8, survive: true,
    intro: ['Gates slam shut! Spikes shoot from the floor.', 'Clack. The doors are shut. The floor has holes.'],
    start(a, e) { a.seal(e); spikeWarn(a, e); return true; },
    tick(a, e) {
      a.strike(4 + Math.floor(a.floor * 0.7), 'spike');
      if (e.turns < e.limit) spikeWarn(a, e);
      return 'run';
    },
    goal: (a, e) => `Dodge the red tiles · ${left(e)} turns`,
  },
  {
    id: 'netzfalle', cat: 'challenge', trigger: 'calm', title: 'Net trap!', tier: 1, limit: 30,
    intro: ['A sticky net drops from the ceiling!', 'You step into a net – and hear footsteps.'],
    start(a, e) {
      const s1 = a.near(4, 7), s2 = a.near(4, 7);
      if (!s1) return false;
      a.root(3);
      spawnAt(a, e, [[s1[0], s1[1]], ...(s2 && (s2[0] !== s1[0] || s2[1] !== s1[1]) ? [[s2[0], s2[1]] as [number, number]] : [])], 2);
      return true;
    },
    tick: killAll,
    goal: (a, e) => `Break free and defeat them ${beaten(a, e)}`,
  },
  {
    id: 'einsturz', cat: 'challenge', trigger: 'room', title: 'Cave-in!', tier: 2, limit: 6, survive: true,
    intro: ['The ceiling creaks. Stones break loose!', 'Dust trickles down. This place is about to collapse.'],
    start(a, e) { if (a.roomTiles(e.room!).length <= 6) return false; rockWarn(a, e); return true; },
    tick(a, e) {
      a.strike(5 + Math.floor(a.floor * 0.7), 'rock');
      if (e.turns < e.limit) rockWarn(a, e);
      return 'run';
    },
    goal: (a, e) => `Leave the room or dodge · ${left(e)} turns`,
  },
  {
    id: 'dieb', cat: 'challenge', trigger: 'calm', title: 'Thief rat!', tier: 0, limit: 25, vanish: true,
    intro: ['A rat snatches your purse!', 'Something tugs at your belt – your gold!'],
    start(a, e) {
      const s = a.near(2, 3);
      if (!s) return false;
      a.spawn(e, 'dieb', s[0], s[1]);
      e.data.stolen = a.takeGold(8 + 3 * a.floor);
      a.say(e.data.stolen ? `The rat has ${e.data.stolen} gold!` : 'The rat finds nothing and is offended.');
      return true;
    },
    tick: killAll,
    goal: (a, e) => `Catch the thief rat · ${left(e)} turns`,
    won: (a, e) => `${a.gold(Math.max(Math.round(1.5 * e.data.stolen), 5 + a.floor))} gold back`,
    lost: (a, e) => (e.data.stolen ? `The rat got away with ${e.data.stolen} gold.` : 'The rat is gone.'),
  },
  {
    id: 'goblin', cat: 'challenge', trigger: 'calm', title: 'Treasure goblin!', tier: 3, limit: 30, vanish: true,
    intro: ['A goblin with a bulging sack giggles and runs!', 'Jingle, jingle – a treasure goblin!'],
    start(a, e) { const s = a.near(4, 7); if (!s) return false; a.spawn(e, 'goblin', s[0], s[1]); return true; },
    tick: killAll,
    goal: (a, e) => `Catch the treasure goblin · ${left(e)} turns`,
    lost: () => 'The goblin escaped with its treasure.',
  },
  {
    id: 'geist', cat: 'flavour', trigger: 'calm', title: 'Lost spirit', tier: 2, limit: 30,
    intro: ['A pale spirit waves at you and drifts away.', '"Follow me ...", a light whispers.'],
    start(a, e) {
      const s = a.near(8, 14);
      if (!s) return false;
      e.mark = s[1] * W + s[0];
      e.limit = Math.ceil(s[2] * 2) + 6;
      return true;
    },
    tick: (a, e) => (a.atPlayer(e.mark!) ? 'won' : 'run'),
    goal: (a, e) => `Follow the spirit to the light · ${left(e)} turns`,
    lost: () => 'The spirit fades.',
  },
  {
    id: 'kopfgeld', cat: 'danger', trigger: 'calm', title: 'Bounty', tier: 3, limit: 150,
    intro: ['A poster on the wall: "Wanted – dead."', 'A note: "Reward for this guy." He is down here.'],
    start(a, e) {
      const s = a.near(10, 40);
      if (!s) return false;
      const m = a.spawn(e, a.table()[a.int(0, a.table().length - 1)], s[0], s[1]);
      m.name = `Wanted: ${m.name}`;
      m.maxHp = m.hp = Math.round(m.hp * 1.8); m.atk += 2; m.awake = false;
      return true;
    },
    tick: killAll,
    goal: () => 'Find and defeat the wanted one (map: yellow)',
    lost: () => 'The bounty has expired.',
  },
  {
    id: 'glocke', cat: 'danger', trigger: 'room', title: 'Alarm bell!', tier: 2, limit: 15, survive: true,
    intro: ['You trip a wire – somewhere a bell rings!', 'DING! DONG! The whole area is awake.'],
    start(a, e) { e.data.n = a.wake(e, 7, 25); return true; },
    tick: (a, e) => (e.data.n && !a.alive(e).length ? 'won' : 'run'),
    goal: (a, e) => `Survive ${left(e)} turns (${a.alive(e).length} awake)`,
  },
  {
    id: 'seelen', cat: 'flavour', trigger: 'calm', title: 'Soul storm', tier: 0, limit: 30, vanish: true, survive: true,
    intro: ['Soul lights dance around you. Catch them!', 'A breath – and suddenly lights float everywhere.'],
    start(a, e) {
      for (let k = 0; k < 5; k++) { const s = a.near(2, 7); if (s) a.spawn(e, 'irrlicht', s[0], s[1]); }
      return e.mobs.length > 0;
    },
    tick: (a, e) => (a.alive(e).length ? 'run' : 'won'),
    goal: (a, e) => `Catch the soul lights ${beaten(a, e)} · ${left(e)} turns`,
    won: (a, e) => { const n = e.total - a.alive(e).length; return n ? `${a.souls(2 * n)} souls` : 'not a single light – next time'; },
  },
  {
    id: 'nebel', cat: 'challenge', trigger: 'calm', title: 'Cursed fog', tier: 1, limit: 15, survive: true,
    intro: ['Cold fog creeps in. You can barely see.', 'The fog whispers. Something moves inside.'],
    start(a, e) { e.data.fog = 1; const s = a.near(5, 9); if (s) spawnAt(a, e, [[s[0], s[1]]], 1); return true; },
    tick: () => 'run',
    goal: (a, e) => `Endure the fog · ${left(e)} turns`,
  },
  {
    id: 'tote', cat: 'danger', trigger: 'room', title: 'The dead rise', tier: 2, limit: 40,
    intro: ['The ground breaks open – hands reach up!', 'Bones rattle. Nobody rests in peace here.'],
    start(a, e) {
      e.data.wave = 1;
      const spots: [number, number][] = [];
      for (let k = 0; k < 2; k++) { const s = a.inRoom(e.room!); if (s) spots.push(s); }
      return spawnAt(a, e, spots, 2);
    },
    tick(a, e) {
      if (a.alive(e).length) return 'run';
      if (e.data.wave === 1) {
        e.data.wave = 2;
        const spots: [number, number][] = [];
        for (let k = 0; k < 2 + (a.floor >= 8 ? 1 : 0); k++) { const s = a.inRoom(e.room!); if (s) spots.push(s); }
        if (spawnAt(a, e, spots, spots.length)) { a.say('The second wave!'); return 'run'; }
      }
      return 'won';
    },
    goal: (a, e) => `Wave ${e.data.wave}/2 · defeated ${beaten(a, e)}`,
  },
  {
    id: 'wettlauf', cat: 'challenge', trigger: 'calm', title: 'Race', tier: 2, limit: 30,
    intro: ['Somewhere a chest lights up – it won\'t last long!', 'A golden chest appears. Hurry!'],
    start(a, e) {
      const s = a.near(8, 16);
      if (!s) return false;
      e.mark = s[1] * W + s[0];
      e.data.chest = 1;
      e.limit = Math.ceil(s[2] * 2) + 6;
      return true;
    },
    tick: (a, e) => (a.atPlayer(e.mark!) ? 'won' : 'run'),
    goal: (a, e) => `Reach the glowing chest · ${left(e)} turns`,
    lost: () => 'The chest crumbles to dust.',
  },
  {
    id: 'zwilling', cat: 'danger', trigger: 'room', title: 'Shadow twin', tier: 3, limit: 60,
    intro: ['Your shadow peels off the wall – and draws its weapon.', 'Someone who looks like you steps out of the dark.'],
    start(a, e) {
      const tiles = a.roomTiles(e.room!).filter(i => Math.abs((i % W) - a.p.x) + Math.abs(((i / W) | 0) - a.p.y) >= 3);
      if (!tiles.length) return false;
      const i = tiles[a.int(0, tiles.length - 1)];
      a.shadow(e, i % W, (i / W) | 0);
      return true;
    },
    tick: killAll,
    goal: () => 'Defeat your shadow',
  },
  // ===================== Gruft (Gebiet 0) =====================
  {
    id: 'parade', cat: 'danger', trigger: 'room', biome: 0, title: 'Skeleton parade', tier: 2, limit: 40,
    intro: ['The floor rattles. Bones assemble – one after another.', 'Something stirs under the tiles. Many somethings.'],
    start(a, e) { e.data.left = 4; return parade(a, e); },
    tick(a, e) {
      if (e.data.left > 0) {
        const i = e.data.next;
        if (a.free(i)) a.spawn(e, 'skelett', i % W, (i / W) | 0);
        e.data.left--;
        if (e.data.left > 0) parade(a, e); else a.warn([]);
        return 'run';
      }
      return killAll(a, e);
    },
    goal: (a, e) => (e.data.left > 0 ? `A skeleton rises from the red tile · left ${e.data.left}` : `Defeat the parade ${beaten(a, e)}`),
  },
  {
    id: 'rivale', cat: 'danger', trigger: 'calm', biome: 0, title: 'Rival adventurer', tier: 3, limit: 60, vanish: true,
    intro: ['"The loot down here is MINE!", someone shouts.', 'Another adventurer draws a weapon. They want your loot.'],
    start(a, e) { const s = a.near(5, 9); if (!s) return false; a.rival(e, s[0], s[1]); return true; },
    tick: killAll,
    goal: () => 'Defeat the rival',
    lost: () => 'The rival leaves, laughing.',
  },
  {
    id: 'spukglocke', cat: 'challenge', trigger: 'calm', biome: 0, title: 'Haunted bell', tier: 2, limit: 13, survive: true,
    intro: ['A bell rings by itself. And again.', 'Dong ... dong ... The dead are counting along.'],
    start(a, e) { e.data.ring = 0; return true; },
    tick(a, e) {
      if (e.turns % 4 === 1 && e.data.ring < 3) { e.data.ring++; const n = a.wake(e, 2, 30); a.say(`The bell rings (${e.data.ring}/3)${n ? ' – something awakens.' : '.'}`); }
      return 'run';
    },
    goal: (a, e) => `Endure the ringing (${e.data.ring}/3) · ${left(e)} turns`,
  },
  {
    id: 'ratten', cat: 'challenge', trigger: 'room', biome: 0, title: 'Rat swarm', tier: 1, limit: 40,
    intro: ['Squeak. Squeak? SQUEAK! Rats pour out of every crack.', 'The floor moves. It is full of rats.'],
    start(a, e) {
      for (const [x, y] of shuffled(a, a.edge(e.room!)).slice(0, 5 + (a.floor >= 3 ? 1 : 0))) a.spawn(e, 'ratte', x, y);
      return e.mobs.length > 0;
    },
    tick: killAll,
    goal: (a, e) => `Drive off the rats ${beaten(a, e)}`,
  },
  {
    id: 'koloss', cat: 'danger', trigger: 'room', biome: 0, title: 'Bone colossus', tier: 3, limit: 60,
    intro: ['The bone pile in the corner stands up. It is very big.', 'Hundreds of bones, one will. The colossus awakens.'],
    start(a, e) {
      const t = far(a, e, 3);
      if (t < 0) return false;
      const m = a.spawn(e, 'skelett', t % W, (t / W) | 0);
      a.elite(m, 2.2, 'Bone colossus');
      return true;
    },
    tick: killAll,
    goal: () => 'Smash the bone colossus',
  },
  {
    id: 'kerzen', cat: 'challenge', trigger: 'calm', biome: 0, title: 'Ghost candles', tier: 2, limit: 40,
    intro: ['Three cold candles flicker. Light them before the spirit leaves.', 'A voice: "Light ... bring me light ..."'],
    start(a, e) {
      const ms: number[] = []; let sum = 0;
      for (let k = 0; k < 6 && ms.length < 3; k++) { const s = a.near(4, 12); if (s && !ms.includes(s[1] * W + s[0])) { ms.push(s[1] * W + s[0]); sum += s[2]; } }
      if (ms.length < 3) return false;
      e.marks = ms; e.data.look = 1; e.data.need = 3;
      e.limit = 2 * sum + 10; // reicht immer: Hin und zurück zu jeder Kerze, mit Puffer
      return true;
    },
    tick(a, e) { take(a, e, () => a.say('A candle is lit.')); return e.marks!.length ? 'run' : 'won'; },
    goal: (a, e) => `Light the candles ${e.data.need - e.marks!.length}/${e.data.need} · ${left(e)} turns`,
    lost: () => 'The candles go out. The spirit sighs.',
  },
  {
    id: 'sarkophag', cat: 'danger', trigger: 'room', biome: 0, title: 'Sarcophagus', tier: 3, limit: 60,
    intro: ['A stone lid scrapes aside. The tomb warden awakens.', 'The sarcophagus opens – and its tenant is in a bad mood.'],
    start(a, e) {
      const t = far(a, e, 3);
      if (t < 0) return false;
      const m = a.spawn(e, a.table()[a.int(0, a.table().length - 1)], t % W, (t / W) | 0);
      a.elite(m, 2, `Tomb warden`);
      for (const i of a.near2(t % W, (t / W) | 0, 1, 1).filter(a.free).slice(0, 2)) a.spawn(e, 'fledermaus', i % W, (i / W) | 0);
      return true;
    },
    tick: killAll,
    goal: (a, e) => `Defeat the tomb warden ${beaten(a, e)}`,
  },
  {
    id: 'gruftfluch', cat: 'challenge', trigger: 'calm', biome: 0, title: 'Crypt curse', tier: 2, limit: 30,
    intro: ['A curse creeps into your bones. Only an altar can break it.', 'Cold fingers on your heart. You must reach the altar!'],
    start(a, e) {
      const s = a.near(7, 14);
      if (!s) return false;
      e.mark = s[1] * W + s[0]; e.data.look = 4;
      e.limit = Math.ceil(s[2] * 2) + 6;
      return true;
    },
    tick(a, e) {
      if (a.atPlayer(e.mark!)) return 'won';
      if (e.turns % 3 === 0) a.hurt(1, 'The crypt curse consumed you.');
      return 'run';
    },
    goal: (a, e) => `Reach the altar, the curse is draining you · ${left(e)} turns`,
    lost: () => 'The curse fades by itself – this time.',
  },
  // ===================== Pilzhöhle (Gebiet 1) =====================
  {
    id: 'sporenwolke', cat: 'danger', trigger: 'calm', biome: 1, title: 'Spore cloud', tier: 2, limit: 8, survive: true,
    intro: ['A mushroom bursts. A green cloud spreads!', 'Pfff – and the air turns green and thick.'],
    start(a, e) {
      const s = a.near(2, 4);
      if (!s) return false;
      e.data.sx = s[0]; e.data.sy = s[1];
      a.warn(a.near2(s[0], s[1], 0, 0));
      return true;
    },
    tick(a, e) {
      a.strike(1, 'gas');
      if (e.turns < e.limit) a.warn(a.near2(e.data.sx, e.data.sy, e.turns, e.turns));
      return 'run';
    },
    goal: (a, e) => `Dodge the green wave · ${left(e)} turns`,
  },
  {
    id: 'pilzring', cat: 'challenge', trigger: 'room', biome: 1, title: 'Fairy ring', tier: 2, limit: 40,
    intro: ['A ring of mushrooms lights up. Whoever holds out inside is rewarded.', 'The mushrooms hum. Step into the circle!'],
    start(a, e) {
      const r = e.room!, cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1);
      e.marks = a.near2(cx, cy, 0, 1).filter(i => a.isFloor(i));
      e.data.look = 2; e.data.hold = 0;
      return e.marks.length >= 3;
    },
    tick(a, e) {
      if (e.marks!.some(m => a.atPlayer(m))) e.data.hold++;
      if (e.data.hold >= 5) return 'won';
      if (e.turns % 3 === 1 && e.total < 3) { const s = shuffled(a, a.edge(e.room!))[0]; if (s) a.spawn(e, 'sporling', s[0], s[1]); }
      return 'run';
    },
    goal: (a, e) => `Hold the fairy ring ${e.data.hold}/5 · ${left(e)} turns`,
    lost: () => 'The ring fades.',
  },
  {
    id: 'leuchtpilze', cat: 'flavour', trigger: 'calm', biome: 1, title: 'Glowing mushrooms', tier: 0, limit: 40, survive: true,
    intro: ['Blue mushrooms glow all around. They smell ... healthy.', 'Blue mushrooms! They heal, they say.'],
    start(a, e) {
      const ms: number[] = [];
      for (let k = 0; k < 6 && ms.length < 3; k++) { const s = a.near(2, 9); if (s && !ms.includes(s[1] * W + s[0])) ms.push(s[1] * W + s[0]); }
      if (!ms.length) return false;
      e.marks = ms; e.data.look = 2; e.data.need = ms.length; e.data.healed = 0;
      return true;
    },
    tick(a, e) { take(a, e, () => { e.data.healed += a.heal(0.12); }); return e.marks!.length ? 'run' : 'won'; },
    goal: (a, e) => `Collect the glowing mushrooms ${e.data.need - e.marks!.length}/${e.data.need} · ${left(e)} turns`,
    won: (a, e) => (e.data.need - e.marks!.length ? `${e.data.healed} life, ${a.souls(3 * (e.data.need - e.marks!.length))} souls` : 'the mushrooms have wilted'),
  },
  {
    id: 'fledermaeuse', cat: 'challenge', trigger: 'calm', biome: 1, title: 'Bat swarm', tier: 1, limit: 30,
    intro: ['Flutter, flutter – a whole swarm!', 'The ceiling moves. The ceiling is bats.'],
    start(a, e) {
      for (let k = 0; k < 4 + (a.floor >= 8 ? 1 : 0); k++) { const s = a.near(3, 6); if (s) a.spawn(e, 'fledermaus', s[0], s[1]); }
      return e.mobs.length > 0;
    },
    tick: killAll,
    goal: (a, e) => `Drive off the swarm ${beaten(a, e)}`,
  },
  {
    id: 'wurzeln', cat: 'challenge', trigger: 'calm', biome: 1, title: 'Root grip', tier: 1, limit: 30,
    intro: ['Roots shoot up and grab your feet!', 'Something grabs your ankles. Wood. Living wood.'],
    start(a, e) {
      const s = a.near(3, 6);
      if (!s) return false;
      a.root(2);
      spawnAt(a, e, [[s[0], s[1]]], 1);
      const s2 = a.near(3, 6); if (s2 && (s2[0] !== s[0] || s2[1] !== s[1])) a.spawn(e, 'sporling', s2[0], s2[1]);
      a.warn(a.near2(a.p.x, a.p.y, 1, 1));
      return true;
    },
    tick(a, e) { a.strike(2, 'spike'); return killAll(a, e); },
    goal: (a, e) => `Break free and defeat them ${beaten(a, e)}`,
  },
  {
    id: 'schlamm', cat: 'challenge', trigger: 'room', biome: 1, title: 'Mud flood', tier: 2, limit: 35,
    intro: ['Brown mud oozes from the floor. Step in and you get stuck!', 'Blub. The floor turns to mush.'],
    start(a, e) {
      const pi = a.p.y * W + a.p.x;
      a.mud(a.roomTiles(e.room!).filter(i => i !== pi && a.isFloor(i) && a.chance(0.35)));
      return spawnAt(a, e, shuffled(a, a.edge(e.room!)), 2 + (a.floor >= 8 ? 1 : 0));
    },
    tick: killAll,
    goal: (a, e) => `Defeat them, avoid the mud ${beaten(a, e)}`,
  },
  {
    id: 'riesenpilz', cat: 'danger', trigger: 'room', biome: 1, title: 'Giant mushroom', tier: 2, limit: 15, survive: true,
    intro: ['A giant mushroom pulses. It is about to burst!', 'The mushroom in the middle swells. And again. And again.'],
    start(a, e) {
      const t = far(a, e, 3);
      if (t < 0) return false;
      a.spawn(e, 'riesenpilz', t % W, (t / W) | 0);
      e.data.px = t % W; e.data.py = (t / W) | 0;
      return true;
    },
    tick(a, e) {
      a.strike(2, 'gas');
      if (!a.alive(e).length) return 'won';
      if (e.turns % 3 === 2) a.warn(a.near2(e.data.px, e.data.py, 1, 2));
      return 'run';
    },
    goal: (a, e) => `Destroy the giant mushroom or keep your distance · ${left(e)} turns`,
  },
  {
    id: 'brutnest', cat: 'challenge', trigger: 'room', biome: 1, title: 'Brood nest', tier: 0, limit: 50,
    intro: ['Green eggs pulse. Destroy them before they hatch!', 'A nest. It twitches. Quick!'],
    start(a, e) {
      e.data.hatch = 12;
      for (let k = 0; k < 3; k++) { const t = far(a, e, 2); if (t >= 0) a.spawn(e, 'ei', t % W, (t / W) | 0); }
      return e.mobs.length > 0;
    },
    tick(a, e) {
      if (e.turns === e.data.hatch) {
        const eggs = a.alive(e).filter(m => m.name === 'Spore egg');
        if (eggs.length) { a.say('The eggs hatch!'); e.data.hatched = 1; }
        for (const m of eggs) { a.remove(m); a.spawn(e, 'sporling', m.x, m.y); }
      }
      return a.alive(e).some(m => m.hp > 0) ? 'run' : 'won';
    },
    goal: (a, e) => (e.data.hatched ? `Defeat the brood ${beaten(a, e)}` : `Destroy the eggs · hatching in ${Math.max(0, e.data.hatch - e.turns)} turns`),
    won: (a, e) => (e.data.hatched ? a.reward(1) : a.reward(2)),
  },
  // ===================== Glutschmiede (Gebiet 2) =====================
  {
    id: 'lavariss', cat: 'danger', trigger: 'room', biome: 2, title: 'Lava rift', tier: 2, limit: 9, survive: true,
    intro: ['The floor splits. Embers crawl across the room!', 'A rift. Inside: liquid fire. It is growing.'],
    start(a, e) {
      const r = e.room!, hor = r.w >= r.h;
      e.data.dx = hor ? 1 : 0; e.data.len = hor ? r.w : r.h;
      e.data.x0 = hor ? r.x : r.x + a.int(0, r.w - 1); e.data.y0 = hor ? r.y + a.int(0, r.h - 1) : r.y;
      e.data.at = 0;
      lava(a, e);
      return true;
    },
    tick(a, e) { a.strike(2, 'fire'); if (e.turns < e.limit) lava(a, e); return 'run'; },
    goal: (a, e) => `Get away from the ember trail · ${left(e)} turns`,
  },
  {
    id: 'esse', cat: 'danger', trigger: 'room', biome: 2, title: 'Forge eruption', tier: 2, limit: 8, survive: true,
    intro: ['The forges hiss. Jets of fire shoot across the room!', 'Hiss! Flames burst from the walls.'],
    start(a, e) { esse(a, e); return true; },
    tick(a, e) { a.strike(3, 'fire'); if (e.turns < e.limit) esse(a, e); return 'run'; },
    goal: (a, e) => `Avoid the red rows · ${left(e)} turns`,
  },
  {
    id: 'glutschwarm', cat: 'challenge', trigger: 'calm', biome: 2, title: 'Ember spirit swarm', tier: 2, limit: 40,
    intro: ['Sparks dance – and grow faces.', 'The embers rise. Several times.'],
    start(a, e) {
      for (let k = 0; k < 3 + (a.floor >= 13 ? 1 : 0); k++) { const s = a.near(4, 7); if (s) a.spawn(e, 'glutgeist', s[0], s[1]); }
      return e.mobs.length > 0;
    },
    tick: killAll,
    goal: (a, e) => `Put out the ember spirits ${beaten(a, e)}`,
  },
  {
    id: 'golem', cat: 'danger', trigger: 'room', biome: 2, title: 'Armour golem awakens', tier: 3, limit: 60,
    intro: ['The armour on the wall moves. It is not empty.', 'Clank. A golem of forged steel stands up.'],
    start(a, e) {
      const t = far(a, e, 3);
      if (t < 0) return false;
      a.elite(a.spawn(e, 'golem', t % W, (t / W) | 0), 1.5, 'Armour golem');
      return true;
    },
    tick: killAll,
    goal: () => 'Defeat the armour golem',
  },
  {
    id: 'funken', cat: 'challenge', trigger: 'calm', biome: 2, title: 'Spark rain', tier: 1, limit: 8, survive: true,
    intro: ['Sparks rain from the ceiling!', 'A rain of sparks. Keep moving!'],
    start(a, e) { sparks(a); return true; },
    tick(a, e) { a.strike(2, 'fire'); if (e.turns < e.limit) sparks(a); return 'run'; },
    goal: (a, e) => `Dodge the sparks · ${left(e)} turns`,
  },
  {
    id: 'amboss', cat: 'challenge', trigger: 'room', biome: 2, title: 'Anvil rhythm', tier: 2, limit: 8, survive: true,
    intro: ['BANG – bang – BANG. The hammers strike in rhythm. Keep moving!', 'Invisible hammers. Every other stone. In rhythm.'],
    start(a, e) { anvil(a, e); return true; },
    tick(a, e) { a.strike(3, 'hammer'); if (e.turns < e.limit) anvil(a, e); return 'run'; },
    goal: (a, e) => `Keep the rhythm: move one tile every turn · ${left(e)} turns`,
  },
  {
    id: 'glutader', cat: 'challenge', trigger: 'calm', biome: 2, title: 'Ember vein', tier: 1, limit: 12, survive: true,
    intro: ['The floor glows. Only the blue cooling plates are safe.', 'Heat rises. Find a cooling plate!'],
    start(a, e) {
      const ms: number[] = [];
      for (let k = 0; k < 8 && ms.length < 4; k++) { const s = a.near(2, 6); if (s && !ms.includes(s[1] * W + s[0])) ms.push(s[1] * W + s[0]); }
      if (!ms.length) return false;
      e.marks = ms; e.data.look = 3;
      return true;
    },
    tick(a, e) { if (e.turns % 2 === 0 && !e.marks!.some(m => a.atPlayer(m))) a.hurt(1, 'The ember vein burned you.'); return 'run'; },
    goal: (a, e) => `Stand on a cooling plate · ${left(e)} turns`,
  },
  {
    id: 'ofen', cat: 'danger', trigger: 'room', biome: 2, title: 'Smelting furnace', tier: 2, limit: 10, survive: true,
    intro: ['The furnace spits out barrels – with lit fuses!', 'Rumble, rumble – barrels roll in. They hiss.'],
    start(a, e) { kegs(a, e); return true; },
    tick(a, e) { if (e.turns % 3 === 0 && e.turns < e.limit - 2) kegs(a, e); return 'run'; },
    goal: (a, e) => `Keep away from the barrels · ${left(e)} turns`,
  },
];

export const EVENT_BY_ID: Record<string, EvDef> = Object.fromEntries(EVENTS.map(d => [d.id, d]));

// Kleine Fundstücke an ruhigen Stellen – ohne jede Wirkung
export const NOTES = [
  'Kurt was here. Kurt is no longer here.',
  'Please do not light the barrels. – The Management',
  'Day 3: The rats have my cheese. Day 4: The rats have me.',
  'Whoever reads this went too deep.',
  'Chests don\'t bite. Mostly.',
  'Caution, wet paint. (200 years ago.)',
  'My sword for a loaf of bread.',
  'Note to self: the stairs go DOWN.',
  'Skeletons don\'t count as company.',
  'Exit -> (crossed out)',
  'Dear Mum, I\'m fine. The gold is real.',
  'Here lies Gerd. He stepped on the red floor.',
  'Do NOT touch the bell.',
  'If you find this: I was faster.',
  'Recipe: mushrooms that don\'t glow.',
  'The trader gives no discount. I asked. Twice.',
  'Who took the ladder?!',
  'Golems don\'t like jokes.',
  'I\'m not lost. I\'m exploring.',
  'This wall is cracked. So is this one. All walls are cracked.',
  'Bounty hunters wanted. Pay: fame (little).',
  'An X on the map. Sadly, no map.',
  'Happiness is a full healing potion.',
  'Please do not annoy the statues.',
];
