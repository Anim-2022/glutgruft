// Fertigkeitsbaum, Schritt 2a: Punkte, Gaben im Wechsel, Restpunkt, Spielstände
import { describe, it, expect } from 'vitest';
import { defaultMeta, parseMeta } from '../src/core/save';
import { newRun, act, checkLevel, availableNodes, serialize, deserialize, xpNeed, Run } from '../src/game/run';
import { TREE_NODES } from '../src/game/content';

const ALL = TREE_NODES.map(n => n.id);
function levelUp(run: Run) { run.p.exp = xpNeed(run.p.lvl); checkLevel(run); }
const fresh = () => { const r = newRun(11, 'magier', defaultMeta()); r.mode = 'play'; return r; };

describe('Fertigkeitsbaum', () => {
  it('gerade Stufe: Punkt und Baum, ungerade Stufe: Gabe', () => {
    const run = fresh();
    levelUp(run); // Stufe 2
    expect(run.p.lvl).toBe(2);
    expect(run.mode).toBe('tree');
    expect(run.p.pts).toBe(1);
    act(run, { t: 'learn', id: 'n0_1' });
    expect(run.p.skillLvl[0]).toBe(1);
    expect(run.p.tree).toEqual(['n0_1']);
    expect(run.mode).toBe('play');
    levelUp(run); // Stufe 3
    expect(run.mode).toBe('perk');
    expect(run.perkChoices.every(id => !id.startsWith('skill'))).toBe(true);
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
    levelUp(run);
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
    levelUp(run); // Stufe 2: Punkt, aber nichts zu lernen
    expect(run.mode).toBe('perk');
    expect(run.p.pts).toBe(0);
    expect(run.p.rest).toBe(1);
    act(run, { t: 'perk', i: 0 });
    expect(run.mode).toBe('play');
    expect(run.p.perks.length).toBe(1);
  });

  it('Restpunkt: aufgeschobene Punkte werden beim nächsten Aufstieg zu Gaben', () => {
    const run = fresh();
    levelUp(run); act(run, { t: 'later' });          // Stufe 2: Punkt aufgehoben
    run.p.tree = ALL.filter(id => !id.endsWith('b')); // inzwischen ist alles gelernt
    levelUp(run);                                     // Stufe 3: Gabe + Restpunkt
    expect(run.p.rest).toBe(1);
    expect(run.p.pts).toBe(0);
    expect(run.mode).toBe('perk');
    act(run, { t: 'perk', i: 0 });
    expect(run.mode).toBe('perk');                    // zweite Gabe aus dem Restpunkt
    act(run, { t: 'perk', i: 0 });
    expect(run.mode).toBe('play');
    expect(run.p.perks.length).toBe(2);
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
