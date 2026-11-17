export type ClassId = 'krieger' | 'magier' | 'waldlaeufer';

export interface SkillDef { name: string; cost: number; desc: string; }
export interface ClassDef {
  id: ClassId; name: string; desc: string;
  hp: number; atk: number; def: number;
  resName: string; resMax: number; resStart: number; resCol: string;
  range: number; // Reichweite des Grundangriffs (0 = nur Nahkampf)
  shot: string;
  skills: SkillDef[];
}

export const CLASS_ORDER: ClassId[] = ['krieger', 'magier', 'waldlaeufer'];

export const CLASSES: Record<ClassId, ClassDef> = {
  krieger: {
    id: 'krieger', name: 'Krieger', desc: 'Zäher Nahkämpfer. Wut entsteht durch Treffer und Schmerz.',
    hp: 40, atk: 5, def: 2, resName: 'Wut', resMax: 10, resStart: 0, resCol: '#ef7d57', range: 0, shot: '',
    skills: [
      { name: 'Schildstoß', cost: 2, desc: 'Schaden + betäubt 2 Züge' },
      { name: 'Wirbelschlag', cost: 5, desc: 'Trifft alle Gegner ringsum' },
      { name: 'Kriegsschrei', cost: 4, desc: '+3 Angriff für 6 Züge' },
    ],
  },
  magier: {
    id: 'magier', name: 'Magier', desc: 'Zerbrechlich, aber verheerend. Mana kehrt langsam von selbst zurück.',
    hp: 18, atk: 3, def: 0, resName: 'Mana', resMax: 12, resStart: 12, resCol: '#41a6f6', range: 3, shot: 'Funke',
    skills: [
      { name: 'Feuerball', cost: 6, desc: 'Explosion + Brand' },
      { name: 'Frostnova', cost: 6, desc: 'Friert Gegner in der Nähe ein' },
      { name: 'Blinzeln', cost: 3, desc: 'Teleport weg von Gefahr' },
    ],
  },
  waldlaeufer: {
    id: 'waldlaeufer', name: 'Waldläufer', desc: 'Schütze mit Fallen. Fokus wächst beim Warten im Kampf und mit jedem besiegten Gegner.',
    hp: 22, atk: 4, def: 1, resName: 'Fokus', resMax: 8, resStart: 2, resCol: '#a7f070', range: 5, shot: 'Schuss',
    skills: [
      { name: 'Zielschuss', cost: 4, desc: 'Schwerer Schuss auf große Distanz' },
      { name: 'Falle', cost: 2, desc: 'Legt eine Falle: Schaden + Betäubung' },
      { name: 'Ausweichrolle', cost: 2, desc: '2 Felder rollen, weicht Angriffen aus' },
    ],
  },
};

export interface MobDef {
  name: string; hp: number; atk: number; def: number; xp: number;
  ai: 'chase' | 'erratic' | 'slow' | 'boss';
  range?: number; poison?: boolean; burn?: boolean; boss?: boolean; minion?: string; smash?: boolean;
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
  { id: 'vit', name: 'Vitalität', desc: '+2 Leben pro Stufe', max: 5, cost: 20 },
  { id: 'atk', name: 'Schleifstein', desc: '+1 Angriff pro Stufe (nicht für den Magier)', max: 2, cost: 60 },
  { id: 'trank', name: 'Proviant', desc: '+1 Heiltrank zum Start', max: 3, cost: 25 },
  { id: 'fokus', name: 'Fokus', desc: '+1 max. Klassenressource', max: 3, cost: 20 },
  { id: 'gold', name: 'Startkapital', desc: '+15 Gold zum Start', max: 3, cost: 15 },
  { id: 'bombe', name: 'Pulvervorrat', desc: '+1 Bombe zum Start', max: 2, cost: 20 },
  { id: 'fund', name: 'Schatzsucher', desc: 'Bessere Funde in Truhen', max: 3, cost: 30 },
  { id: 'wahl', name: 'Weisheit', desc: '+1 Auswahl beim Stufenaufstieg', max: 1, cost: 80 },
  { id: 'erbe', name: 'Erbstück', desc: 'Start mit einer zufälligen Reliquie', max: 1, cost: 120 },
];
export const RANGER_COST = 60;
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
export interface Offer { kind: 'potion' | 'bomb' | 'item'; name: string; desc: string; price: number; sold: boolean; item?: Item; left?: number; }
