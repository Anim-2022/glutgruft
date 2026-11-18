// Balance-Telemetrie: npm run balance
// Umgebung: N (Seeds je Zelle, 40), SEEDS=0,1,2 (Sätze), BUILD=heur,eis,eis-nokey (Varianten; -nokey ohne T5),
// CLASS=magier (CLS geht auch), META=neu|max, PAR (Prozesse, Vorgabe Kerne − 1; 1 = alles hier nacheinander)
import { defaultMeta } from '../src/core/save';
import { newRun, act, Run, playerAtk, spellAt } from '../src/game/run';
import { CLASS_ORDER, MOBS, treeNodes, ClassId } from '../src/game/content';
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

function runCell({ variant, set, mname, cls }: Cell): Result {
  const nokey = variant.endsWith('-nokey');
  setBuild(variant.replace('-nokey', '') as Build);
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
    for (let s = 1; s <= N; s++) {
      const run = newRun(s * 7919 + 13 + set * 1000003, cls, meta);
      if (nokey) run.pool = run.pool.filter(id => !id.endsWith('_5'));
      let cur = -1, F0: F | null = null; const resHist: number[] = [];
      for (let i = 0; i < 14000 && run.mode !== 'dead' && run.mode !== 'win'; i++) {
        if (run.floor !== cur) {
          cur = run.floor; F0 = fl[cur] ??= { turns: 0, hpLost: 0, potUsed: 0, kills: 0, goldIn: 0, lvlIn: 0, atkIn: 0, maxHpIn: 0, n: 0, deaths: 0, shopVisits: 0, goldAtShop: 0, dmgTaken: [] };
          F0.n++; F0.goldIn += run.p.gold; F0.lvlIn += run.p.lvl; F0.atkIn += run.p.atk; F0.maxHpIn += run.p.maxHp;
        }
        const a = botAction(run);
        const b0 = run.p.bombs, hp0 = run.p.hp, pot0 = run.p.potions, t0 = run.turn, k0 = run.kills, g0 = run.p.gold, mode0 = run.mode;
        run.fx = [];
        const sk0 = run.p.skillLvl.slice(), res0 = run.p.res;
        act(run, a);
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
          const adj = run.mobs.filter(m => Math.max(Math.abs(m.x - run.p.x), Math.abs(m.y - run.p.y)) <= 5 && run.vis[m.y*64+m.x]).map(m => m.kind + (m.elite ? '*' : ''));
          const key = adj.length ? [...new Set(adj)].sort().join('+') : (run.p.st.gift ? 'gift' : run.p.st.brand ? 'brand' : 'other');
          killers[key] = (killers[key] ?? 0) + 1; if (run.mobs.some(m => m.boss && run.vis[m.y*64+m.x])) bossDeaths++;
        }
      }
      if (run.mode === 'win') { wins++; goldLeft += run.p.gold; }
      souls += run.souls; gaben += run.p.perks.length; ranks += run.p.skillLvl.reduce((x, y) => x + y, 0);
      rest += run.p.rest; ptsAll += run.p.tree.length + run.p.pts + run.p.rest;
      for (const id of run.p.tree) freq[id] = (freq[id] ?? 0) + 1;
      finalF.push(run.floor);
    }
    finalF.sort((a, b) => a - b);
    out.push(`\n=== ${mname} ${cls}: Median Ebene ${finalF[N >> 1]}, Siege ${wins}/${N}, Big hits(>=50%maxHP) ${bigHits}, One-shots from full ${oneShots}`);
    out.push(`Gold verdient ${(goldTotal/N).toFixed(0)}/Lauf, ausgegeben ${(goldSpent/N).toFixed(0)}, Tränke gekauft ${(potBought/N).toFixed(1)}, gefunden ${(potFound/N).toFixed(1)}, Bomben gekauft ${(bombBought/N).toFixed(1)}, Gold übrig bei Sieg ${wins ? (goldLeft/wins).toFixed(0) : '-'}, Tode mit Boss in Sicht ${bossDeaths}`);
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
    console.log(`\n=== Zusammenfassung (SEEDS=${set}${variant.endsWith('-nokey') ? ', ohne T5' : ''}, BUILD=${variant.replace('-nokey', '')}) ===`);
    for (const [, i] of idx) console.log(res[i].sum);
    console.log('\nNeue Zauber je Lauf:');
    for (const [c, i] of idx) if (Object.keys(res[i].su).length) console.log(`${c.mname} ${c.cls}`.padEnd(16), Object.entries(res[i].su).map(([id, n]) => `${id} ${(n / N).toFixed(1)}`).join('  '));
    console.log('\nKnoten (Anteil der Läufe):');
    for (const [c, i] of idx) console.log(`${c.mname} ${c.cls}`.padEnd(16), Object.entries(res[i].freq).sort().map(([id, n]) => `${id} ${(100 * n / N).toFixed(0)}%`).join('  '));
  }
});
void MOBS; void playerAtk; void ({} as Run);
