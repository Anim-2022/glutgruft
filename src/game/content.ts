export type ClassId = 'krieger' | 'magier' | 'waldlaeufer';

export interface SkillDef { name: string; cost: number; desc: string; }
export interface ClassDef {
  id: ClassId; name: string; desc: string;
  hp: number; atk: number; def: number;
  resName: string; resMax: number; resStart: number; resCol: string;
  range: number; // Reichweite des Grundangriffs (0 = nur Nahkampf)
  fokusOnHit?: number; // Klassenressource je Treffer des Grundangriffs (Bruchteile sammeln sich)
  shot: string;
  skills: SkillDef[];
}

export const CLASS_ORDER: ClassId[] = ['krieger', 'magier', 'waldlaeufer'];

export const CLASSES: Record<ClassId, ClassDef> = {
  krieger: {
    id: 'krieger', name: 'Krieger', desc: 'Zäher Nahkämpfer. Wut entsteht durch Treffer und Schmerz.',
    hp: 30, atk: 5, def: 2, resName: 'Wut', resMax: 10, resStart: 0, resCol: '#ef7d57', range: 0, shot: '',
    skills: [
      { name: 'Schildstoß', cost: 2, desc: 'Schaden + betäubt 2 Züge' },
      { name: 'Wirbelschlag', cost: 5, desc: 'Trifft alle Gegner ringsum' },
      { name: 'Kriegsschrei', cost: 4, desc: '+3 Angriff für 6 Züge' },
    ],
  },
  magier: {
    id: 'magier', name: 'Magier', desc: 'Zerbrechlich, aber verheerend. Mana kehrt langsam von selbst zurück.',
    hp: 22, atk: 3, def: 1, resName: 'Mana', resMax: 12, resStart: 12, resCol: '#41a6f6', range: 3, shot: 'Funke',
    skills: [
      { name: 'Feuerball', cost: 6, desc: 'Explosion + Brand' },
      { name: 'Frostnova', cost: 6, desc: 'Friert Gegner in der Nähe ein' },
      { name: 'Blinzeln', cost: 3, desc: 'Teleport weg von Gefahr' },
    ],
  },
  waldlaeufer: {
    id: 'waldlaeufer', name: 'Waldläufer', desc: 'Schütze mit Fallen. Fokus wächst beim Warten im Kampf und mit jedem besiegten Gegner.',
    hp: 26, atk: 4, def: 1, resName: 'Fokus', resMax: 8, resStart: 2, resCol: '#a7f070', range: 5, fokusOnHit: 1, shot: 'Schuss',
    skills: [
      { name: 'Zielschuss', cost: 4, desc: 'Schwerer Schuss auf große Distanz' },
      { name: 'Falle', cost: 2, desc: 'Legt eine Falle: Schaden + Betäubung' },
      { name: 'Ausweichrolle', cost: 2, desc: '2 Felder rollen, weicht Angriffen aus' },
    ],
  },
};

export interface MobDef {
  name: string; hp: number; atk: number; def: number; xp: number;
  ai: 'chase' | 'erratic' | 'slow' | 'boss' | 'flee' | 'wisp' | 'idle';
  range?: number; poison?: boolean; burn?: boolean; boss?: boolean; minion?: string; smash?: boolean;
  hunter?: boolean; // Jäger: eigene KI, kommt, wenn man zu lange auf einer Ebene bleibt
}

export const MOBS: Record<string, MobDef> = {
  ratte: { name: 'Gruftratte', hp: 6, atk: 2, def: 0, xp: 3, ai: 'chase' },
  skelett: { name: 'Skelett', hp: 12, atk: 4, def: 1, xp: 6, ai: 'chase' },
  schuetze: { name: 'Knochenschütze', hp: 8, atk: 3, def: 0, xp: 7, ai: 'chase', range: 5 },
  fledermaus: { name: 'Fledermaus', hp: 5, atk: 3, def: 0, xp: 4, ai: 'erratic' },
  sporling: { name: 'Sporling', hp: 12, atk: 3, def: 1, xp: 7, ai: 'chase', poison: true },
  golem: { name: 'Steingolem', hp: 24, atk: 8, def: 3, xp: 14, ai: 'slow', smash: true },
  glutgeist: { name: 'Glutgeist', hp: 14, atk: 5, def: 0, xp: 10, ai: 'erratic', burn: true },
  koenig: { name: 'Gruftkönig', hp: 60, atk: 7, def: 2, xp: 40, ai: 'boss', boss: true, minion: 'skelett', smash: true },
  mutter: { name: 'Sporenmutter', hp: 110, atk: 9, def: 3, xp: 80, ai: 'boss', boss: true, minion: 'sporling', poison: true, smash: true },
  mimik: { name: 'Mimik', hp: 16, atk: 4, def: 2, xp: 12, ai: 'chase' },
  // Ereignisgegner
  dieb: { name: 'Diebesratte', hp: 7, atk: 1, def: 0, xp: 2, ai: 'flee' },
  goblin: { name: 'Schatzgoblin', hp: 12, atk: 2, def: 1, xp: 8, ai: 'flee' },
  irrlicht: { name: 'Seelenlicht', hp: 1, atk: 0, def: 0, xp: 0, ai: 'wisp' },
  schatten_k: { name: 'Schattenzwilling', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase' },
  schatten_m: { name: 'Schattenzwilling', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase', range: 4 },
  schatten_w: { name: 'Schattenzwilling', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase', range: 5 },
  rivale_k: { name: 'Rivalin Hedda', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase' },
  rivale_m: { name: 'Rivale Orban', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase', range: 4 },
  rivale_w: { name: 'Rivalin Sela', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase', range: 5 },
  ei: { name: 'Sporenei', hp: 6, atk: 0, def: 0, xp: 2, ai: 'idle' },
  riesenpilz: { name: 'Riesenpilz', hp: 30, atk: 0, def: 2, xp: 16, ai: 'idle' },
  // Jäger
  echse: { name: 'Riesenechse', hp: 30, atk: 6, def: 2, xp: 22, ai: 'chase', hunter: true },
  krake: { name: 'Landkrake', hp: 32, atk: 7, def: 1, xp: 24, ai: 'chase', hunter: true },
  drache: { name: 'Drache', hp: 46, atk: 8, def: 3, xp: 36, ai: 'chase', hunter: true, burn: true },
  medusa: { name: 'Medusa', hp: 34, atk: 6, def: 2, xp: 28, ai: 'chase', hunter: true },
  schlange: { name: 'Schlange', hp: 6, atk: 3, def: 0, xp: 2, ai: 'chase', poison: true },
  tod: { name: 'Der Tod', hp: 55, atk: 7, def: 3, xp: 45, ai: 'chase', hunter: true },
  fuerst: { name: 'Schmiedefürst', hp: 180, atk: 13, def: 5, xp: 150, ai: 'boss', boss: true, minion: 'glutgeist', burn: true, smash: true },
};

export const BOSS_BY_BIOME = ['koenig', 'mutter', 'fuerst'];
export const BIOME_NAMES = ['Gruft', 'Pilzhöhle', 'Glutschmiede'];
export const FLOORS_PER_BIOME = 5;
export const LAST_FLOOR = 15;

export const biomeOf = (floor: number) => Math.min(2, Math.floor((floor - 1) / FLOORS_PER_BIOME));

export function spawnTable(floor: number): string[] {
  const b = biomeOf(floor);
  if (b === 0) return floor >= 3 ? ['ratte', 'skelett', 'skelett', 'fledermaus', 'schuetze'] : ['ratte', 'ratte', 'skelett', 'fledermaus'];
  // Golems erst ab der Glutschmiede (Ebene 11), damit der Übergang 9–11 nicht springt
  if (b === 1) return floor >= 9 ? ['sporling', 'sporling', 'schuetze', 'skelett', 'skelett'] : ['sporling', 'sporling', 'fledermaus', 'schuetze', 'skelett'];
  return ['golem', 'glutgeist', 'schuetze', 'sporling', 'skelett'];
}

export interface PerkDef { name: string; desc: string; cls?: ClassId; }

export const PERKS: Record<string, PerkDef> = {
  zaeh: { name: 'Zäh', desc: '+6 max. Leben, heilt 6' },
  scharf: { name: 'Scharfe Klinge', desc: '+1 Angriff' },
  panzer: { name: 'Gepanzert', desc: '+1 Verteidigung' },
  vampir: { name: 'Blutdurst', desc: 'Heilt 2 pro besiegtem Gegner' },
  krit: { name: 'Präzision', desc: '+12 % kritische Treffer' },
  quelle: { name: 'Tiefe Quelle', desc: '+3 max. Klassenressource' },
  meister: { name: 'Meisterschaft', desc: 'Fähigkeiten +25 % Schaden' },
  vorrat: { name: 'Vorrat', desc: '+2 Heiltränke' },
  dornen: { name: 'Dornen', desc: 'Nahkämpfer erleiden 2 Schaden' },
  seelen: { name: 'Seelenfänger', desc: '+50 % Seelensplitter' },
  flink: { name: 'Flinke Füße', desc: '8 % Ausweichen' },
  gier: { name: 'Goldnase', desc: '+40 % Gold' },
  weitblick: { name: 'Weitblick', desc: '+2 Sicht' },
  brandklinge: { name: 'Brandklinge', desc: '25 % Brand bei Treffer' },
  giftklinge: { name: 'Giftklinge', desc: '25 % Gift bei Treffer' },
  frosthauch: { name: 'Frosthauch', desc: '10 % Betäubung bei Treffer' },
  riese: { name: 'Riesenschreck', desc: '+30 % gegen Bosse' },
  sprengsatz: { name: 'Sprengsatz', desc: '+2 Bomben' },
  berserker: { name: 'Berserker', desc: '+2 Angriff, -1 Verteidigung' },
  atem: { name: 'Zweiter Atem', desc: 'Heilt 1 Leben alle 6 Züge' },
  pilz: { name: 'Glückspilz', desc: 'Bessere Funde in Truhen' },
  ausdauer: { name: 'Ausdauer', desc: '+1 Klassenressource pro Sieg' },
  henker: { name: 'Henker', desc: '+25 % Schaden gegen Angeschlagene' },
  spalter: { name: 'Spalter', desc: 'Angriffe treffen Nachbarn mit 40 %', cls: 'krieger' },
  kettenblitz: { name: 'Kettenblitz', desc: 'Geschosse springen mit 50 % weiter', cls: 'magier' },
  durchschuss: { name: 'Durchschuss', desc: 'Pfeile durchstoßen mit 60 %', cls: 'waldlaeufer' },
};

// Ultimative Fähigkeit ab Stufe 5; "cost" ist hier die Abklingzeit in Zügen
export const ULT_LEVEL = 5;
export const ULT: Record<ClassId, SkillDef> = {
  krieger: { name: 'Wirbelsturm', cost: 25, desc: 'Trifft und betäubt alle Gegner im Umkreis von 2' },
  magier: { name: 'Meteor', cost: 25, desc: 'Gewaltige Explosion beim Ziel, Umkreis 2' },
  waldlaeufer: { name: 'Pfeilhagel', cost: 32, desc: 'Trifft jeden sichtbaren Gegner' },
};
// Rang II verstärkt eine Fähigkeit; bei Rang III wählt man eine von zwei Ausprägungen
export interface SkillUp { r2: string; a: [string, string]; b: [string, string]; }
export const SKILL_UP: Record<string, SkillUp> = {
  krieger0: { r2: '+30 % Schaden, betäubt länger', a: ['Wucht', '+60 % Schaden, kostet 1 weniger'], b: ['Rammstoß', 'Schleudert das Ziel 2 Felder weg, Aufprall schadet'] },
  krieger1: { r2: '+30 % Schaden', a: ['Weiter Bogen', '+60 % Schaden, Umkreis 2'], b: ['Blutwirbel', '+60 % Schaden, heilt 2 je Treffer'] },
  krieger2: { r2: 'hält 3 Züge länger', a: ['Donnerruf', 'Hält 6 Züge länger, betäubt Nachbarn'], b: ['Bollwerk', 'Hält 6 Züge länger, dabei +3 Verteidigung'] },
  magier0: { r2: '+30 % Schaden', a: ['Inferno', '+60 % Schaden, Umkreis 2'], b: ['Zwillingsflamme', '+60 % Schaden, zweiter Ball auf ein anderes Ziel'] },
  magier1: { r2: '+30 % Schaden, betäubt länger', a: ['Eissturm', '+60 % Schaden, Umkreis 3'], b: ['Sprödfrost', 'Getroffene erleiden 3 Züge lang +50 % Schaden'] },
  magier2: { r2: 'danach 1 Zug Ausweichen', a: ['Schockwelle', 'Explosion am Startpunkt'], b: ['Phasenschritt', 'Gibt 3 Mana zurück, 2 Züge Ausweichen'] },
  waldlaeufer0: { r2: '+30 % Schaden', a: ['Durchschlag', '+60 % Schaden, durchstößt'], b: ['Eröffnung', 'Sicherer Volltreffer gegen unverletzte Ziele'] },
  waldlaeufer1: { r2: 'Falle: +30 % Schaden', a: ['Bärenfalle', '+60 % Schaden, betäubt länger'], b: ['Fallenreihe', 'Legt drei Fallen in Blickrichtung'] },
  waldlaeufer2: { r2: 'rollt 3 Felder', a: ['Hechtrolle', 'Rollt 4 Felder, 2 Züge Ausweichen'], b: ['Rollschuss', 'Schießt nach der Rolle auf den nächsten Gegner'] },
};
// Fertigkeitsbaum (docs/skill-tree.md): je Fähigkeit ein Zweig. Schritt 2a enthält nur die
// vorhandenen Ränge: T1 = Rang II, T4a/T4b = Rang III mit Ausprägung A oder B.
export interface TreeNode {
  id: string; branch: number; tier: string;
  parent?: string;  // muss gelernt sein
  minPts: number;   // so viele Punkte müssen schon im Zweig stecken
  cost: number;     // Seelensplitter im Lager, 0 = immer offen
  excl?: string;    // schließt diesen Knoten aus
  key?: boolean;    // Schlüsselknoten
  spell?: string;   // schaltet einen neuen Zauber frei (NEW_SKILLS)
  needAny?: string[]; // mindestens einer davon muss gelernt sein
  bundled?: boolean;  // kommt zusammen mit dem Elternknoten (kein eigener Punkt)
}
export const BRANCH_NAMES: Record<ClassId, string[]> = {
  krieger: ['Schild', 'Klinge', 'Schlachtruf'],
  magier: ['Feuer', 'Eis', 'Arkan'],
  waldlaeufer: ['Scharfschütze', 'Fallensteller', 'Pirscher'],
};
// Neue Zauber aus dem Baum; sie belegen die Plätze 4–6 in der Reihenfolge des Lernens
export const NEW_SKILLS: Record<string, SkillDef & { branch: number }> = {
  flammenwand: { name: 'Flammenwand', cost: 5, desc: 'Drei brennende Felder zwischen dir und dem Gegner, 4 Züge', branch: 0 },
  eislanze: { name: 'Eislanze', cost: 4, desc: 'Strahl bis 6 Felder, durchbohrt; Betäubte erleiden doppelten Schaden', branch: 1 },
  arkanschild: { name: 'Arkanschild', cost: 4, desc: 'Schild fängt 8 + Stufe Schaden ab, 5 Züge', branch: 2 },
  schildwurf: { name: 'Schildwurf', cost: 7, desc: 'Wurf auf einen Gegner bis 4 Felder', branch: 0 },
  sturmangriff: { name: 'Sturmangriff', cost: 7, desc: 'Sturm bis 4 Felder zum Gegner, schwerer Schlag', branch: 1 },
  markieren: { name: 'Markieren', cost: 2, desc: 'Markiert einen Gegner 6 Züge: +30 % Schaden gegen ihn, sein Tod gibt 2 Fokus', branch: 0 },
  fangnetz: { name: 'Fangnetz', cost: 3, desc: 'Netz bis 4 Felder: das Ziel kann sich 3 Züge nicht bewegen', branch: 1 },
  rauchbombe: { name: 'Rauchbombe', cost: 3, desc: 'Rauch im Umkreis 2, 4 Züge: Schützen sehen dich nicht, Nahkämpfer verfehlen oft', branch: 2 },
  herausforderung: { name: 'Herausforderung', cost: 6, desc: 'Gegner im Umkreis 4 kommen zu dir, Schützen schießen 1 Zug nicht', branch: 2 },
};
// Stellschrauben des Baums (balance.ts darf sie für Messungen überschreiben):
// treePtsMax – Fertigkeitspunkte je Lauf, danach gibt es Gaben; kryoMana – Mana je Treffer
// gegen Betäubte und Bosse; kryoRegen – Anteil der normalen Mana-Erholung mit Kryomant
// kCost – Aufschlag auf die neuen Fähigkeiten des Kriegers (für Messungen)
export const TUNE = { treePtsMax: 6, kryoMana: 2, kryoRegen: 0.75, kCost: 0 };
// Schalter für neue Systeme (Messungen: tests/balance.ts mit HAZARDS=off, MIMICS=off). Aus heißt:
// keine Zufallszahl und keine Änderung am Lauf – das Ergebnis gleicht dann Bit für Bit dem Stand davor.
export const FEATURES = { hunters: true, hunterForce: '', hazards: true, mimics: true, events: true, eventRate: 1, eventForce: '', eventForceBiome: false, destruction: true, huntPressure: true };
// Destructible world (FEATURES.destruction). Placement uses its own RNG seeded from seed + floor, so the main
// stream (monsters, loot, events) is unchanged; with the switch off nothing is placed and no rule applies.
// Per room: chance of a group and its size; per biome [crypt, cave, forge]. Pots: share of gold / potion / rat.
export const DESTR = {
  pot: [0.45, 0.35, 0.4], potN: [1, 3] as [number, number], potGold: 0.2, potPotion: 0.03, potRat: 0.15,
  oil: [0.12, 0, 0.2], oilBarrel: 0.4, oilN: [3, 6] as [number, number],
  water: [0, 0.3, 0], waterN: [3, 7] as [number, number],
  web: [0.3, 0.25, 0], webN: [1, 3] as [number, number],
  spore: [0, 0.35, 0], sporeN: [1, 2] as [number, number],
  gasTurns: 2, gasPoison: 3, oilBurn: 3,
  secret: [1, 2] as [number, number], secretMinGain: 10, // way around must be at least this much longer
};
// Jäger: erster nach `first` Zügen auf einer Ebene, dann alle `interval` Züge, höchstens `cap` zugleich
// pool: [Art, Gewicht, ab Ebene]; unter Ebene `weakBelow` sind Jäger schwächer (weak)
export const HUNTER = { first: 560, interval: 30, cap: 4, warn: 30, pool: [['echse', 50, 1], ['krake', 20, 1], ['drache', 15, 6], ['medusa', 10, 4], ['tod', 5, 11]] as [string, number, number][], snakes: 4, weakBelow: 6, weak: 0.8, todCd: 6, krakeCd: 2,
  // Spezialangriffe: Abklingzeiten, Versteinerung, Raserei unter rageAt Leben (+rageAtk), Betäubung höchstens stunMax Züge
  leapCd: 4, tailCd: 4, rainCd: 5, gazeCd: 4, blinkCd: 5, stoneTurns: 2, rageAt: 0.4, rageAtk: 2, stunMax: 2,
  // jeder weitere Jäger auf derselben Ebene: +growHp Leben, +growAtk Angriff; Abstand schrumpft um shrink bis minInterval
  growHp: 0.15, growAtk: 1, shrink: 5, minInterval: 15, // Angriff +growAtk nur jede zweite Stufe
  // Anti-farming (FEATURES.huntPressure): the k-th hunter killed on a floor gives reward × rewardDecay[k] (last value
  // for all later ones); from pairFrom spawned hunters on they come in pairs, from deathFrom on Death comes, reward-free;
  // stronger growth per stage; stun at most 1 turn from stage stun1From; no passive regen while one is alive
  rewardDecay: [1, 0.4, 0.15, 0], pairFrom: 2, deathFrom: 4, growHp2: 0.3, growAtk2: 1, stun1From: 2 };
// Ereignisse: Ruhe-Auslöser, Zweitereignis bei Rate 1, Obergrenze zusätzlicher Reliquienwahlen je Lauf,
// Schattenzwilling als Anteil der Heldenwerte (nur Grundangriff)
export const EVENT = { biomeShare: 0.6, calmMin: 25, calmMax: 40, calmChance: 0.15, second: 0.45, relicCap: 2, relicChance: 0.2,
  // Lohnstufen (nach dem ersten Messlauf deutlich gesenkt: mit Ereignissen stiegen Siege und Gold zu stark)
  mobXp: 0.35, gold1: 3, potion1: 0.3, souls2: 5, item2: 0.25, cons2: 1, item3: 0.5, gold3: 4, souls3: 8, twinHp: 0.55, twinAtk: 0.65, noteChance: 0.3 };
// Versteckte Bodenfallen und Mimiks
// Schwierigkeit (Tester: das Spiel war zu leicht). Gegner, Heilung, Fallen und Ereignisse an einer Stelle.
export const DIFF = {
  mobHp: 1.02, mobAtk: 1.01, bossHp: 1,        // Gegnerwerte (Multiplikatoren wirken über 15 Ebenen stark)
  roomDiv: 5,                                  // je roomDiv Ebenen ein Gegner mehr je Raum
  potionHeal: 0.45, chestPotion: 0.21, dropPotion: 0.025, // Heiltrank heilt 45 %
  fountain: 0.45, fountainHeal: 0.34,          // Brunnen heilt 34 % (vorher 35 %)
  potionPrice: 1,                              // Heiltrankpreis beim Händler
  trapDmg: 1.05, trapExtra: 0,                 // Fallen 5 % härter
  dangerWeight: 1.15,                          // gefährliche Ereignisse 15 % öfter gezogen
};
export const HAZARD = { minFloor: 2, spot: 0.35, spotSicht: 0.1, mimic: 0.15, mimicRarUp: 0.25 };
// Texte der Knoten T2a, T2b, T3, T5
export const NODE_TEXT: Partial<Record<ClassId, Record<string, [string, string]>>> = {
  magier: {
    n0_2a: ['Zunder', 'Funke entzündet mit 30 %'],
    n0_2b: ['Schwelbrand', 'Brand hält 1 Zug länger und brennt 1 stärker'],
    n0_3: ['Flammenwand', 'Neuer Zauber, 5 Mana: drei brennende Felder zwischen dir und dem Gegner, 4 Züge'],
    n0_5: ['Flächenbrand', 'Brennende Gegner explodieren beim Tod und entzünden ihre Nachbarn'],
    n1_2a: ['Raureif', 'Betäubte Gegner erleiden +25 % Schaden'],
    n1_2b: ['Eisrüstung', 'Nach der Frostnova 2 Züge +2 Verteidigung'],
    n1_3: ['Eislanze', 'Neuer Zauber, 4 Mana: Strahl bis 6 Felder, durchbohrt; Betäubte erleiden doppelten Schaden'],
    n1_5: ['Kryomant', 'Mana kehrt langsamer zurück (drei Viertel); +2 Mana je Treffer gegen Betäubte und Bosse'],
    n2_2a: ['Nachhall', 'Nach dem Blinzeln kostet der nächste Zauber 2 Mana weniger'],
    n2_2b: ['Schutzrune', 'Einmal je Ebene: unter 30 % Leben blinzelst du von selbst'],
    n2_3: ['Arkanschild', 'Neuer Zauber, 4 Mana: Schild fängt 8 + Stufe Schaden ab, 5 Züge'],
    n2_5: ['Zeitriss', 'Blinzeln kostet keinen Zug, danach 3 Züge Abklingzeit'],
  },
  krieger: {
    n0_2a: ['Schildwall', 'Warten im Kampf: +2 Verteidigung bis zum nächsten Zug und +1 Wut'],
    n0_2b: ['Gegenschlag', '25 %: auf einen Nahkampftreffer schlägst du sofort zurück'],
    n0_3: ['Schildwurf', 'Neue Fähigkeit, 7 Wut: Wurf auf einen Gegner bis 4 Felder'],
    n0_5: ['Vergelter', 'Wut nicht mehr aus eigenen Schlägen, doppelt aus erlittenen; Schildstoß betäubt alle Nachbarn'],
    n1_2a: ['Schwungkraft', '+1 Wut je Gegner, den der Wirbelschlag trifft'],
    n1_2b: ['Gezackte Klinge', 'Wirbelschlag vergiftet'],
    n1_3: ['Sturmangriff', 'Neue Fähigkeit, 7 Wut: Sturm bis 4 Felder zum Gegner, schwerer Schlag'],
    n1_5: ['Klingenrausch', 'Ein Sieg gibt einen freien Zug, höchstens alle 3 Züge'],
    n2_2a: ['Schmerzensgeld', 'Erlittene Nahkampftreffer geben +1 Wut zusätzlich'],
    n2_2b: ['Einschüchterung', 'Kriegsschrei: Gegner im Umkreis 2 haben –1 Angriff, solange er wirkt'],
    n2_3: ['Herausforderung', 'Neue Fähigkeit, 6 Wut: Gegner im Umkreis 4 kommen zu dir, Schützen schießen 1 Zug nicht'],
    n2_5: ['Blutzorn', 'Fehlende Wut zahlst du mit Leben (2 je Wut); unter 50 % Leben +30 % Schaden'],
  },
  waldlaeufer: {
    n0_2a: ['Ruhige Hand', 'Warten ohne Gegner daneben gibt doppelten Fokus'],
    n0_2b: ['Schwachstelle', '15 %: Zielschuss trifft kritisch und betäubt 1 Zug'],
    n0_3: ['Markieren', 'Neue Fähigkeit, 2 Fokus: Markierung 6 Züge, +30 % Schaden gegen das Ziel, sein Tod gibt 2 Fokus'],
    n0_5: ['Anlegen', 'Jeder Zug ohne Schritt: nächster Schuss +25 % (bis +100 %); Reichweite +2'],
    n1_2a: ['Stacheldraht', 'Fallen vergiften'],
    n1_2b: ['Werkzeuggürtel', 'Bis zu 5 Fallen statt 3'],
    n1_3: ['Fangnetz', 'Neue Fähigkeit, 3 Fokus: Netz bis 4 Felder, das Ziel kann sich 3 Züge nicht bewegen'],
    n1_5: ['Minenfeld', 'Fallen kosten nichts, die Ausweichrolle hinterlässt eine Falle; Grundschuss –30 %'],
    n2_2a: ['Schattenschritt', 'Nach der Ausweichrolle trifft der nächste Schuss mit +50 %'],
    n2_2b: ['Leichtfuß', 'Rolle weg von einem Gegner daneben gibt 1 Fokus zurück'],
    n2_3: ['Rauchbombe', 'Neue Fähigkeit, 3 Fokus: Rauch im Umkreis 2, 4 Züge – Schützen sehen dich nicht, Nahkämpfer verfehlen oft'],
    n2_5: ['Rückzugsgefecht', 'Schritt weg von einem Gegner daneben: freier Schuss; Warten gibt keinen Fokus mehr'],
  },
};
const baseNodes = (b: number, minPts4: number): TreeNode[] => [
  { id: `n${b}_1`, branch: b, tier: '1', minPts: 0, cost: 0 },
  { id: `n${b}_4a`, branch: b, tier: '4a', parent: `n${b}_1`, minPts: minPts4, cost: 0, excl: `n${b}_4b` },
  { id: `n${b}_4b`, branch: b, tier: '4b', parent: `n${b}_1`, minPts: minPts4, cost: 0, excl: `n${b}_4a` },
];
// Voller Zweig: T1, T2a (kommt mit T1), T2b, T3 (neue Fähigkeit), T4a/T4b, T5
const fullTree = (spells: string[]) => [0, 1, 2].flatMap(b => {
  const [t1, t4a, t4b] = baseNodes(b, 2);
  return [
    t1,
    // T2a gehört zu T1: ein Punkt gibt beide
    { id: `n${b}_2a`, branch: b, tier: '2a', parent: t1.id, minPts: 0, cost: 0, bundled: true },
    { id: `n${b}_2b`, branch: b, tier: '2b', parent: t1.id, minPts: 0, cost: 80 },
    { id: `n${b}_3`, branch: b, tier: '3', parent: t1.id, minPts: 0, cost: 160, spell: spells[b] },
    t4a, t4b,
    // Schlüsselknoten: braucht Rang III (A oder B) und 4 Punkte im Zweig; im Lager hängt er an T1
    { id: `n${b}_5`, branch: b, tier: '5', parent: t1.id, minPts: 4, cost: 240, key: true, needAny: [t4a.id, t4b.id] },
  ] as TreeNode[];
});
const TREES: Record<ClassId, TreeNode[]> = {
  krieger: fullTree(['schildwurf', 'sturmangriff', 'herausforderung']),
  waldlaeufer: fullTree(['markieren', 'fangnetz', 'rauchbombe']),
  magier: fullTree(['flammenwand', 'eislanze', 'arkanschild']),
};
export const treeNodes = (cls: ClassId) => TREES[cls];
export const treeNode = (cls: ClassId, id: string) => TREES[cls].find(n => n.id === id);
// Name und Wirkung eines Knotens
export function nodeText(cls: ClassId, id: string): { name: string; desc: string } {
  const n = treeNode(cls, id)!, sk = CLASSES[cls].skills[n.branch], up = SKILL_UP[`${cls}${n.branch}`];
  if (n.tier === '1') return { name: `${sk.name} II`, desc: up.r2 };
  if (n.tier === '4a' || n.tier === '4b') { const [name, desc] = n.tier === '4a' ? up.a : up.b; return { name: `${sk.name} III: ${name}`, desc }; }
  const [name, desc] = NODE_TEXT[cls]![id];
  return { name, desc };
}
// Knoten, die in einem Lauf dieser Klasse zur Wahl stehen können
export const treePool = (cls: ClassId, meta: { tree?: Partial<Record<ClassId, string[]>> }) =>
  TREES[cls].filter(n => n.cost === 0 || (meta.tree?.[cls] ?? []).includes(n.id)).map(n => n.id);

// Zwei bestimmte Gaben zusammen ergeben eine zusätzliche Wirkung
export interface Synergy { id: string; need: [string, string]; name: string; desc: string; }
export const SYNERGIES: Synergy[] = [
  { id: 'hexen', need: ['brandklinge', 'giftklinge'], name: 'Hexenkessel', desc: '+30 % Schaden gegen Brennende und Vergiftete' },
  { id: 'stachel', need: ['dornen', 'panzer'], name: 'Stachelpanzer', desc: 'Dornen wirken doppelt' },
  { id: 'rausch', need: ['vampir', 'henker'], name: 'Blutrausch', desc: 'Jeder Sieg heilt 3 mehr' },
  { id: 'konter', need: ['flink', 'krit'], name: 'Konter', desc: 'Nach dem Ausweichen trifft der nächste Schlag kritisch' },
  { id: 'midas', need: ['gier', 'pilz'], name: 'Midas', desc: 'Jede Truhe enthält zusätzlich Gold' },
  { id: 'erz', need: ['meister', 'quelle'], name: 'Erzmagie', desc: 'Fähigkeiten kosten 1 weniger' },
];
export interface UpgDef { id: string; name: string; desc: string; max: number; cost: number; }

export const UPGRADES: UpgDef[] = [
  { id: 'vit', name: 'Vitalität', desc: '+2 Leben pro Stufe', max: 5, cost: 40 },
  { id: 'atk', name: 'Schleifstein', desc: '+1 Angriff pro Stufe (Magier: +15 % Fähigkeiten)', max: 2, cost: 120 },
  { id: 'trank', name: 'Proviant', desc: '+1 Heiltrank zum Start', max: 3, cost: 50 },
  { id: 'fokus', name: 'Fokus', desc: '+1 max. Klassenressource', max: 3, cost: 40 },
  { id: 'gold', name: 'Startkapital', desc: '+15 Gold zum Start', max: 3, cost: 30 },
  { id: 'bombe', name: 'Pulvervorrat', desc: '+1 Bombe zum Start', max: 2, cost: 40 },
  { id: 'fund', name: 'Schatzsucher', desc: 'Bessere Funde in Truhen', max: 3, cost: 60 },
  { id: 'wahl', name: 'Weisheit', desc: '+1 Auswahl beim Stufenaufstieg', max: 1, cost: 160 },
  { id: 'erbe', name: 'Erbstück', desc: 'Start mit einer zufälligen Reliquie', max: 1, cost: 240 },
];
export const RANGER_COST = 120;
// Schleifstein beim Magier: Anteil mehr Fähigkeitsschaden je Stufe
export const MAGE_WHET = 0.15;
export const upgCost = (u: UpgDef, lvl: number) => u.cost * (lvl + 1);

export const RELICS: Record<string, PerkDef> = {
  glutherz: { name: 'Glutherz', desc: 'Brand heilt dich, statt zu schaden' },
  donnerfaust: { name: 'Donnerfaust', desc: 'Jeder 5. Treffer trifft auch alle Gegner daneben' },
  pulverfass: { name: 'Pulverhaut', desc: 'Explosionen verletzen dich nicht' },
  sprengmeister: { name: 'Sprengmeister', desc: '+1 Bombe auf jeder neuen Ebene' },
  geisterlicht: { name: 'Geisterlicht', desc: 'Du siehst 3 Felder weiter' },
  steinhaut: { name: 'Steinhaut', desc: 'Jeder Treffer gegen dich: 1 Schaden weniger' },
  blutpakt: { name: 'Blutpakt', desc: '+3 Angriff, aber -20 % max. Leben' },
  seelenkelch: { name: 'Seelenkelch', desc: 'Heiltränke heilen vollständig' },
  zeitsand: { name: 'Zeitsand', desc: 'Gegner verlieren manchmal ihren Zug' },
  giftzahn: { name: 'Giftzahn', desc: 'Deine Treffer vergiften' },
  frostkern: { name: 'Frostkern', desc: 'Betäubungen halten 1 Zug länger' },
  muenze: { name: 'Glücksmünze', desc: 'Truhen geben doppelte Beute' },
  eisenwille: { name: 'Eisenwille', desc: 'Überlebe einmal pro Ebene einen tödlichen Treffer' },
  jaeger: { name: 'Riesentöter', desc: '+50 % Schaden gegen Bosse' },
  echo: { name: 'Echo', desc: 'Fähigkeiten kosten 1 weniger' },
};

export const RARITY = ['Gewöhnlich', 'Selten', 'Episch', 'Legendär'];
export const RARITY_COL = ['#94b0c2', '#41a6f6', '#9a4fc0', '#ffcd75'];
export const SLOT_NAMES = ['Waffe', 'Rüstung', 'Amulett', 'Ring', 'Verbrauch'];
export interface Item {
  slot: number; name: string; rar: number; atk: number; def: number; hp: number; crit: number; cursed?: boolean; lock?: number; // lock: Ebene, auf der ein verfluchtes Stück angelegt wurde
  aff?: [string, number][]; // besondere Eigenschaften
  wk?: number;              // Waffenart 0..2, bestimmt das Aussehen
  use?: string;             // Verbrauchsgegenstand
  uniq?: boolean; neu?: boolean;
  plus?: number;            // beim Schmied verbessert
}
// Eigenschaften von Ausrüstung und Gaben
export const AFFIX: Record<string, (v: number) => string> = {
  vamp: v => `+${v} Leben pro Sieg`, dorn: v => `${v} Dornenschaden`, quell: v => `+${v} max. Klassenressource`, macht: v => `+${v} % Fähigkeiten`,
  gold: v => `+${v} % Gold`, sicht: v => `+${v} Sicht`, brand: v => `${v} % Brand bei Treffer`, gift: v => `${v} % Gift bei Treffer`,
  frost: v => `${v} % Betäubung bei Treffer`, boss: v => `+${v} % gegen Bosse`, flink: v => `${v} % Ausweichen`,
  spalt: v => `Trifft Nachbarn mit ${v} %`, stoss: v => `Durchstößt mit ${v} %`, kette: v => `Springt weiter mit ${v} %`, weite: v => `+${v} Reichweite`,
  asche: () => 'Besiegte explodieren',
};
export const USE_ORDER = ['karte', 'sprung', 'kraft', 'quell'];
export const CONSUMABLES: Record<string, PerkDef> = {
  karte: { name: 'Kartenrolle', desc: 'Deckt die ganze Ebene auf' },
  sprung: { name: 'Sprungrolle', desc: 'Versetzt dich weit weg von Gegnern' },
  kraft: { name: 'Krafttrank', desc: '+3 Angriff für 10 Züge' },
  quell: { name: 'Quelltrank', desc: 'Gibt 6 Klassenressource zurück' },
};
type U = { slot: number; name: string; wk?: number; atk?: number; def?: number; hp?: number; crit?: number; aff: [string, number][]; cls?: ClassId };
export const UNIQUES: U[] = [
  { slot: 0, cls: 'krieger', name: 'Aschenspalter', wk: 1, atk: 5, aff: [['spalt', 70], ['asche', 1]] },
  { slot: 0, cls: 'magier', name: 'Weltenbrand', wk: 0, atk: 4, aff: [['brand', 60], ['kette', 60]] },
  { slot: 0, cls: 'waldlaeufer', name: 'Sternenfall', wk: 0, atk: 4, aff: [['weite', 2], ['stoss', 80]] },
  { slot: 1, name: 'Drachenhaut', def: 2, hp: 10, aff: [['dorn', 4], ['flink', 6]] },
  { slot: 1, name: 'Schattenmantel', def: 1, hp: 4, aff: [['flink', 15], ['sicht', 2]] },
  { slot: 2, name: 'Herz des Vulkans', hp: 6, crit: 0.08, aff: [['brand', 40], ['asche', 1]] },
  { slot: 2, name: 'Auge des Sehers', crit: 0.16, aff: [['sicht', 3], ['macht', 15]] },
  { slot: 3, name: 'Blutring', aff: [['vamp', 3], ['boss', 30]] },
  { slot: 3, name: 'Ring der Gier', aff: [['gold', 40], ['quell', 4]] },
  { slot: 3, name: 'Sturmring', aff: [['kette', 60], ['macht', 20]] },
];
export interface Offer { kind: 'potion' | 'bomb' | 'item' | 'forge' | 'reroll'; name: string; desc: string; price: number; sold: boolean; item?: Item; left?: number; }
