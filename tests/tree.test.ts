// Fertigkeitsbaum, Schritt 2a: Punkte, Gaben im Wechsel, Restpunkt, Spielstände
import { describe, it, expect } from 'vitest';
import { defaultMeta, parseMeta } from '../src/core/save';
import { newRun, act, checkLevel, availableNodes, serialize, deserialize, xpNeed, Run, TREE_EVERY } from '../src/game/run';
import { treeNodes } from '../src/game/content';

const ALL = treeNodes('krieger').map(n => n.id);
function levelUp(run: Run) { run.p.exp = xpNeed(run.p.lvl); checkLevel(run); }
// bis kurz vor die nächste Punktstufe aufsteigen, die Gaben unterwegs wählen
function toPointLevel(run: Run) { while ((run.p.lvl + 1) % TREE_EVERY) { levelUp(run); while (run.mode === 'perk') act(run, { t: 'perk', i: 0 }); } levelUp(run); }
const fresh = () => { const r = newRun(11, 'krieger', defaultMeta()); r.mode = 'play'; return r; };

describe('Fertigkeitsbaum', () => {
  it('jede dritte Stufe: Punkt und Baum, sonst Gabe', () => {
    expect(TREE_EVERY).toBe(3);
    const run = fresh();
    levelUp(run); // Stufe 2
    expect(run.mode).toBe('perk');
    expect(run.perkChoices.every(id => !id.startsWith('skill'))).toBe(true);
    act(run, { t: 'perk', i: 0 });
    levelUp(run); // Stufe 3
    expect(run.p.lvl).toBe(3);
    expect(run.mode).toBe('tree');
    expect(run.p.pts).toBe(1);
    act(run, { t: 'learn', id: 'n0_1' });
    expect(run.p.skillLvl[0]).toBe(1);
    expect(run.p.tree).toEqual(['n0_1']);
    expect(run.mode).toBe('play');
    levelUp(run); // Stufe 4
    expect(run.mode).toBe('perk');
    act(run, { t: 'perk', i: 0 });
    levelUp(run); // Stufe 5
    expect(run.mode).toBe('perk');
    act(run, { t: 'perk', i: 0 });
    levelUp(run); // Stufe 6
    expect(run.mode).toBe('tree');
  });

  it('Rang III: A und B schließen sich aus, Voraussetzung ist Rang II', () => {
    const run = fresh();
    expect(availableNodes(run)).toEqual(['n0_1', 'n1_1', 'n2_1']);
    run.p.tree = ['n1_1']; run.p.skillLvl = [0, 1, 0];
    expect(availableNodes(run)).toContain('n1_4a');
    run.p.pts = 1; run.mode = 'tree';
    act(run, { t: 'learn', id: 'n1_4b' });
    expect(run.p.skillLvl[1]).toBe(2);
    expect(run.p.skillMod[1]).toBe(2);
    expect(availableNodes(run)).not.toContain('n1_4a');
    // Gelerntes oder Gesperrtes lässt sich nicht nehmen
    run.p.pts = 1; run.mode = 'tree';
    act(run, { t: 'learn', id: 'n1_4a' });
    expect(run.p.pts).toBe(1);
    expect(run.mode).toBe('tree');
  });

  it('„später“ behält den Punkt, der Baum lässt sich wieder öffnen', () => {
    const run = fresh();
    toPointLevel(run);
    act(run, { t: 'later' });
    expect(run.mode).toBe('play');
    expect(run.p.pts).toBe(1);
    act(run, { t: 'tree' });
    expect(run.mode).toBe('tree');
  });

  it('Restpunkt: ohne lernbaren Knoten sofort eine Gabe', () => {
    const run = fresh();
    run.p.tree = ALL.filter(id => !id.endsWith('b')); run.p.skillLvl = [2, 2, 2]; run.p.skillMod = [1, 1, 1];
    expect(availableNodes(run)).toEqual([]);
    run.p.lvl = 2;
    levelUp(run); // Stufe 3: Punkt, aber nichts zu lernen
    expect(run.mode).toBe('perk');
    expect(run.p.pts).toBe(0);
    expect(run.p.rest).toBe(1);
    act(run, { t: 'perk', i: 0 });
    expect(run.mode).toBe('play');
    expect(run.p.perks.length).toBe(1);
  });

  it('Restpunkt: aufgeschobene Punkte werden beim nächsten Aufstieg zu Gaben', () => {
    const run = fresh();
    toPointLevel(run); act(run, { t: 'later' });     // Stufe 3: Punkt aufgehoben
    const perks = run.p.perks.length;
    run.p.tree = ALL.filter(id => !id.endsWith('b')); // inzwischen ist alles gelernt
    levelUp(run);                                     // Stufe 4: Gabe + Restpunkt
    expect(run.p.rest).toBe(1);
    expect(run.p.pts).toBe(0);
    expect(run.mode).toBe('perk');
    act(run, { t: 'perk', i: 0 });
    expect(run.mode).toBe('perk');                    // zweite Gabe aus dem Restpunkt
    act(run, { t: 'perk', i: 0 });
    expect(run.mode).toBe('play');
    expect(run.p.perks.length).toBe(perks + 2);
  });

  it('Restpunkt: auch beim Öffnen des Baums', () => {
    const run = fresh();
    run.p.pts = 1; run.p.tree = ALL.filter(id => !id.endsWith('b'));
    act(run, { t: 'tree' });
    expect(run.mode).toBe('perk');
    expect(run.p.rest).toBe(1);
  });

  it('alter Lauf ohne Baum: Knoten aus den Rängen, kein Rang doppelt', () => {
    const run = fresh();
    run.p.skillLvl = [1, 2, 0]; run.p.skillMod = [0, 2, 0];
    const o = JSON.parse(serialize(run));
    delete o.p.tree; delete o.p.pts; delete o.p.rest; delete o.pool; delete o.perkQ;
    const back = deserialize(JSON.stringify(o))!;
    expect(back.p.tree).toEqual(['n0_1', 'n1_1', 'n1_4b']);
    expect(back.p.pts).toBe(0);
    expect(back.perkQ).toBe(0);
    const av = availableNodes(back);
    expect(av).not.toContain('n0_1');
    expect(av).not.toContain('n1_4a');
    expect(av).toEqual(['n0_4a', 'n0_4b', 'n2_1']);
  });

  it('alte Rangkarte aus einem Spielstand trägt sich in den Baum ein', () => {
    const run = fresh();
    run.perkChoices = ['skill2']; run.mode = 'perk';
    act(run, { t: 'perk', i: 0 });
    expect(run.p.tree).toEqual(['n2_1']);
  });

  it('alter Lager-Stand ohne Baum bekommt leere Listen', () => {
    const old = JSON.stringify({ souls: 50, upg: { vit: 2 }, ranger: true, best: 4, daily: { date: 0, best: 0 } });
    const m = parseMeta(old);
    expect(m.tree).toEqual({ krieger: [], magier: [], waldlaeufer: [] });
    expect(m.upg.vit).toBe(2);
    expect(m.souls).toBe(50);
  });
});
