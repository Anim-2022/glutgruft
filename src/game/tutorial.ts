// Lehrgang für neue Spieler: Schritte im ersten Lauf und Karten beim ersten Kennenlernen.
// Reine Funktionen ohne Zufall: die Spiellogik bleibt unberührt.
import { W, T } from './dungeon';
import { Run, Action } from './run';
import { CLASSES, RELICS } from './content';

// Zustand vor einer Aktion, um danach zu sehen, was sie bewirkt hat
export interface Snap { x: number; y: number; kills: number; potions: number; perks: number; tree: number; floor: number; gear: string; bag: number; ultCd: number; turn: number; }
export const snap = (run: Run): Snap => ({
  x: run.p.x, y: run.p.y, kills: run.kills, potions: run.p.potions, perks: run.p.perks.length + run.p.relics.length,
  tree: run.p.tree.length, floor: run.floor, gear: run.p.gear.map(g => g?.name ?? '').join('|'), bag: run.p.bag.length, ultCd: run.p.ultCd, turn: run.turn,
});

const seen = (run: Run, pred: (t: number) => boolean) => { for (let i = 0; i < run.tiles.length; i++) if (run.vis[i] && pred(run.tiles[i])) return true; return false; };
const foeInSight = (run: Run) => run.mobs.some(m => run.vis[m.y * W + m.x]);
const bossInSight = (run: Run) => run.mobs.some(m => m.boss && run.vis[m.y * W + m.x]);

export interface TutStep {
  id: string;
  text: (run: Run) => string;
  ready: (run: Run) => boolean;                     // passt der Schritt gerade?
  done: (run: Run, a: Action, b: Snap) => boolean;  // hat die letzte Aktion ihn erfüllt?
}

let moves = 0; // Schritte für „Bewegen“ (nur Anzeige, nicht gespeichert)
export const resetMoves = () => { moves = 0; };

export const STEPS: TutStep[] = [
  { id: 'bewegen', text: () => 'Arrow keys or WASD: move', ready: () => true,
    done: (run, _a, b) => { if (run.p.x !== b.x || run.p.y !== b.y) moves++; return moves >= 3; } },
  { id: 'angriff', text: run => CLASSES[run.p.cls].range ? '[F] shoots the nearest enemy – or walk into it' : 'Walking into an enemy attacks it', ready: foeInSight,
    done: (run, _a, b) => run.kills > b.kills },
  { id: 'faehigkeit', text: run => `[1] ${CLASSES[run.p.cls].skills[0].name} – skills cost ${CLASSES[run.p.cls].resName}`, ready: foeInSight,
    done: (run, a, b) => a.t === 'skill' && run.turn > b.turn },
  { id: 'trank', text: () => 'Low on life: [Q] drinks a healing potion', ready: run => run.p.hp < run.p.maxHp * 0.5 && run.p.potions > 0,
    done: (run, a, b) => a.t === 'potion' && run.p.potions < b.potions },
  { id: 'ausruestung', text: () => 'Open chests by walking into them · [I] backpack, equip gear', ready: run => run.p.bag.length > 0 || seen(run, t => t === T.CHEST),
    done: (run, _a, b) => run.p.gear.map(g => g?.name ?? '').join('|') !== b.gear || run.p.bag.length > b.bag },
  { id: 'gabe', text: () => 'Level up: pick a boon with [1]–[4]', ready: run => run.mode === 'perk',
    done: (run, _a, b) => run.p.perks.length + run.p.relics.length > b.perks },
  { id: 'baum', text: () => 'Skill point: [K] opens the tree, [ENTER] learns', ready: run => run.p.pts > 0 || run.mode === 'tree',
    done: (run, _a, b) => run.p.tree.length > b.tree },
  { id: 'treppe', text: () => 'Stairs found: step on them and press [E]', ready: run => seen(run, t => t === T.STAIRS),
    done: (run, _a, b) => run.floor > b.floor },
  { id: 'ult', text: () => 'From level 5: [U] ultimate skill – then a long cooldown', ready: run => run.p.lvl >= 5 && !run.p.ultCd && foeInSight(run),
    done: (run, a, b) => a.t === 'ult' && run.p.ultCd > b.ultCd },
  { id: 'boss', text: () => 'A boss! It calls reinforcements – keep potions and [U] ready', ready: bossInSight,
    done: run => bossInSight(run) },
];
export const STEP_COUNT = STEPS.length;

// Aktueller Schritt: der erste offene, der gerade passt
export function currentStep(done: string[], run: Run): TutStep | null {
  return STEPS.find(s => !done.includes(s.id) && s.ready(run)) ?? null;
}

// Nach einer Aktion: welche Schritte sind jetzt erfüllt? Nur passende, offene Schritte zählen.
export function stepsDone(done: string[], run: Run, a: Action, b: Snap): string[] {
  return STEPS.filter(s => !done.includes(s.id) && s.done(run, a, b)).map(s => s.id);
}

// Karten beim ersten Kennenlernen
export interface TutCard { id: string; title: string; lines: string[]; }
export const CARDS: Record<string, TutCard> = {
  gabe: { id: 'gabe', title: 'Boons', lines: ['Every level-up lets you pick a boon.', 'Some boons combine into a synergy.', 'Every third level gives a skill point instead.'] },
  reliquie: { id: 'reliquie', title: 'Relics', lines: ['A solved puzzle rewards you with a relic.', 'Relics are stronger than boons and last the whole run.'] },
  baum: { id: 'baum', title: 'Skill tree', lines: ['Every skill has a branch. One point learns one node.', 'At most 6 points per run, boons after that.', 'Unlock new nodes in camp with soul shards.'] },
  haendler: { id: 'haendler', title: 'Trader', lines: ['Gold for healing potions, bombs and gear.', 'The smith improves your weapon or armour.', '[1]–[9] buy, [SPACE] moves on.'] },
  raetsel: { id: 'raetsel', title: 'Puzzle chamber', lines: ['Push crates, touch runes in the right order,', 'slide across ice or survive a trial.', 'The reward is a relic.'] },
  tod: { id: 'tod', title: 'Fallen', lines: ['The run is over, but not in vain:', 'You take your soul shards back to camp.', 'There, upgrades make the next descent easier.'] },
  lager: { id: 'lager', title: 'The Camp', lines: ['Soul shards buy permanent upgrades (right).', 'In the skill tree you unlock new nodes.', 'Pick a class with the arrows, [SPACE] starts the descent.'] },
};

// Welche Karte steht im Lauf gerade an?
export function runCard(shown: string[], run: Run): TutCard | null {
  const want = run.mode === 'perk' ? (run.perkChoices.some(id => RELICS[id]) ? 'reliquie' : 'gabe')
    : run.mode === 'tree' ? 'baum'
    : run.mode === 'shop' ? 'haendler'
    : run.mode === 'dead' ? 'tod'
    : run.puzzle?.entered && !run.puzzle.solved ? 'raetsel' : null;
  return want && !shown.includes(want) ? CARDS[want] : null;
}
