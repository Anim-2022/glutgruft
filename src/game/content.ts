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

export interface PerkDef { name: string; desc: string; }

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
};

export interface UpgDef { id: 'vit' | 'atk' | 'trank'; name: string; desc: string; max: number; cost: number; }

export const UPGRADES: UpgDef[] = [
  { id: 'vit', name: 'Vitalität', desc: '+3 Leben pro Stufe', max: 5, cost: 20 },
  { id: 'atk', name: 'Schleifstein', desc: '+1 Angriff pro Stufe', max: 3, cost: 40 },
  { id: 'trank', name: 'Proviant', desc: '+1 Heiltrank zum Start', max: 3, cost: 25 },
];
export const RANGER_COST = 60;
export const upgCost = (u: UpgDef, lvl: number) => u.cost * (lvl + 1);
