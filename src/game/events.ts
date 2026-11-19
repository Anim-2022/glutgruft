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
    id: 'hinterhalt', cat: 'danger', trigger: 'room', title: 'Hinterhalt!', tier: 2, limit: 40,
    intro: ['Aus den Schatten springen Gegner hervor!', 'Ein Pfiff – und von allen Seiten kommen sie.', 'Das war eine Falle. Jetzt heißt es kämpfen.'],
    start(a, e) { return spawnAt(a, e, shuffled(a, a.edge(e.room!)), 2 + (a.floor >= 6 ? 1 : 0), 1); },
    tick: killAll,
    goal: (a, e) => `Besiege die Angreifer ${beaten(a, e)}`,
  },
  {
    id: 'fallenkammer', cat: 'danger', trigger: 'room', title: 'Fallenkammer!', tier: 2, limit: 8, survive: true,
    intro: ['Gitter fallen herab! Aus dem Boden schießen Stacheln.', 'Klack. Die Türen sind zu. Der Boden hat Löcher.'],
    start(a, e) { a.seal(e); spikeWarn(a, e); return true; },
    tick(a, e) {
      a.strike(3 + Math.floor(a.floor / 2), 'spike');
      if (e.turns < e.limit) spikeWarn(a, e);
      return 'run';
    },
    goal: (a, e) => `Weiche den roten Feldern aus · noch ${left(e)} Züge`,
  },
  {
    id: 'netzfalle', cat: 'challenge', trigger: 'calm', title: 'Netzfalle!', tier: 1, limit: 30,
    intro: ['Ein klebriges Netz fällt von der Decke!', 'Du trittst in ein Netz – und hörst Schritte.'],
    start(a, e) {
      const s1 = a.near(4, 7), s2 = a.near(4, 7);
      if (!s1) return false;
      a.root(3);
      spawnAt(a, e, [[s1[0], s1[1]], ...(s2 && (s2[0] !== s1[0] || s2[1] !== s1[1]) ? [[s2[0], s2[1]] as [number, number]] : [])], 2);
      return true;
    },
    tick: killAll,
    goal: (a, e) => `Reiß dich los und besiege sie ${beaten(a, e)}`,
  },
  {
    id: 'einsturz', cat: 'challenge', trigger: 'room', title: 'Einsturz!', tier: 2, limit: 6, survive: true,
    intro: ['Die Decke knirscht. Steine lösen sich!', 'Staub rieselt. Gleich kommt hier alles herunter.'],
    start(a, e) { if (a.roomTiles(e.room!).length <= 6) return false; rockWarn(a, e); return true; },
    tick(a, e) {
      a.strike(4 + Math.floor(a.floor / 2), 'rock');
      if (e.turns < e.limit) rockWarn(a, e);
      return 'run';
    },
    goal: (a, e) => `Raus aus dem Raum oder ausweichen · noch ${left(e)} Züge`,
  },
  {
    id: 'dieb', cat: 'challenge', trigger: 'calm', title: 'Diebesratte!', tier: 0, limit: 15, vanish: true,
    intro: ['Eine Ratte schnappt sich deinen Geldbeutel!', 'Etwas zupft an deinem Gürtel – dein Gold!'],
    start(a, e) {
      const s = a.near(2, 3);
      if (!s) return false;
      a.spawn(e, 'dieb', s[0], s[1]);
      e.data.stolen = a.takeGold(8 + 3 * a.floor);
      a.say(e.data.stolen ? `Die Ratte hat ${e.data.stolen} Gold!` : 'Die Ratte findet nichts und ist beleidigt.');
      return true;
    },
    tick: killAll,
    goal: (a, e) => `Fang die Diebesratte · noch ${left(e)} Züge`,
    won: (a, e) => `${a.gold(Math.max(Math.round(1.5 * e.data.stolen), 5 + a.floor))} Gold zurück`,
    lost: (a, e) => (e.data.stolen ? `Die Ratte ist mit ${e.data.stolen} Gold verschwunden.` : 'Die Ratte ist verschwunden.'),
  },
  {
    id: 'goblin', cat: 'challenge', trigger: 'calm', title: 'Schatzgoblin!', tier: 3, limit: 20, vanish: true,
    intro: ['Ein Goblin mit einem prall gefüllten Sack kichert und rennt los!', 'Klimper, klimper – ein Schatzgoblin!'],
    start(a, e) { const s = a.near(4, 7); if (!s) return false; a.spawn(e, 'goblin', s[0], s[1]); return true; },
    tick: killAll,
    goal: (a, e) => `Erwische den Schatzgoblin · noch ${left(e)} Züge`,
    lost: () => 'Der Goblin ist mit seinem Schatz entwischt.',
  },
  {
    id: 'geist', cat: 'flavour', trigger: 'calm', title: 'Verirrter Geist', tier: 2, limit: 30,
    intro: ['Ein blasser Geist winkt dir zu und schwebt davon.', '"Folge mir ...", flüstert ein Licht.'],
    start(a, e) {
      const s = a.near(8, 14);
      if (!s) return false;
      e.mark = s[1] * W + s[0];
      e.limit = Math.ceil(s[2] * 1.5) + 3;
      return true;
    },
    tick: (a, e) => (a.atPlayer(e.mark!) ? 'won' : 'run'),
    goal: (a, e) => `Folge dem Geist zum Licht · noch ${left(e)} Züge`,
    lost: () => 'Der Geist verblasst.',
  },
  {
    id: 'kopfgeld', cat: 'danger', trigger: 'calm', title: 'Kopfgeld', tier: 3, limit: 150,
    intro: ['An der Wand hängt ein Steckbrief: "Gesucht – tot."', 'Ein Zettel: "Belohnung für diesen Kerl." Er ist hier unten.'],
    start(a, e) {
      const s = a.near(10, 40);
      if (!s) return false;
      const m = a.spawn(e, a.table()[a.int(0, a.table().length - 1)], s[0], s[1]);
      m.name = `Gesucht: ${m.name}`;
      m.maxHp = m.hp = Math.round(m.hp * 1.8); m.atk += 2; m.awake = false;
      return true;
    },
    tick: killAll,
    goal: () => 'Finde und besiege den Gesuchten (Karte: gelb)',
    lost: () => 'Das Kopfgeld ist verfallen.',
  },
  {
    id: 'glocke', cat: 'danger', trigger: 'room', title: 'Alarmglocke!', tier: 2, limit: 15, survive: true,
    intro: ['Du stößt an einen Draht – irgendwo läutet eine Glocke!', 'BIMM! BAMM! Die ganze Gegend ist wach.'],
    start(a, e) { e.data.n = a.wake(e, 7, 25); return true; },
    tick: (a, e) => (e.data.n && !a.alive(e).length ? 'won' : 'run'),
    goal: (a, e) => `Überlebe noch ${left(e)} Züge (${a.alive(e).length} geweckt)`,
  },
  {
    id: 'seelen', cat: 'flavour', trigger: 'calm', title: 'Seelensturm', tier: 0, limit: 20, vanish: true, survive: true,
    intro: ['Seelenlichter tanzen um dich herum. Fang sie!', 'Ein Hauch – und plötzlich schweben Lichter überall.'],
    start(a, e) {
      for (let k = 0; k < 5; k++) { const s = a.near(2, 7); if (s) a.spawn(e, 'irrlicht', s[0], s[1]); }
      return e.mobs.length > 0;
    },
    tick: (a, e) => (a.alive(e).length ? 'run' : 'won'),
    goal: (a, e) => `Fange die Seelenlichter ${beaten(a, e)} · noch ${left(e)} Züge`,
    won: (a, e) => { const n = e.total - a.alive(e).length; return n ? `${a.souls(2 * n)} Seelen` : 'kein einziges Licht – nächstes Mal'; },
  },
  {
    id: 'nebel', cat: 'challenge', trigger: 'calm', title: 'Fluchnebel', tier: 1, limit: 15, survive: true,
    intro: ['Kalter Nebel kriecht heran. Du siehst kaum noch etwas.', 'Der Nebel flüstert. Etwas bewegt sich darin.'],
    start(a, e) { e.data.fog = 1; const s = a.near(5, 9); if (s) spawnAt(a, e, [[s[0], s[1]]], 1); return true; },
    tick: () => 'run',
    goal: (a, e) => `Überstehe den Nebel · noch ${left(e)} Züge`,
  },
  {
    id: 'tote', cat: 'danger', trigger: 'room', title: 'Die Toten erheben sich', tier: 2, limit: 40,
    intro: ['Der Boden bricht auf – Hände greifen nach oben!', 'Knochen klappern. Hier ruht niemand in Frieden.'],
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
        if (spawnAt(a, e, spots, spots.length)) { a.say('Die zweite Welle!'); return 'run'; }
      }
      return 'won';
    },
    goal: (a, e) => `Welle ${e.data.wave}/2 · besiegt ${beaten(a, e)}`,
  },
  {
    id: 'wettlauf', cat: 'challenge', trigger: 'calm', title: 'Wettlauf', tier: 2, limit: 30,
    intro: ['Irgendwo leuchtet eine Truhe auf – sie wird nicht lange halten!', 'Eine goldene Truhe erscheint. Schnell!'],
    start(a, e) {
      const s = a.near(8, 16);
      if (!s) return false;
      e.mark = s[1] * W + s[0];
      e.data.chest = 1;
      e.limit = Math.ceil(s[2] * 1.5) + 3;
      return true;
    },
    tick: (a, e) => (a.atPlayer(e.mark!) ? 'won' : 'run'),
    goal: (a, e) => `Erreiche die leuchtende Truhe · noch ${left(e)} Züge`,
    lost: () => 'Die Truhe zerfällt zu Staub.',
  },
  {
    id: 'zwilling', cat: 'danger', trigger: 'room', title: 'Schattenzwilling', tier: 3, limit: 60,
    intro: ['Dein Schatten löst sich von der Wand – und zieht die Waffe.', 'Aus dem Dunkel tritt jemand, der aussieht wie du.'],
    start(a, e) {
      const tiles = a.roomTiles(e.room!).filter(i => Math.abs((i % W) - a.p.x) + Math.abs(((i / W) | 0) - a.p.y) >= 3);
      if (!tiles.length) return false;
      const i = tiles[a.int(0, tiles.length - 1)];
      a.shadow(e, i % W, (i / W) | 0);
      return true;
    },
    tick: killAll,
    goal: () => 'Besiege deinen Schatten',
  },
  // ===================== Gruft (Gebiet 0) =====================
  {
    id: 'parade', cat: 'danger', trigger: 'room', biome: 0, title: 'Skelettparade', tier: 2, limit: 40,
    intro: ['Der Boden klappert. Knochen fügen sich zusammen – einer nach dem anderen.', 'Unter den Fliesen regt sich etwas. Viele etwas.'],
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
    goal: (a, e) => (e.data.left > 0 ? `Gleich steigt ein Skelett aus dem roten Feld · noch ${e.data.left}` : `Besiege die Parade ${beaten(a, e)}`),
  },
  {
    id: 'rivale', cat: 'danger', trigger: 'calm', biome: 0, title: 'Rivalisierender Abenteurer', tier: 3, limit: 60, vanish: true,
    intro: ['"Die Beute hier unten gehört MIR!", ruft jemand.', 'Ein anderer Abenteurer zieht die Waffe. Er will deinen Fund.'],
    start(a, e) { const s = a.near(5, 9); if (!s) return false; a.rival(e, s[0], s[1]); return true; },
    tick: killAll,
    goal: () => 'Besiege den Rivalen',
    lost: () => 'Der Rivale zieht lachend ab.',
  },
  {
    id: 'spukglocke', cat: 'challenge', trigger: 'calm', biome: 0, title: 'Spukglocke', tier: 2, limit: 13, survive: true,
    intro: ['Eine Glocke läutet von selbst. Und noch einmal.', 'Dong ... dong ... Die Toten zählen mit.'],
    start(a, e) { e.data.ring = 0; return true; },
    tick(a, e) {
      if (e.turns % 4 === 1 && e.data.ring < 3) { e.data.ring++; const n = a.wake(e, 2, 30); a.say(`Die Glocke läutet (${e.data.ring}/3)${n ? ' – etwas erwacht.' : '.'}`); }
      return 'run';
    },
    goal: (a, e) => `Überstehe das Läuten (${e.data.ring}/3) · noch ${left(e)} Züge`,
  },
  {
    id: 'ratten', cat: 'challenge', trigger: 'room', biome: 0, title: 'Rattenschwarm', tier: 1, limit: 40,
    intro: ['Quiek. Quiek? QUIEK! Aus jeder Ritze kommen Ratten.', 'Der Boden bewegt sich. Er ist voller Ratten.'],
    start(a, e) {
      for (const [x, y] of shuffled(a, a.edge(e.room!)).slice(0, 5 + (a.floor >= 3 ? 1 : 0))) a.spawn(e, 'ratte', x, y);
      return e.mobs.length > 0;
    },
    tick: killAll,
    goal: (a, e) => `Vertreibe die Ratten ${beaten(a, e)}`,
  },
  {
    id: 'koloss', cat: 'danger', trigger: 'room', biome: 0, title: 'Knochenkoloss', tier: 3, limit: 60,
    intro: ['Der Knochenhaufen in der Ecke steht auf. Er ist sehr groß.', 'Hunderte Knochen, ein Wille. Der Koloss erwacht.'],
    start(a, e) {
      const t = far(a, e, 3);
      if (t < 0) return false;
      const m = a.spawn(e, 'skelett', t % W, (t / W) | 0);
      a.elite(m, 2.2, 'Knochenkoloss');
      return true;
    },
    tick: killAll,
    goal: () => 'Zerschlage den Knochenkoloss',
  },
  {
    id: 'kerzen', cat: 'challenge', trigger: 'calm', biome: 0, title: 'Geisterkerzen', tier: 2, limit: 40,
    intro: ['Drei kalte Kerzen flackern auf. Entzünde sie, bevor der Geist geht.', 'Eine Stimme: "Licht ... bring mir Licht ..."'],
    start(a, e) {
      const ms: number[] = []; let sum = 0;
      for (let k = 0; k < 6 && ms.length < 3; k++) { const s = a.near(4, 12); if (s && !ms.includes(s[1] * W + s[0])) { ms.push(s[1] * W + s[0]); sum += s[2]; } }
      if (ms.length < 3) return false;
      e.marks = ms; e.data.look = 1; e.data.need = 3;
      e.limit = 2 * sum + 4; // reicht immer: Hin und zurück zu jeder Kerze
      return true;
    },
    tick(a, e) { take(a, e, () => a.say('Eine Kerze brennt.')); return e.marks!.length ? 'run' : 'won'; },
    goal: (a, e) => `Entzünde die Kerzen ${e.data.need - e.marks!.length}/${e.data.need} · noch ${left(e)} Züge`,
    lost: () => 'Die Kerzen erlöschen. Der Geist seufzt.',
  },
  {
    id: 'sarkophag', cat: 'danger', trigger: 'room', biome: 0, title: 'Sarkophag', tier: 3, limit: 60,
    intro: ['Ein Steindeckel schabt zur Seite. Der Grabwächter erwacht.', 'Der Sarkophag öffnet sich – und sein Bewohner ist schlecht gelaunt.'],
    start(a, e) {
      const t = far(a, e, 3);
      if (t < 0) return false;
      const m = a.spawn(e, a.table()[a.int(0, a.table().length - 1)], t % W, (t / W) | 0);
      a.elite(m, 2, `Grabwächter`);
      for (const i of a.near2(t % W, (t / W) | 0, 1, 1).filter(a.free).slice(0, 2)) a.spawn(e, 'fledermaus', i % W, (i / W) | 0);
      return true;
    },
    tick: killAll,
    goal: (a, e) => `Besiege den Grabwächter ${beaten(a, e)}`,
  },
  {
    id: 'gruftfluch', cat: 'challenge', trigger: 'calm', biome: 0, title: 'Gruftfluch', tier: 2, limit: 30,
    intro: ['Ein Fluch kriecht in deine Knochen. Nur ein Altar kann ihn brechen.', 'Kalte Finger an deinem Herzen. Du musst zum Altar!'],
    start(a, e) {
      const s = a.near(7, 14);
      if (!s) return false;
      e.mark = s[1] * W + s[0]; e.data.look = 4;
      e.limit = Math.ceil(s[2] * 1.5) + 3;
      return true;
    },
    tick(a, e) {
      if (a.atPlayer(e.mark!)) return 'won';
      if (e.turns % 3 === 0) a.hurt(1, 'Der Gruftfluch hat dich verzehrt.');
      return 'run';
    },
    goal: (a, e) => `Erreiche den Altar, der Fluch zehrt · noch ${left(e)} Züge`,
    lost: () => 'Der Fluch verfliegt von selbst – diesmal.',
  },
  // ===================== Pilzhöhle (Gebiet 1) =====================
  {
    id: 'sporenwolke', cat: 'danger', trigger: 'calm', biome: 1, title: 'Sporenwolke', tier: 2, limit: 8, survive: true,
    intro: ['Ein Pilz platzt. Eine grüne Wolke breitet sich aus!', 'Pfff – und die Luft wird grün und dick.'],
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
    goal: (a, e) => `Weiche der grünen Welle aus · noch ${left(e)} Züge`,
  },
  {
    id: 'pilzring', cat: 'challenge', trigger: 'room', biome: 1, title: 'Pilzring', tier: 2, limit: 30,
    intro: ['Ein Ring aus Pilzen leuchtet auf. Wer darin ausharrt, wird belohnt.', 'Die Pilze summen. Stell dich in den Kreis!'],
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
    goal: (a, e) => `Halte den Pilzring ${e.data.hold}/5 · noch ${left(e)} Züge`,
    lost: () => 'Der Ring verblasst.',
  },
  {
    id: 'leuchtpilze', cat: 'flavour', trigger: 'calm', biome: 1, title: 'Leuchtpilze', tier: 0, limit: 25, survive: true,
    intro: ['Ringsum leuchten blaue Pilze. Sie riechen ... gesund.', 'Blaue Pilze! Die heilen, sagt man.'],
    start(a, e) {
      const ms: number[] = [];
      for (let k = 0; k < 6 && ms.length < 3; k++) { const s = a.near(2, 9); if (s && !ms.includes(s[1] * W + s[0])) ms.push(s[1] * W + s[0]); }
      if (!ms.length) return false;
      e.marks = ms; e.data.look = 2; e.data.need = ms.length; e.data.healed = 0;
      return true;
    },
    tick(a, e) { take(a, e, () => { e.data.healed += a.heal(0.12); }); return e.marks!.length ? 'run' : 'won'; },
    goal: (a, e) => `Sammle die Leuchtpilze ${e.data.need - e.marks!.length}/${e.data.need} · noch ${left(e)} Züge`,
    won: (a, e) => (e.data.need - e.marks!.length ? `${e.data.healed} Leben, ${a.souls(3 * (e.data.need - e.marks!.length))} Seelen` : 'die Pilze sind verwelkt'),
  },
  {
    id: 'fledermaeuse', cat: 'challenge', trigger: 'calm', biome: 1, title: 'Fledermausschwarm', tier: 1, limit: 30,
    intro: ['Flatter, flatter – ein ganzer Schwarm!', 'Die Decke bewegt sich. Die Decke sind Fledermäuse.'],
    start(a, e) {
      for (let k = 0; k < 4 + (a.floor >= 8 ? 1 : 0); k++) { const s = a.near(3, 6); if (s) a.spawn(e, 'fledermaus', s[0], s[1]); }
      return e.mobs.length > 0;
    },
    tick: killAll,
    goal: (a, e) => `Vertreibe den Schwarm ${beaten(a, e)}`,
  },
  {
    id: 'wurzeln', cat: 'challenge', trigger: 'calm', biome: 1, title: 'Wurzelgriff', tier: 1, limit: 30,
    intro: ['Wurzeln schießen aus dem Boden und packen deine Füße!', 'Etwas greift nach deinen Knöcheln. Holz. Lebendiges Holz.'],
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
    goal: (a, e) => `Reiß dich los und besiege sie ${beaten(a, e)}`,
  },
  {
    id: 'schlamm', cat: 'challenge', trigger: 'room', biome: 1, title: 'Schlammflut', tier: 2, limit: 35,
    intro: ['Brauner Schlamm quillt aus dem Boden. Wer hineintritt, bleibt stecken!', 'Blubb. Der Boden wird zu Brei.'],
    start(a, e) {
      const pi = a.p.y * W + a.p.x;
      a.mud(a.roomTiles(e.room!).filter(i => i !== pi && a.isFloor(i) && a.chance(0.35)));
      return spawnAt(a, e, shuffled(a, a.edge(e.room!)), 2 + (a.floor >= 8 ? 1 : 0));
    },
    tick: killAll,
    goal: (a, e) => `Besiege sie, meide den Schlamm ${beaten(a, e)}`,
  },
  {
    id: 'riesenpilz', cat: 'danger', trigger: 'room', biome: 1, title: 'Riesenpilz', tier: 2, limit: 15, survive: true,
    intro: ['Ein riesiger Pilz pulsiert. Gleich platzt er!', 'Der Pilz in der Mitte bläht sich auf. Und wieder. Und wieder.'],
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
    goal: (a, e) => `Zerstöre den Riesenpilz oder halte Abstand · noch ${left(e)} Züge`,
  },
  {
    id: 'brutnest', cat: 'challenge', trigger: 'room', biome: 1, title: 'Brutnest', tier: 0, limit: 40,
    intro: ['Grüne Eier pulsieren. Zerstöre sie, bevor sie schlüpfen!', 'Ein Nest. Es zuckt. Schnell!'],
    start(a, e) {
      e.data.hatch = 8;
      for (let k = 0; k < 3; k++) { const t = far(a, e, 2); if (t >= 0) a.spawn(e, 'ei', t % W, (t / W) | 0); }
      return e.mobs.length > 0;
    },
    tick(a, e) {
      if (e.turns === e.data.hatch) {
        const eggs = a.alive(e).filter(m => m.name === 'Sporenei');
        if (eggs.length) { a.say('Die Eier schlüpfen!'); e.data.hatched = 1; }
        for (const m of eggs) { a.remove(m); a.spawn(e, 'sporling', m.x, m.y); }
      }
      return a.alive(e).some(m => m.hp > 0) ? 'run' : 'won';
    },
    goal: (a, e) => (e.data.hatched ? `Besiege die Brut ${beaten(a, e)}` : `Zerstöre die Eier · schlüpfen in ${Math.max(0, e.data.hatch - e.turns)} Zügen`),
    won: (a, e) => (e.data.hatched ? a.reward(1) : a.reward(2)),
  },
  // ===================== Glutschmiede (Gebiet 2) =====================
  {
    id: 'lavariss', cat: 'danger', trigger: 'room', biome: 2, title: 'Lavariss', tier: 2, limit: 9, survive: true,
    intro: ['Der Boden reißt auf. Glut kriecht quer durch den Raum!', 'Ein Riss. Darin: flüssiges Feuer. Es wird länger.'],
    start(a, e) {
      const r = e.room!, hor = r.w >= r.h;
      e.data.dx = hor ? 1 : 0; e.data.len = hor ? r.w : r.h;
      e.data.x0 = hor ? r.x : r.x + a.int(0, r.w - 1); e.data.y0 = hor ? r.y + a.int(0, r.h - 1) : r.y;
      e.data.at = 0;
      lava(a, e);
      return true;
    },
    tick(a, e) { a.strike(2, 'fire'); if (e.turns < e.limit) lava(a, e); return 'run'; },
    goal: (a, e) => `Weg von der Glutspur · noch ${left(e)} Züge`,
  },
  {
    id: 'esse', cat: 'danger', trigger: 'room', biome: 2, title: 'Esse-Ausbruch', tier: 2, limit: 8, survive: true,
    intro: ['Die Essen fauchen. Feuerstrahlen schießen quer durch den Raum!', 'Zisch! Aus den Wänden schlagen Flammen.'],
    start(a, e) { esse(a, e); return true; },
    tick(a, e) { a.strike(3, 'fire'); if (e.turns < e.limit) esse(a, e); return 'run'; },
    goal: (a, e) => `Meide die roten Reihen · noch ${left(e)} Züge`,
  },
  {
    id: 'glutschwarm', cat: 'challenge', trigger: 'calm', biome: 2, title: 'Glutgeist-Schwarm', tier: 2, limit: 40,
    intro: ['Funken tanzen – und bekommen Gesichter.', 'Die Glut erhebt sich. Mehrmals.'],
    start(a, e) {
      for (let k = 0; k < 3 + (a.floor >= 13 ? 1 : 0); k++) { const s = a.near(4, 7); if (s) a.spawn(e, 'glutgeist', s[0], s[1]); }
      return e.mobs.length > 0;
    },
    tick: killAll,
    goal: (a, e) => `Lösche die Glutgeister ${beaten(a, e)}`,
  },
  {
    id: 'golem', cat: 'danger', trigger: 'room', biome: 2, title: 'Rüstungsgolem erwacht', tier: 3, limit: 60,
    intro: ['Die Rüstung an der Wand bewegt sich. Sie ist nicht leer.', 'Klirr. Ein Golem aus Schmiedestahl richtet sich auf.'],
    start(a, e) {
      const t = far(a, e, 3);
      if (t < 0) return false;
      a.elite(a.spawn(e, 'golem', t % W, (t / W) | 0), 1.5, 'Rüstungsgolem');
      return true;
    },
    tick: killAll,
    goal: () => 'Besiege den Rüstungsgolem',
  },
  {
    id: 'funken', cat: 'challenge', trigger: 'calm', biome: 2, title: 'Funkenregen', tier: 1, limit: 8, survive: true,
    intro: ['Von der Decke regnet es Funken!', 'Ein Funkenregen. Nicht stehen bleiben!'],
    start(a, e) { sparks(a); return true; },
    tick(a, e) { a.strike(2, 'fire'); if (e.turns < e.limit) sparks(a); return 'run'; },
    goal: (a, e) => `Weiche den Funken aus · noch ${left(e)} Züge`,
  },
  {
    id: 'amboss', cat: 'challenge', trigger: 'room', biome: 2, title: 'Ambossrhythmus', tier: 2, limit: 8, survive: true,
    intro: ['BAMM – bamm – BAMM. Die Hämmer schlagen im Takt. Bleib in Bewegung!', 'Unsichtbare Hämmer. Jeder zweite Stein. Im Takt.'],
    start(a, e) { anvil(a, e); return true; },
    tick(a, e) { a.strike(3, 'hammer'); if (e.turns < e.limit) anvil(a, e); return 'run'; },
    goal: (a, e) => `Halte den Takt: jeden Zug ein Feld weiter · noch ${left(e)} Züge`,
  },
  {
    id: 'glutader', cat: 'challenge', trigger: 'calm', biome: 2, title: 'Glutader', tier: 1, limit: 12, survive: true,
    intro: ['Der Boden glüht. Nur die blauen Kühlplatten sind sicher.', 'Hitze steigt auf. Such dir eine Kühlplatte!'],
    start(a, e) {
      const ms: number[] = [];
      for (let k = 0; k < 8 && ms.length < 4; k++) { const s = a.near(2, 6); if (s && !ms.includes(s[1] * W + s[0])) ms.push(s[1] * W + s[0]); }
      if (!ms.length) return false;
      e.marks = ms; e.data.look = 3;
      return true;
    },
    tick(a, e) { if (e.turns % 2 === 0 && !e.marks!.some(m => a.atPlayer(m))) a.hurt(1, 'Die Glutader hat dich verbrannt.'); return 'run'; },
    goal: (a, e) => `Steh auf einer Kühlplatte · noch ${left(e)} Züge`,
  },
  {
    id: 'ofen', cat: 'danger', trigger: 'room', biome: 2, title: 'Schmelzofen', tier: 2, limit: 10, survive: true,
    intro: ['Der Ofen spuckt Fässer aus – mit brennender Lunte!', 'Rumpel, rumpel – Fässer rollen herein. Sie zischen.'],
    start(a, e) { kegs(a, e); return true; },
    tick(a, e) { if (e.turns % 3 === 0 && e.turns < e.limit - 2) kegs(a, e); return 'run'; },
    goal: (a, e) => `Halte Abstand zu den Fässern · noch ${left(e)} Züge`,
  },
];

export const EVENT_BY_ID: Record<string, EvDef> = Object.fromEntries(EVENTS.map(d => [d.id, d]));

// Kleine Fundstücke an ruhigen Stellen – ohne jede Wirkung
export const NOTES = [
  'Hier war Kurt. Kurt ist nicht mehr hier.',
  'Bitte keine Fässer anzünden. – Die Verwaltung',
  'Tag 3: Die Ratten haben meinen Käse. Tag 4: Die Ratten haben mich.',
  'Wer das liest, ist zu tief gegangen.',
  'Truhen beißen nicht. Meistens.',
  'Achtung, frisch gestrichen. (Vor 200 Jahren.)',
  'Mein Schwert für ein Brot.',
  'Notiz an mich: Die Treppe führt nach UNTEN.',
  'Skelette zählen nicht als Gesellschaft.',
  'Ausgang -> (durchgestrichen)',
  'Liebe Mama, mir geht es gut. Das Gold ist echt.',
  'Hier ruht Gerd. Er hat den roten Boden betreten.',
  'Die Glocke NICHT anfassen.',
  'Wenn du das findest: Ich war schneller.',
  'Rezept: Pilze, die nicht leuchten.',
  'Der Händler gibt keinen Rabatt. Ich habe gefragt. Zweimal.',
  'Wer hat die Leiter mitgenommen?!',
  'Golems mögen keine Witze.',
  'Ich bin nicht verirrt. Ich erkunde.',
  'Diese Wand ist rissig. Diese auch. Alle Wände sind rissig.',
  'Kopfgeldjäger gesucht. Bezahlung: Ruhm (wenig).',
  'Ein Kreuz auf der Karte. Leider ohne Karte.',
  'Glück ist eine volle Heiltrankflasche.',
  'Bitte nicht die Statuen ärgern.',
];
