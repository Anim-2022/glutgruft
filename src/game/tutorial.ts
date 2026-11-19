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
  { id: 'bewegen', text: () => 'Pfeiltasten oder WASD: bewegen', ready: () => true,
    done: (run, _a, b) => { if (run.p.x !== b.x || run.p.y !== b.y) moves++; return moves >= 3; } },
  { id: 'angriff', text: run => CLASSES[run.p.cls].range ? '[F] schießt auf den nächsten Gegner – oder hineinlaufen' : 'In einen Gegner hineinlaufen greift an', ready: foeInSight,
    done: (run, _a, b) => run.kills > b.kills },
  { id: 'faehigkeit', text: run => `[1] ${CLASSES[run.p.cls].skills[0].name} – Fähigkeiten kosten ${CLASSES[run.p.cls].resName}`, ready: foeInSight,
    done: (run, a, b) => a.t === 'skill' && run.turn > b.turn },
  { id: 'trank', text: () => 'Wenig Leben: [Q] trinkt einen Heiltrank', ready: run => run.p.hp < run.p.maxHp * 0.5 && run.p.potions > 0,
    done: (run, a, b) => a.t === 'potion' && run.p.potions < b.potions },
  { id: 'ausruestung', text: () => 'Truhen öffnen: hineinlaufen · [I] Rucksack, Ausrüstung anlegen', ready: run => run.p.bag.length > 0 || seen(run, t => t === T.CHEST),
    done: (run, _a, b) => run.p.gear.map(g => g?.name ?? '').join('|') !== b.gear || run.p.bag.length > b.bag },
  { id: 'gabe', text: () => 'Stufenaufstieg: wähle eine Gabe mit [1]–[4]', ready: run => run.mode === 'perk',
    done: (run, _a, b) => run.p.perks.length + run.p.relics.length > b.perks },
  { id: 'baum', text: () => 'Fertigkeitspunkt: [K] öffnet den Baum, [ENTER] lernt', ready: run => run.p.pts > 0 || run.mode === 'tree',
    done: (run, _a, b) => run.p.tree.length > b.tree },
  { id: 'treppe', text: () => 'Treppe gefunden: draufstellen und [E] drücken', ready: run => seen(run, t => t === T.STAIRS),
    done: (run, _a, b) => run.floor > b.floor },
  { id: 'ult', text: () => 'Ab Stufe 5: [U] ultimative Fähigkeit – danach lange Pause', ready: run => run.p.lvl >= 5 && !run.p.ultCd && foeInSight(run),
    done: (run, a, b) => a.t === 'ult' && run.p.ultCd > b.ultCd },
  { id: 'boss', text: () => 'Ein Boss! Er ruft Verstärkung – Tränke und [U] bereithalten', ready: bossInSight,
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
  gabe: { id: 'gabe', title: 'Gaben', lines: ['Bei jedem Stufenaufstieg wählst du eine Gabe.', 'Manche Gaben ergeben zusammen eine Synergie.', 'Jede dritte Stufe gibt stattdessen einen Fertigkeitspunkt.'] },
  reliquie: { id: 'reliquie', title: 'Reliquien', lines: ['Ein gelöstes Rätsel belohnt dich mit einer Reliquie.', 'Reliquien sind stärker als Gaben und bleiben den ganzen Lauf.'] },
  baum: { id: 'baum', title: 'Fertigkeitsbaum', lines: ['Jede Fähigkeit hat einen Zweig. Ein Punkt lernt einen Knoten.', 'Höchstens 6 Punkte je Lauf, danach gibt es Gaben.', 'Neue Knoten schaltest du im Lager mit Seelensplittern frei.'] },
  haendler: { id: 'haendler', title: 'Händler', lines: ['Gold gegen Heiltränke, Bomben und Ausrüstung.', 'Der Schmied verbessert Waffe oder Rüstung.', '[1]–[9] kaufen, [LEERTASTE] geht weiter.'] },
  raetsel: { id: 'raetsel', title: 'Rätselkammer', lines: ['Kisten schieben, Runen in der richtigen Reihenfolge,', 'über Eis rutschen oder eine Prüfung überstehen.', 'Der Lohn ist eine Reliquie.'] },
  tod: { id: 'tod', title: 'Gefallen', lines: ['Der Lauf ist vorbei, aber nicht umsonst:', 'Deine Seelensplitter nimmst du ins Lager mit.', 'Dort machen Verbesserungen den nächsten Abstieg leichter.'] },
  lager: { id: 'lager', title: 'Das Lager', lines: ['Seelensplitter kaufen dauerhafte Verbesserungen (rechts).', 'Im Fertigkeitsbaum schaltest du neue Knoten frei.', 'Wähle die Klasse mit den Pfeilen, [LEERTASTE] startet den Abstieg.'] },
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
