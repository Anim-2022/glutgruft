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
  strike(dmg: number, fx: 'spike' | 'rock'): void; // trifft alle auf den gewarnten Feldern, löscht die Warnung
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
