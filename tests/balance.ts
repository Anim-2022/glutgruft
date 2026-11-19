// Balance-Telemetrie: npm run balance
// Umgebung: N (Seeds je Zelle, 40), SEEDS=0,1,2 (Sätze), BUILD=heur,eis,eis-nokey (Varianten; -nokey ohne T5),
// Stellschrauben je Variante: BUILD=heur:treePtsMax=6:kryoRegen=0.75 (siehe TUNE in content.ts)
// CLASS=magier (CLS geht auch), META=neu|max, PAR (Prozesse, Vorgabe Kerne − 1; 1 = alles hier nacheinander)
// HAZARDS=on|off, MIMICS=on|off (neue Systeme; alle aus = Bit für Bit wie vorher), ECON=1 (Wirtschaftszeile auch ohne sie)
import { defaultMeta } from '../src/core/save';
import { newRun, act, Run, playerAtk, spellAt } from '../src/game/run';
import { CLASS_ORDER, MOBS, treeNodes, ClassId, TUNE, FEATURES, HUNTER, EVENT, DIFF, HAZARD } from '../src/game/content';
import { botAction, setBuild, Build } from './bot';

type Proc = { env: Record<string, string | undefined>; argv: string[]; execPath: string; stdout: { write(s: string): void }; getBuiltinModule(n: string): unknown };
const proc = (globalThis as unknown as { process: Proc }).process;
const ENV = proc.env;
const N = +(ENV.N ?? 40);
const SETS = (ENV.SEEDS ?? '0').split(',').map(Number);
const VARIANTS = (ENV.BUILD ?? 'heur').split(',');
const CLASSES = (ENV.CLASS ?? ENV.CLS) ? (ENV.CLASS ?? ENV.CLS)!.split(',') : CLASS_ORDER;
const METAS = ENV.META ? ENV.META.split(',') : ['neu', 'max'];
// max: alle Verbesserungen und alle Knoten des Baums im Lager freigeschaltet
const metaMax = { ...defaultMeta(), upg: { vit: 5, atk: 2, trank: 3, fokus: 3, gold: 3, bombe: 2, fund: 3, wahl: 1, erbe: 0 },
  tree: Object.fromEntries(CLASS_ORDER.map(c => [c, treeNodes(c).filter(n => n.cost).map(n => n.id)])) };
type F = { turns: number; hpLost: number; potUsed: number; kills: number; goldIn: number; lvlIn: number; atkIn: number; maxHpIn: number; n: number; deaths: number; shopVisits: number; goldAtShop: number; dmgTaken: number[]; };
type Cell = { variant: string; set: number; mname: string; cls: ClassId };
type Result = { out: string[]; sum: string; su: Record<string, number>; freq: Record<string, number> };

const TUNE0 = { ...TUNE };
FEATURES.hazards = ENV.HAZARDS !== 'off';
FEATURES.mimics = ENV.MIMICS !== 'off';
FEATURES.events = ENV.EVENTS !== 'off';
FEATURES.hunters = ENV.HUNTERS !== 'off';
FEATURES.hunterForce = ENV.HUNTER_FORCE ?? '';
if (ENV.HUNTER_INTERVAL) HUNTER.interval = +ENV.HUNTER_INTERVAL;
if (ENV.HUNTER_FIRST) HUNTER.first = +ENV.HUNTER_FIRST;
FEATURES.eventRate = +(ENV.EVENT_RATE ?? FEATURES.eventRate);
FEATURES.eventForce = ENV.EVENT_FORCE ?? '';
FEATURES.eventForceBiome = true; // Gebietsereignisse auch erzwungen nur in ihrem Gebiet
// EVENT_SET=item2=0,relicChance=0 … überschreibt Ereigniswerte für Messläufe
for (const kv of (ENV.EVENT_SET ?? '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); (EVENT as Record<string, number>)[k] = +v; }
// DIFF_SET=mobHp=1.1,… überschreibt die Schwierigkeit; mimic=… setzt den Mimik-Anteil
for (const kv of (ENV.DIFF_SET ?? '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); if (k === 'mimic') HAZARD.mimic = +v; else (DIFF as Record<string, number>)[k] = +v; }
const EXTRA = FEATURES.hazards || FEATURES.mimics || FEATURES.events || FEATURES.hunters || ENV.ECON === '1';

function runCell({ variant: full, set, mname, cls }: Cell): Result {
  const [variant, ...tunes] = full.split(':');
  Object.assign(TUNE, TUNE0);
  for (const t of tunes) { const [k, v] = t.split('='); (TUNE as Record<string, number>)[k] = +v; }
  // Zusätze: -nokey ohne T5, -x3 / -x2a / -x2b ohne diese Stufe, -xn1_3 ohne diesen Knoten (zur Ursachensuche)
  const [vbuild, ...flags] = variant.split('-');
  const drop = flags.map(f => f === 'nokey' ? '5' : f.slice(1)); // x3 = Stufe 3 aller Zweige, xn1_3 = ein Knoten
  setBuild(vbuild as Build);
  const meta = mname === 'max' ? metaMax : defaultMeta();
  const out: string[] = [];
    const su: Record<string, number> = {};
    const fl: Record<number, F> = {};
    const killers: Record<string, number> = {};
    const perkPick: Record<string, number> = {};
    let wins = 0; const finalF: number[] = []; let oneShots = 0, bigHits = 0;
    const uses = [0, 0, 0], resEnd: number[] = []; let souls = 0, gaben = 0, ranks = 0, rest = 0, ptsAll = 0; const rankLvl: number[][] = [[], []];
    const freq: Record<string, number> = {};
    let goldTotal = 0, goldSpent = 0, potBought = 0, potFound = 0, bombBought = 0, goldLeft = 0, bossDeaths = 0;
    const tele: Record<string, number> = {}, rar = [0, 0, 0, 0]; let relics = 0, items = 0, cons = 0;
    const floorT: number[] = []; // Züge je abgeschlossener Ebene (für die Jäger-Schwelle)
    for (let s = 1; s <= N; s++) {
      const run = newRun(s * 7919 + 13 + set * 1000003, cls, meta);
      if (drop.length) run.pool = run.pool.filter(id => !drop.some(d => id === d || id.endsWith(`_${d}`)));
      let cur = -1, F0: F | null = null, fT0 = 0; const resHist: number[] = [];
      for (let i = 0; i < 14000 && run.mode !== 'dead' && run.mode !== 'win'; i++) {
        if (run.floor !== cur) {
          if (cur > 0) floorT.push(run.turn - fT0);
          fT0 = run.turn;
          cur = run.floor; F0 = fl[cur] ??= { turns: 0, hpLost: 0, potUsed: 0, kills: 0, goldIn: 0, lvlIn: 0, atkIn: 0, maxHpIn: 0, n: 0, deaths: 0, shopVisits: 0, goldAtShop: 0, dmgTaken: [] };
          F0.n++; F0.goldIn += run.p.gold; F0.lvlIn += run.p.lvl; F0.atkIn += run.p.atk; F0.maxHpIn += run.p.maxHp;
        }
        const a = botAction(run);
        const b0 = run.p.bombs, hp0 = run.p.hp, pot0 = run.p.potions, t0 = run.turn, k0 = run.kills, g0 = run.p.gold, mode0 = run.mode;
        run.fx = [];
        const sk0 = run.p.skillLvl.slice(), res0 = run.p.res;
        act(run, a);
        for (const fx of run.fx) if (fx.k === 'loot') { if (fx.item.use) cons++; else { items++; rar[fx.item.rar]++; } }
        run.p.skillLvl.forEach((v, k) => { if (v > sk0[k]) rankLvl[v - 1].push(run.p.lvl); });
        if (a.t === 'skill' && a.i < 3 && run.turn > t0) uses[a.i]++;
        if (a.t === 'skill' && a.i >= 3 && run.turn > t0) { const id = spellAt(run.p, a.i)!; su[id] = (su[id] ?? 0) + 1; }
        if (run.turn > t0) { resHist.push(res0); if (resHist.length > 3) resHist.shift(); }
        if ((run.mode as string) === 'dead') resEnd.push(resHist.reduce((q, w) => q + w, 0) / Math.max(1, resHist.length));
                if (a.t === 'perk' && mode0 === 'perk') perkPick[run.p.perks[run.p.perks.length - 1] ?? '?']=(perkPick[run.p.perks[run.p.perks.length - 1] ?? '?']??0)+1;
        if (run.floor !== cur) continue;
        F0!.turns += run.turn - t0;
        F0!.kills += run.kills - k0;
        if (a.t === 'potion' && run.p.potions < pot0) F0!.potUsed++;
        if (a.t === 'buy' && run.p.gold < g0) { goldSpent += g0 - run.p.gold; if (run.p.potions > pot0) potBought++; if (run.p.bombs > b0) bombBought++; }
        else if (run.p.gold > g0) goldTotal += run.p.gold - g0;
        if (run.p.potions > pot0 && a.t !== 'buy') potFound += run.p.potions - pot0;
        if (mode0 !== 'shop' && (run.mode as string) === 'shop') { F0!.shopVisits++; F0!.goldAtShop += run.p.gold; }
        const lost = hp0 - run.p.hp;
        if (lost > 0 && a.t !== 'potion') {
          F0!.hpLost += lost;
          // Einzeltreffer
          for (const fx of run.fx) if (fx.k === 'num' && fx.col === '#b13e53') { const v = +fx.s; F0!.dmgTaken.push(v); if (v >= run.p.maxHp * 0.5) bigHits++; if (v >= hp0 && hp0 === run.p.maxHp) oneShots++; }
        }
        if ((run.mode as string) === 'dead') {
          F0!.deaths++;
          if (run.ev) { (run.tele ??= {})[`evDeath_${run.ev.id}`] = 1; run.tele.evDeath = (run.tele.evDeath ?? 0) + 1; }
          const hk = run.mobs.find(m => MOBS[m.kind].hunter && Math.max(Math.abs(m.x - run.p.x), Math.abs(m.y - run.p.y)) <= 5);
          if (hk) { (run.tele ??= {})[`huntDeath_${hk.kind}`] = (run.tele[`huntDeath_${hk.kind}`] ?? 0) + 1; }
          const adj = run.mobs.filter(m => Math.max(Math.abs(m.x - run.p.x), Math.abs(m.y - run.p.y)) <= 5 && run.vis[m.y*64+m.x]).map(m => m.kind + (m.elite ? '*' : ''));
          const key = adj.length ? [...new Set(adj)].sort().join('+') : (run.p.st.gift ? 'gift' : run.p.st.brand ? 'brand' : 'other');
          killers[key] = (killers[key] ?? 0) + 1; if (run.mobs.some(m => m.boss && run.vis[m.y*64+m.x])) bossDeaths++;
        }
      }
      if (run.mode === 'win') { wins++; goldLeft += run.p.gold; }
      for (const [k, v] of Object.entries(run.tele ?? {})) tele[k] = (tele[k] ?? 0) + v;
      relics += run.p.relics.length;
      souls += run.souls; gaben += run.p.perks.length; ranks += run.p.skillLvl.reduce((x, y) => x + y, 0);
      rest += run.p.rest; ptsAll += run.p.tree.length + run.p.pts + run.p.rest;
      for (const id of run.p.tree) freq[id] = (freq[id] ?? 0) + 1;
      finalF.push(run.floor);
    }
    finalF.sort((a, b) => a - b);
    out.push(`\n=== ${mname} ${cls}: Median Ebene ${finalF[N >> 1]}, Siege ${wins}/${N}, Big hits(>=50%maxHP) ${bigHits}, One-shots from full ${oneShots}`);
    out.push(`Gold verdient ${(goldTotal/N).toFixed(0)}/Lauf, ausgegeben ${(goldSpent/N).toFixed(0)}, Tränke gekauft ${(potBought/N).toFixed(1)}, gefunden ${(potFound/N).toFixed(1)}, Bomben gekauft ${(bombBought/N).toFixed(1)}, Gold übrig bei Sieg ${wins ? (goldLeft/wins).toFixed(0) : '-'}, Tode mit Boss in Sicht ${bossDeaths}`);
    if (EXTRA) {
      const t = (k: string) => ((tele[k] ?? 0) / N).toFixed(2);
      out.push(`Wirtschaft/Lauf: Reliquien ${(relics / N).toFixed(2)}, Gegenstände ${(items / N).toFixed(1)} (Seltenheit ${rar.map(r => (r / N).toFixed(1)).join('/')}), Verbrauchsgüter ${(cons / N).toFixed(1)}, Seelen ${(souls / N).toFixed(0)}`);
      if (FEATURES.events) {
        const ids = [...new Set(Object.keys(tele).filter(k => k.startsWith('evStart_')).map(k => k.slice(8)))].sort();
        const started = ids.reduce((a, id) => a + (tele[`evStart_${id}`] ?? 0), 0), won = ids.reduce((a, id) => a + (tele[`evWon_${id}`] ?? 0), 0);
        out.push(`Ereignisse/Lauf: gestartet ${(started / N).toFixed(2)}, geschafft ${(won / N).toFixed(2)}, entfallen ${t('evSkip')}, Tode im Ereignis ${t('evDeath')} · Lohn/Lauf: Gold ${t('evGold')}, Seelen ${t('evSouls')}, Gegenstände ${t('evItems')}, Reliquienwahl ${t('evRelic')}`);
        out.push('Ereignis: ' + ids.map(id => `${id} ${tele[`evStart_${id}`] ?? 0}/${tele[`evWon_${id}`] ?? 0}/${tele[`evDeath_${id}`] ?? 0}`).join('  ') + '  (gestartet/geschafft/Tode)');
      }
      {
        const q = (f: number) => { const v = [...floorT].sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(f * v.length))] : 0; };
        out.push(`Züge je Ebene: p50 ${q(0.5)}, p75 ${q(0.75)}, p90 ${q(0.9)}, p95 ${q(0.95)}, max ${q(1)}`);
        if (FEATURES.hunters) {
          const ks = ['echse', 'krake', 'drache', 'medusa', 'tod'];
          out.push('Jäger (erschienen/besiegt/Tode): ' + ks.map(k => `${k} ${tele[`hunt_${k}`] ?? 0}/${tele[`huntKill_${k}`] ?? 0}/${tele[`huntDeath_${k}`] ?? 0}`).join('  ') + `  · Sense ${tele.todExec ?? 0}`);
        }
      }
      out.push(`Fallen/Lauf: ausgelöst ${t('trapHit')}, Schaden ${t('trapDmg')}, von Gegnern ${t('trapMob')}, entdeckt ${t('trapSpot')} · Mimiks/Lauf: getroffen ${t('mimicMet')}, besiegt ${t('mimicKilled')}, Seltenheit+1 ${t('mimicRarUp')}`);
    }
    out.push('Eb  n  Tod  Züge  HPverl  Tränke Kills  Gold  Lvl  Atk  MaxHP  maxHit  medHit');
    for (const f of Object.keys(fl).map(Number).sort((a, b) => a - b)) {
      const x = fl[f]; const d = x.dmgTaken.sort((a,b)=>a-b);
      out.push(`${String(f).padStart(2)} ${String(x.n).padStart(3)} ${String(x.deaths).padStart(3)} ${(x.turns / x.n).toFixed(0).padStart(5)} ${(x.hpLost / x.n).toFixed(0).padStart(6)} ${(x.potUsed / x.n).toFixed(2).padStart(6)} ${(x.kills / x.n).toFixed(1).padStart(5)} ${(x.goldIn / x.n).toFixed(0).padStart(5)} ${(x.lvlIn / x.n).toFixed(1).padStart(4)} ${(x.atkIn / x.n).toFixed(1).padStart(4)} ${(x.maxHpIn / x.n).toFixed(0).padStart(5)} ${String(d[d.length - 1] ?? 0).padStart(6)} ${String(d[d.length>>1]??0).padStart(6)}`);
    }
    const avg = (x: number[]) => x.length ? (x.reduce((q, w) => q + w, 0) / x.length).toFixed(1) : '-';
    const sum = (`${mname} ${cls.padEnd(11)} Siege ${String(wins).padStart(2)}/${N}  Median ${String(finalF[N >> 1]).padStart(2)}  Seelen/Lauf ${(souls / N).toFixed(0)}  Gaben ${(gaben / N).toFixed(1)}  Ränge ${(ranks / N).toFixed(1)}  Stufe RangII ${avg(rankLvl[0])} RangIII ${avg(rankLvl[1])}  Restpunkt ${ptsAll ? (100 * rest / ptsAll).toFixed(0) : 0} %  Fähigkeiten/Lauf ${uses.map(u => (u / N).toFixed(1)).join(' / ')}  Ressource vor Tod ${avg(resEnd)}`);
    out.push('Tod durch: ' + JSON.stringify(Object.entries(killers).sort((a,b)=>b[1]-a[1]).slice(0,8)));
    return { out, sum, su, freq };
}

const cells: Cell[] = [];
for (const variant of VARIANTS) for (const set of SETS) for (const mname of ['neu', 'max'].filter(m => METAS.includes(m)))
  for (const cls of CLASS_ORDER.filter(c => CLASSES.includes(c))) cells.push({ variant, set, mname, cls });

// Kindprozess: genau eine Zelle rechnen und als JSON zurückgeben
async function runAll(): Promise<Result[]> {
  if (ENV.CELL) return [runCell(JSON.parse(ENV.CELL))];
  const os = proc.getBuiltinModule('os') as { cpus(): unknown[] };
  const PAR = Math.max(1, +(ENV.PAR ?? os.cpus().length - 1));
  if (PAR === 1) return cells.map(runCell);
  const cp = proc.getBuiltinModule('child_process') as { spawn(cmd: string, args: string[], o: object): { stdout: { on(e: string, f: (d: unknown) => void): void }; stderr: { on(e: string, f: (d: unknown) => void): void }; on(e: string, f: (c: number) => void): void } };
  // vite-node gibt seinen eigenen Pfad nicht weiter; daher hier ausdrücklich
  const SELF = new URL(import.meta.url).pathname, VITE_NODE = new URL('../node_modules/vite-node/vite-node.mjs', import.meta.url).pathname;
  const res: Result[] = new Array(cells.length);
  let next = 0;
  const worker = async () => {
    while (next < cells.length) {
      const i = next++;
      res[i] = await new Promise<Result>((ok, fail) => {
        const ch = cp.spawn(proc.execPath, [VITE_NODE, SELF], { env: { ...ENV, CELL: JSON.stringify(cells[i]), PAR: '1' } });
        let buf = '', err = '';
        ch.stdout.on('data', d => { buf += String(d); });
        ch.stderr.on('data', d => { err += String(d); });
        ch.on('close', code => { const m = buf.match(/@@CELL@@(.*)$/m); if (code || !m) fail(new Error(`Zelle ${JSON.stringify(cells[i])}: ${err}`)); else ok(JSON.parse(m[1])); });
      });
    }
  };
  await Promise.all(Array.from({ length: PAR }, worker));
  return res;
}

runAll().then(res => {
  if (ENV.CELL) { proc.stdout.write(`@@CELL@@${JSON.stringify(res[0])}\n`); return; }
  // Ausgabe je Variante und Seed-Satz, wie bisher
  for (const variant of VARIANTS) for (const set of SETS) {
    const idx = cells.map((c, i) => [c, i] as const).filter(([c]) => c.variant === variant && c.set === set);
    for (const [, i] of idx) for (const l of res[i].out) console.log(l);
    const [vb, ...vt] = variant.split(':');
    console.log(`\n=== Zusammenfassung (SEEDS=${set}${vb.endsWith('-nokey') ? ', ohne T5' : ''}, BUILD=${vb.replace('-nokey', '')}${vt.length ? ', ' + vt.join(', ') : ''}) ===`);
    for (const [, i] of idx) console.log(res[i].sum);
    console.log('\nNeue Zauber je Lauf:');
    for (const [c, i] of idx) if (Object.keys(res[i].su).length) console.log(`${c.mname} ${c.cls}`.padEnd(16), Object.entries(res[i].su).map(([id, n]) => `${id} ${(n / N).toFixed(1)}`).join('  '));
    console.log('\nKnoten (Anteil der Läufe):');
    for (const [c, i] of idx) console.log(`${c.mname} ${c.cls}`.padEnd(16), Object.entries(res[i].freq).sort().map(([id, n]) => `${id} ${(100 * n / N).toFixed(0)}%`).join('  '));
  }
});
void MOBS; void playerAtk; void ({} as Run);
