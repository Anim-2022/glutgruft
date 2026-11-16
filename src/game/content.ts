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
    hp: 32, atk: 5, def: 2, resName: 'Wut', resMax: 10, resStart: 0, resCol: '#ef7d57', range: 0, shot: '',
    skills: [
      { name: 'Schildstoß', cost: 3, desc: 'Schaden + betäubt 2 Züge' },
      { name: 'Wirbelschlag', cost: 5, desc: 'Trifft alle Gegner ringsum' },
      { name: 'Kriegsschrei', cost: 4, desc: '+3 Angriff für 6 Züge' },
    ],
  },
  magier: {
    id: 'magier', name: 'Magier', desc: 'Zerbrechlich, aber verheerend. Mana kehrt langsam von selbst zurück.',
    hp: 18, atk: 3, def: 0, resName: 'Mana', resMax: 12, resStart: 12, resCol: '#41a6f6', range: 3, shot: 'Funke',
    skills: [
      { name: 'Feuerball', cost: 5, desc: 'Explosion + Brand' },
      { name: 'Frostnova', cost: 6, desc: 'Friert Gegner in der Nähe ein' },
      { name: 'Blinzeln', cost: 3, desc: 'Teleport weg von Gefahr' },
    ],
  },
  waldlaeufer: {
    id: 'waldlaeufer', name: 'Waldläufer', desc: 'Schütze mit Fallen. Fokus wächst beim Warten und mit jedem besiegten Gegner.',
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
  golem: { name: 'Steingolem', hp: 30, atk: 8, def: 3, xp: 14, ai: 'slow', smash: true },
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
  if (b === 1) return floor >= 9 ? ['sporling', 'sporling', 'schuetze', 'skelett', 'golem'] : ['sporling', 'sporling', 'fledermaus', 'schuetze', 'skelett'];
  return ['golem', 'glutgeist', 'glutgeist', 'schuetze', 'sporling'];
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
  henker: { name: 'Henker', desc: '+50 % Schaden gegen Angeschlagene' },
  spalter: { name: 'Spalter', desc: 'Angriffe treffen Nachbarn mit 40 %', cls: 'krieger' },
  kettenblitz: { name: 'Kettenblitz', desc: 'Geschosse springen mit 50 % weiter', cls: 'magier' },
  durchschuss: { name: 'Durchschuss', desc: 'Pfeile durchstoßen mit 60 %', cls: 'waldlaeufer' },
};

// Ultimative Fähigkeit ab Stufe 5; "cost" ist hier die Abklingzeit in Zügen
export const ULT_LEVEL = 5;
export const ULT: Record<ClassId, SkillDef> = {
  krieger: { name: 'Wirbelsturm', cost: 25, desc: 'Trifft und betäubt alle Gegner im Umkreis von 2' },
  magier: { name: 'Meteor', cost: 25, desc: 'Gewaltige Explosion beim Ziel, Umkreis 2' },
  waldlaeufer: { name: 'Pfeilhagel', cost: 25, desc: 'Trifft jeden sichtbaren Gegner' },
};
// Was Rang II und Rang III einer Fähigkeit zusätzlich bringen
export const SKILL_UP: Record<string, [string, string]> = {
  krieger0: ['+30 % Schaden, betäubt länger', '+60 % Schaden, kostet 1 weniger'],
  krieger1: ['+30 % Schaden', '+60 % Schaden, Umkreis 2'],
  krieger2: ['hält 3 Züge länger', 'hält 6 Züge länger, betäubt Nachbarn'],
  magier0: ['+30 % Schaden', '+60 % Schaden, Umkreis 2'],
  magier1: ['+30 % Schaden, betäubt länger', '+60 % Schaden, Umkreis 3'],
  magier2: ['danach 1 Zug Ausweichen', 'Schockwelle am Startpunkt'],
  waldlaeufer0: ['+30 % Schaden', '+60 % Schaden, durchstößt'],
  waldlaeufer1: ['Falle: +30 % Schaden', 'Falle: +60 % Schaden, betäubt länger'],
  waldlaeufer2: ['rollt 3 Felder', 'rollt 4 Felder, 2 Züge Ausweichen'],
};

export interface UpgDef { id: string; name: string; desc: string; max: number; cost: number; }

export const UPGRADES: UpgDef[] = [
  { id: 'vit', name: 'Vitalität', desc: '+2 Leben pro Stufe', max: 5, cost: 20 },
  { id: 'atk', name: 'Schleifstein', desc: '+1 Angriff pro Stufe', max: 2, cost: 60 },
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
  blutpakt: { name: 'Blutpakt', desc: '+4 Angriff, aber -8 max. Leben' },
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
  slot: number; name: string; rar: number; atk: number; def: number; hp: number; crit: number; cursed?: boolean;
  aff?: [string, number][]; // besondere Eigenschaften
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
export const CONSUMABLES: Record<string, PerkDef> = {
  karte: { name: 'Kartenrolle', desc: 'Deckt die ganze Ebene auf' },
  sprung: { name: 'Sprungrolle', desc: 'Versetzt dich weit weg von Gegnern' },
  kraft: { name: 'Krafttrank', desc: '+3 Angriff für 12 Züge' },
  quell: { name: 'Quelltrank', desc: 'Füllt die Klassenressource' },
};
type U = { slot: number; name: string; atk?: number; def?: number; hp?: number; crit?: number; aff: [string, number][]; cls?: ClassId };
export const UNIQUES: U[] = [
  { slot: 0, cls: 'krieger', name: 'Aschenspalter', atk: 5, aff: [['spalt', 70], ['asche', 1]] },
  { slot: 0, cls: 'magier', name: 'Weltenbrand', atk: 4, aff: [['brand', 60], ['kette', 60]] },
  { slot: 0, cls: 'waldlaeufer', name: 'Sternenfall', atk: 4, aff: [['weite', 2], ['stoss', 80]] },
  { slot: 1, name: 'Drachenhaut', def: 2, hp: 10, aff: [['dorn', 4], ['flink', 6]] },
  { slot: 1, name: 'Schattenmantel', def: 1, hp: 4, aff: [['flink', 15], ['sicht', 2]] },
  { slot: 2, name: 'Herz des Vulkans', hp: 6, crit: 0.08, aff: [['brand', 40], ['asche', 1]] },
  { slot: 2, name: 'Auge des Sehers', crit: 0.16, aff: [['sicht', 3], ['macht', 15]] },
  { slot: 3, name: 'Blutring', aff: [['vamp', 3], ['boss', 30]] },
  { slot: 3, name: 'Ring der Gier', aff: [['gold', 80], ['quell', 4]] },
  { slot: 3, name: 'Sturmring', aff: [['kette', 60], ['macht', 20]] },
];
export interface Offer { kind: 'potion' | 'bomb' | 'item'; name: string; desc: string; price: number; sold: boolean; item?: Item; }
