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
    id: 'krieger', name: 'Warrior', desc: 'Tough melee fighter. Rage builds from hits dealt and taken.',
    hp: 30, atk: 5, def: 2, resName: 'Rage', resMax: 10, resStart: 0, resCol: '#ef7d57', range: 0, shot: '',
    skills: [
      { name: 'Shield Bash', cost: 2, desc: 'Damage + stuns for 2 turns' },
      { name: 'Whirlwind', cost: 5, desc: 'Hits every enemy around you' },
      { name: 'War Cry', cost: 4, desc: '+3 attack for 6 turns' },
    ],
  },
  magier: {
    id: 'magier', name: 'Mage', desc: 'Fragile but devastating. Mana slowly returns on its own.',
    hp: 22, atk: 3, def: 1, resName: 'Mana', resMax: 12, resStart: 12, resCol: '#41a6f6', range: 3, shot: 'Spark',
    skills: [
      { name: 'Fireball', cost: 6, desc: 'Explosion + burning' },
      { name: 'Frost Nova', cost: 6, desc: 'Freezes nearby enemies' },
      { name: 'Blink', cost: 3, desc: 'Teleport away from danger' },
    ],
  },
  waldlaeufer: {
    id: 'waldlaeufer', name: 'Ranger', desc: 'Archer with traps. Focus grows while waiting in combat and with every kill.',
    hp: 26, atk: 4, def: 1, resName: 'Focus', resMax: 8, resStart: 2, resCol: '#a7f070', range: 5, fokusOnHit: 1, shot: 'Shot',
    skills: [
      { name: 'Aimed Shot', cost: 4, desc: 'Heavy shot at long range' },
      { name: 'Trap', cost: 2, desc: 'Places a trap: damage + stun' },
      { name: 'Dodge Roll', cost: 2, desc: 'Roll 2 tiles and evade attacks' },
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
  ratte: { name: 'Crypt Rat', hp: 6, atk: 2, def: 0, xp: 3, ai: 'chase' },
  skelett: { name: 'Skeleton', hp: 12, atk: 4, def: 1, xp: 6, ai: 'chase' },
  schuetze: { name: 'Bone Archer', hp: 8, atk: 3, def: 0, xp: 7, ai: 'chase', range: 5 },
  fledermaus: { name: 'Bat', hp: 5, atk: 3, def: 0, xp: 4, ai: 'erratic' },
  sporling: { name: 'Sporeling', hp: 12, atk: 3, def: 1, xp: 7, ai: 'chase', poison: true },
  golem: { name: 'Stone Golem', hp: 24, atk: 8, def: 3, xp: 14, ai: 'slow', smash: true },
  glutgeist: { name: 'Ember Wisp', hp: 14, atk: 5, def: 0, xp: 10, ai: 'erratic', burn: true },
  koenig: { name: 'Crypt King', hp: 60, atk: 7, def: 2, xp: 40, ai: 'boss', boss: true, minion: 'skelett', smash: true },
  mutter: { name: 'Spore Mother', hp: 110, atk: 9, def: 3, xp: 80, ai: 'boss', boss: true, minion: 'sporling', poison: true, smash: true },
  mimik: { name: 'Mimic', hp: 16, atk: 4, def: 2, xp: 12, ai: 'chase' },
  // Ereignisgegner
  dieb: { name: 'Thief rat', hp: 7, atk: 1, def: 0, xp: 2, ai: 'flee' },
  goblin: { name: 'Treasure goblin', hp: 12, atk: 2, def: 1, xp: 8, ai: 'flee' },
  irrlicht: { name: 'Soul light', hp: 1, atk: 0, def: 0, xp: 0, ai: 'wisp' },
  schatten_k: { name: 'Shadow twin', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase' },
  schatten_m: { name: 'Shadow twin', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase', range: 4 },
  schatten_w: { name: 'Shadow twin', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase', range: 5 },
  rivale_k: { name: 'Rival Hedda', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase' },
  rivale_m: { name: 'Rival Orban', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase', range: 4 },
  rivale_w: { name: 'Rival Sela', hp: 1, atk: 1, def: 0, xp: 20, ai: 'chase', range: 5 },
  ei: { name: 'Spore egg', hp: 6, atk: 0, def: 0, xp: 2, ai: 'idle' },
  riesenpilz: { name: 'Giant mushroom', hp: 30, atk: 0, def: 2, xp: 16, ai: 'idle' },
  // Jäger
  echse: { name: 'Giant lizard', hp: 30, atk: 6, def: 2, xp: 22, ai: 'chase', hunter: true },
  krake: { name: 'Land kraken', hp: 32, atk: 7, def: 1, xp: 24, ai: 'chase', hunter: true },
  drache: { name: 'Dragon', hp: 46, atk: 8, def: 3, xp: 36, ai: 'chase', hunter: true, burn: true },
  medusa: { name: 'Medusa', hp: 34, atk: 6, def: 2, xp: 28, ai: 'chase', hunter: true },
  schlange: { name: 'Snake', hp: 6, atk: 3, def: 0, xp: 2, ai: 'chase', poison: true },
  tod: { name: 'Death', hp: 55, atk: 7, def: 3, xp: 45, ai: 'chase', hunter: true },
  fuerst: { name: 'Forge Lord', hp: 180, atk: 13, def: 5, xp: 150, ai: 'boss', boss: true, minion: 'glutgeist', burn: true, smash: true },
};

export const BOSS_BY_BIOME = ['koenig', 'mutter', 'fuerst'];
export const BIOME_NAMES = ['Crypt', 'Fungal Cave', 'Ember Forge'];
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
  zaeh: { name: 'Tough', desc: '+6 max health, heals 6' },
  scharf: { name: 'Sharp Blade', desc: '+1 attack' },
  panzer: { name: 'Armored', desc: '+1 Defense' },
  vampir: { name: 'Bloodthirst', desc: 'Heals 2 per kill' },
  krit: { name: 'Precision', desc: '+12 % critical hits' },
  quelle: { name: 'Deep Well', desc: '+3 max class resource' },
  meister: { name: 'Mastery', desc: 'Skills deal +25 % damage' },
  vorrat: { name: 'Supplies', desc: '+2 healing potions' },
  dornen: { name: 'Thorns', desc: 'Melee attackers take 2 damage' },
  seelen: { name: 'Soul Catcher', desc: '+50 % soul shards' },
  flink: { name: 'Quick Feet', desc: '8 % dodge' },
  gier: { name: 'Gold Nose', desc: '+40 % gold' },
  weitblick: { name: 'Far Sight', desc: '+2 sight' },
  brandklinge: { name: 'Burning Edge', desc: '25 % burn on hit' },
  giftklinge: { name: 'Venom Edge', desc: '25 % poison on hit' },
  frosthauch: { name: 'Frost Breath', desc: '10 % stun on hit' },
  riese: { name: 'Giant Bane', desc: '+30 % vs. bosses' },
  sprengsatz: { name: 'Explosives', desc: '+2 bombs' },
  berserker: { name: 'Berserker', desc: '+2 attack, -1 defense' },
  atem: { name: 'Second Wind', desc: 'Heals 1 health every 6 turns' },
  pilz: { name: 'Lucky', desc: 'Better finds in chests' },
  ausdauer: { name: 'Stamina', desc: '+1 class resource per kill' },
  henker: { name: 'Executioner', desc: '+25 % damage vs. wounded enemies' },
  spalter: { name: 'Cleaver', desc: 'Attacks cleave neighbours for 40 %', cls: 'krieger' },
  kettenblitz: { name: 'Chain Lightning', desc: 'Bolts chain for 50 %', cls: 'magier' },
  durchschuss: { name: 'Piercing Shot', desc: 'Arrows pierce for 60 %', cls: 'waldlaeufer' },
};

// Ultimative Fähigkeit ab Stufe 5; "cost" ist hier die Abklingzeit in Zügen
export const ULT_LEVEL = 5;
export const ULT: Record<ClassId, SkillDef> = {
  krieger: { name: 'Cyclone', cost: 25, desc: 'Hits and stuns every enemy within 2 tiles' },
  magier: { name: 'Meteor', cost: 25, desc: 'Massive explosion at the target, radius 2' },
  waldlaeufer: { name: 'Arrow Storm', cost: 32, desc: 'Hits every visible enemy' },
};
// Rang II verstärkt eine Fähigkeit; bei Rang III wählt man eine von zwei Ausprägungen
export interface SkillUp { r2: string; a: [string, string]; b: [string, string]; }
export const SKILL_UP: Record<string, SkillUp> = {
  krieger0: { r2: '+30 % damage, longer stun', a: ['Impact', '+60 % damage, costs 1 less'], b: ['Ram', 'Hurls the target 2 tiles away, impact hurts'] },
  krieger1: { r2: '+30 % damage', a: ['Wide Arc', '+60 % damage, radius 2'], b: ['Blood Whirl', '+60 % damage, heals 2 per hit'] },
  krieger2: { r2: 'lasts 3 turns longer', a: ['Thunder Call', 'Lasts 6 turns longer, stuns neighbours'], b: ['Bulwark', 'Lasts 6 turns longer, +3 defense meanwhile'] },
  magier0: { r2: '+30 % damage', a: ['Inferno', '+60 % damage, radius 2'], b: ['Twin Flame', '+60 % damage, second ball at another target'] },
  magier1: { r2: '+30 % damage, longer stun', a: ['Ice Storm', '+60 % damage, radius 3'], b: ['Brittle Frost', 'Targets take +50 % damage for 3 turns'] },
  magier2: { r2: 'then 1 turn of dodging', a: ['Shockwave', 'Explosion where you left'], b: ['Phase Step', 'Returns 3 mana, 2 turns of dodging'] },
  waldlaeufer0: { r2: '+30 % damage', a: ['Punch Through', '+60 % damage, pierces'], b: ['Opener', 'Guaranteed crit against unhurt targets'] },
  waldlaeufer1: { r2: 'Trap: +30 % damage', a: ['Bear Trap', '+60 % damage, stuns longer'], b: ['Trap Line', 'Places three traps in facing direction'] },
  waldlaeufer2: { r2: 'rolls 3 tiles', a: ['Dive Roll', 'Rolls 4 tiles, 2 turns of dodging'], b: ['Roll Shot', 'Fires at the nearest enemy after the roll'] },
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
  krieger: ['Shield', 'Blade', 'Battle Cry'],
  magier: ['Fire', 'Ice', 'Arcane'],
  waldlaeufer: ['Marksman', 'Trapper', 'Stalker'],
};
// Neue Zauber aus dem Baum; sie belegen die Plätze 4–6 in der Reihenfolge des Lernens
export const NEW_SKILLS: Record<string, SkillDef & { branch: number }> = {
  flammenwand: { name: 'Wall of Flame', cost: 5, desc: 'Three burning tiles between you and the enemy, 4 turns', branch: 0 },
  eislanze: { name: 'Ice Lance', cost: 4, desc: 'Beam up to 6 tiles, pierces; stunned targets take double damage', branch: 1 },
  arkanschild: { name: 'Arcane Shield', cost: 4, desc: 'Shield absorbs 8 + level damage, 5 turns', branch: 2 },
  schildwurf: { name: 'Shield Throw', cost: 7, desc: 'Throw at an enemy up to 4 tiles away', branch: 0 },
  sturmangriff: { name: 'Charge', cost: 7, desc: 'Charge up to 4 tiles at an enemy, heavy strike', branch: 1 },
  markieren: { name: 'Mark', cost: 2, desc: 'Marks an enemy for 6 turns: +30 % damage against it, its death gives 2 focus', branch: 0 },
  fangnetz: { name: 'Net', cost: 3, desc: 'Net up to 4 tiles: the target cannot move for 3 turns', branch: 1 },
  rauchbombe: { name: 'Smoke Bomb', cost: 3, desc: 'Smoke within 2 for 4 turns: archers cannot see you, melee attackers often miss', branch: 2 },
  herausforderung: { name: 'Challenge', cost: 6, desc: 'Enemies within 4 come to you, archers do not shoot for 1 turn', branch: 2 },
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
  // for all later ones); only one hunter alive at a time, the next one comes `respawn` turns after the previous died,
  // one stage stronger; from deathFrom on Death comes, reward-free; stronger growth per stage (growHp2/growAtk2);
  // stun at most 1 turn from stage stun1From; no passive regen while a stage-2+ hunter is alive
  rewardDecay: [1, 0.4, 0.15, 0], respawn: 12, deathFrom: 4, growHp2: 0.3, growAtk2: 1, stun1From: 2 };
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
    n0_2a: ['Tinder', 'Spark ignites with 30 %'],
    n0_2b: ['Smoulder', 'Burning lasts 1 turn longer and burns 1 harder'],
    n0_3: ['Wall of Flame', 'New spell, 5 mana: three burning tiles between you and the enemy, 4 turns'],
    n0_5: ['Wildfire', 'Burning enemies explode on death and ignite their neighbours'],
    n1_2a: ['Rime', 'Stunned enemies take +25 % damage'],
    n1_2b: ['Ice Armor', 'After Frost Nova +2 defense for 2 turns'],
    n1_3: ['Ice Lance', 'New spell, 4 mana: beam up to 6 tiles, pierces; stunned targets take double damage'],
    n1_5: ['Cryomancer', 'Mana returns more slowly (three quarters); +2 mana per hit on stunned enemies and bosses'],
    n2_2a: ['Afterglow', 'After Blink your next spell costs 2 mana less'],
    n2_2b: ['Ward Rune', 'Once per floor: below 30 % life you blink on your own'],
    n2_3: ['Arcane Shield', 'New spell, 4 mana: shield absorbs 8 + level damage, 5 turns'],
    n2_5: ['Time Rift', 'Blink costs no turn, then 3 turns of cooldown'],
  },
  krieger: {
    n0_2a: ['Shield Wall', 'Waiting in combat: +2 defense until your next turn and +1 rage'],
    n0_2b: ['Riposte', '25 %: when hit in melee you strike back at once'],
    n0_3: ['Shield Throw', 'New skill, 7 rage: throw at an enemy up to 4 tiles away'],
    n0_5: ['Avenger', 'No rage from your own blows, double from blows taken; Shield Bash stuns all neighbours'],
    n1_2a: ['Momentum', '+1 rage per enemy hit by Whirlwind'],
    n1_2b: ['Serrated Blade', 'Whirlwind poisons'],
    n1_3: ['Charge', 'New skill, 7 rage: charge up to 4 tiles at an enemy, heavy strike'],
    n1_5: ['Blade Rush', 'A kill grants a free turn, at most every 3 turns'],
    n2_2a: ['Blood Price', 'Melee hits taken give +1 extra rage'],
    n2_2b: ['Intimidate', 'War Cry: enemies within 2 have –1 attack while it lasts'],
    n2_3: ['Challenge', 'New skill, 6 rage: enemies within 4 come to you, archers do not shoot for 1 turn'],
    n2_5: ['Blood Rage', 'Missing rage is paid with life (2 per rage); below 50 % life +30 % damage'],
  },
  waldlaeufer: {
    n0_2a: ['Steady Hand', 'Waiting with no enemy next to you gives double focus'],
    n0_2b: ['Weak Spot', '15 %: Aimed Shot crits and stuns for 1 turn'],
    n0_3: ['Mark', 'New skill, 2 focus: mark for 6 turns, +30 % damage against the target, its death gives 2 focus'],
    n0_5: ['Draw Bead', 'Each turn without a step: next shot +25 % (up to +100 %); range +2'],
    n1_2a: ['Barbed Wire', 'Traps poison'],
    n1_2b: ['Tool Belt', 'Up to 5 traps instead of 3'],
    n1_3: ['Net', 'New skill, 3 focus: net up to 4 tiles, the target cannot move for 3 turns'],
    n1_5: ['Minefield', 'Traps are free, Dodge Roll leaves a trap; basic shot –30 %'],
    n2_2a: ['Shadow Step', 'After Dodge Roll your next shot deals +50 %'],
    n2_2b: ['Light Foot', 'Rolling away from an adjacent enemy refunds 1 focus'],
    n2_3: ['Smoke Bomb', 'New skill, 3 focus: smoke within 2 for 4 turns – archers cannot see you, melee attackers often miss'],
    n2_5: ['Skirmisher', 'Stepping away from an adjacent enemy: free shot; waiting no longer gives focus'],
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
  { id: 'hexen', need: ['brandklinge', 'giftklinge'], name: 'Witch Cauldron', desc: '+30 % damage vs. burning and poisoned enemies' },
  { id: 'stachel', need: ['dornen', 'panzer'], name: 'Spiked Plate', desc: 'Thorns count double' },
  { id: 'rausch', need: ['vampir', 'henker'], name: 'Blood Frenzy', desc: 'Every kill heals 3 more' },
  { id: 'konter', need: ['flink', 'krit'], name: 'Riposte', desc: 'After a dodge your next hit is critical' },
  { id: 'midas', need: ['gier', 'pilz'], name: 'Midas', desc: 'Every chest also holds gold' },
  { id: 'erz', need: ['meister', 'quelle'], name: 'Archmagic', desc: 'Skills cost 1 less' },
];
export interface UpgDef { id: string; name: string; desc: string; max: number; cost: number; }

export const UPGRADES: UpgDef[] = [
  { id: 'vit', name: 'Vitality', desc: '+2 health per rank', max: 5, cost: 40 },
  { id: 'atk', name: 'Whetstone', desc: '+1 attack per rank (Mage: +15 % abilities)', max: 2, cost: 120 },
  { id: 'trank', name: 'Provisions', desc: '+1 starting potion', max: 3, cost: 50 },
  { id: 'fokus', name: 'Focus', desc: '+1 max class resource', max: 3, cost: 40 },
  { id: 'gold', name: 'Starting Gold', desc: '+15 gold at the start', max: 3, cost: 30 },
  { id: 'bombe', name: 'Powder Stock', desc: '+1 bomb at the start', max: 2, cost: 40 },
  { id: 'fund', name: 'Treasure Hunter', desc: 'Better finds in chests', max: 3, cost: 60 },
  { id: 'wahl', name: 'Wisdom', desc: '+1 choice on level-up', max: 1, cost: 160 },
  { id: 'erbe', name: 'Heirloom', desc: 'Start with a random relic', max: 1, cost: 240 },
];
export const RANGER_COST = 120;
// Schleifstein beim Magier: Anteil mehr Fähigkeitsschaden je Stufe
export const MAGE_WHET = 0.15;
export const upgCost = (u: UpgDef, lvl: number) => u.cost * (lvl + 1);

export const RELICS: Record<string, PerkDef> = {
  glutherz: { name: 'Ember Heart', desc: 'Burning heals you instead of hurting' },
  donnerfaust: { name: 'Thunder Fist', desc: 'Every 5th hit also strikes all adjacent enemies' },
  pulverfass: { name: 'Powder Skin', desc: 'Explosions do not hurt you' },
  sprengmeister: { name: 'Demolitionist', desc: '+1 bomb on every new floor' },
  geisterlicht: { name: 'Ghost Light', desc: 'You see 3 tiles farther' },
  steinhaut: { name: 'Stone Skin', desc: 'Every hit against you deals 1 less damage' },
  blutpakt: { name: 'Blood Pact', desc: '+3 attack, but -20 % max health' },
  seelenkelch: { name: 'Soul Chalice', desc: 'Potions heal you fully' },
  zeitsand: { name: 'Sands of Time', desc: 'Enemies sometimes lose their turn' },
  giftzahn: { name: 'Venom Fang', desc: 'Your hits poison' },
  frostkern: { name: 'Frost Core', desc: 'Stuns last 1 turn longer' },
  muenze: { name: 'Lucky Coin', desc: 'Chests give double loot' },
  eisenwille: { name: 'Iron Will', desc: 'Survive one lethal hit per floor' },
  jaeger: { name: 'Giant Slayer', desc: '+50 % damage against bosses' },
  echo: { name: 'Echo', desc: 'Skills cost 1 less' },
};

export const RARITY = ['Common', 'Rare', 'Epic', 'Legendary'];
export const RARITY_COL = ['#94b0c2', '#41a6f6', '#9a4fc0', '#ffcd75'];
export const SLOT_NAMES = ['Weapon', 'Armor', 'Amulet', 'Ring', 'Consumable'];
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
  vamp: v => `+${v} health per kill`, dorn: v => `${v} thorn damage`, quell: v => `+${v} max class resource`, macht: v => `+${v} % skills`,
  gold: v => `+${v} % gold`, sicht: v => `+${v} sight`, brand: v => `${v} % burn on hit`, gift: v => `${v} % poison on hit`,
  frost: v => `${v} % stun on hit`, boss: v => `+${v} % vs. bosses`, flink: v => `${v} % dodge`,
  spalt: v => `Cleaves neighbours for ${v} %`, stoss: v => `Pierces for ${v} %`, kette: v => `Chains for ${v} %`, weite: v => `+${v} range`,
  asche: () => 'Slain enemies explode',
};
export const USE_ORDER = ['karte', 'sprung', 'kraft', 'quell'];
export const CONSUMABLES: Record<string, PerkDef> = {
  karte: { name: 'Map Scroll', desc: 'Reveals the whole floor' },
  sprung: { name: 'Blink Scroll', desc: 'Carries you far away from enemies' },
  kraft: { name: 'Might Potion', desc: '+3 attack for 10 turns' },
  quell: { name: 'Wellspring Potion', desc: 'Restores 6 class resource' },
};
type U = { slot: number; name: string; wk?: number; atk?: number; def?: number; hp?: number; crit?: number; aff: [string, number][]; cls?: ClassId };
export const UNIQUES: U[] = [
  { slot: 0, cls: 'krieger', name: 'Ashcleaver', wk: 1, atk: 5, aff: [['spalt', 70], ['asche', 1]] },
  { slot: 0, cls: 'magier', name: 'Worldfire', wk: 0, atk: 4, aff: [['brand', 60], ['kette', 60]] },
  { slot: 0, cls: 'waldlaeufer', name: 'Starfall', wk: 0, atk: 4, aff: [['weite', 2], ['stoss', 80]] },
  { slot: 1, name: 'Dragonhide', def: 2, hp: 10, aff: [['dorn', 4], ['flink', 6]] },
  { slot: 1, name: 'Shadow Cloak', def: 1, hp: 4, aff: [['flink', 15], ['sicht', 2]] },
  { slot: 2, name: 'Heart of the Volcano', hp: 6, crit: 0.08, aff: [['brand', 40], ['asche', 1]] },
  { slot: 2, name: 'Eye of the Seer', crit: 0.16, aff: [['sicht', 3], ['macht', 15]] },
  { slot: 3, name: 'Blood Ring', aff: [['vamp', 3], ['boss', 30]] },
  { slot: 3, name: 'Ring of Greed', aff: [['gold', 40], ['quell', 4]] },
  { slot: 3, name: 'Storm Ring', aff: [['kette', 60], ['macht', 20]] },
];
export interface Offer { kind: 'potion' | 'bomb' | 'item' | 'forge' | 'reroll'; name: string; desc: string; price: number; sold: boolean; item?: Item; left?: number; }
