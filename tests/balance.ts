// Balance-Telemetrie: npm run balance (N=40 Seeds je Klasse und Meta)
import { defaultMeta } from '../src/core/save';
import { newRun, act, Run, playerAtk } from '../src/game/run';
import { CLASS_ORDER, MOBS } from '../src/game/content';
import { botAction } from './bot';

// Zusammenfassung je Klasse und Meta (am Ende ausgegeben)
const summary: string[] = [];
const nodeFreq: Record<string, Record<string, number>> = {};

// SEEDS=k wählt einen anderen Satz Seeds (0 = bisheriger Satz)
const SET = +((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SEEDS ?? 0);
const N = +((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.N ?? 40);
const metaMax = { ...defaultMeta(), upg: { vit: 5, atk: 2, trank: 3, fokus: 3, gold: 3, bombe: 2, fund: 3, wahl: 1, erbe: 0 } };
type F = { turns: number; hpLost: number; potUsed: number; kills: number; goldIn: number; lvlIn: number; atkIn: number; maxHpIn: number; n: number; deaths: number; shopVisits: number; goldAtShop: number; dmgTaken: number[]; };
for (const [mname, meta] of [['neu', defaultMeta()], ['max', metaMax]] as const) {
  for (const cls of CLASS_ORDER) {
    const fl: Record<number, F> = {};
    const killers: Record<string, number> = {};
    const perkPick: Record<string, number> = {};
    let wins = 0; const finalF: number[] = []; let oneShots = 0, bigHits = 0;
    const uses = [0, 0, 0], resEnd: number[] = []; let souls = 0, gaben = 0, ranks = 0, rest = 0, ptsAll = 0; const rankLvl: number[][] = [[], []];
    const freq = nodeFreq[`${mname} ${cls}`] = {} as Record<string, number>;
    let goldTotal = 0, goldSpent = 0, potBought = 0, potFound = 0, bombBought = 0, goldLeft = 0, bossDeaths = 0;
    for (let s = 1; s <= N; s++) {
      const run = newRun(s * 7919 + 13 + SET * 1000003, cls, meta);
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
        if (a.t === 'skill' && run.turn > t0) uses[a.i]++;
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
    console.log(`\n=== ${mname} ${cls}: Median Ebene ${finalF[N >> 1]}, Siege ${wins}/${N}, Big hits(>=50%maxHP) ${bigHits}, One-shots from full ${oneShots}`);
    console.log(`Gold verdient ${(goldTotal/N).toFixed(0)}/Lauf, ausgegeben ${(goldSpent/N).toFixed(0)}, Tränke gekauft ${(potBought/N).toFixed(1)}, gefunden ${(potFound/N).toFixed(1)}, Bomben gekauft ${(bombBought/N).toFixed(1)}, Gold übrig bei Sieg ${wins ? (goldLeft/wins).toFixed(0) : '-'}, Tode mit Boss in Sicht ${bossDeaths}`);
    console.log('Eb  n  Tod  Züge  HPverl  Tränke Kills  Gold  Lvl  Atk  MaxHP  maxHit  medHit');
    for (const f of Object.keys(fl).map(Number).sort((a, b) => a - b)) {
      const x = fl[f]; const d = x.dmgTaken.sort((a,b)=>a-b);
      console.log(`${String(f).padStart(2)} ${String(x.n).padStart(3)} ${String(x.deaths).padStart(3)} ${(x.turns / x.n).toFixed(0).padStart(5)} ${(x.hpLost / x.n).toFixed(0).padStart(6)} ${(x.potUsed / x.n).toFixed(2).padStart(6)} ${(x.kills / x.n).toFixed(1).padStart(5)} ${(x.goldIn / x.n).toFixed(0).padStart(5)} ${(x.lvlIn / x.n).toFixed(1).padStart(4)} ${(x.atkIn / x.n).toFixed(1).padStart(4)} ${(x.maxHpIn / x.n).toFixed(0).padStart(5)} ${String(d[d.length - 1] ?? 0).padStart(6)} ${String(d[d.length>>1]??0).padStart(6)}`);
    }
    const avg = (x: number[]) => x.length ? (x.reduce((q, w) => q + w, 0) / x.length).toFixed(1) : '-';
    summary.push(`${mname} ${cls.padEnd(11)} Siege ${String(wins).padStart(2)}/${N}  Median ${String(finalF[N >> 1]).padStart(2)}  Seelen/Lauf ${(souls / N).toFixed(0)}  Gaben ${(gaben / N).toFixed(1)}  Ränge ${(ranks / N).toFixed(1)}  Stufe RangII ${avg(rankLvl[0])} RangIII ${avg(rankLvl[1])}  Restpunkt ${ptsAll ? (100 * rest / ptsAll).toFixed(0) : 0} %  Fähigkeiten/Lauf ${uses.map(u => (u / N).toFixed(1)).join(' / ')}  Ressource vor Tod ${avg(resEnd)}`);
    console.log('Tod durch:', JSON.stringify(Object.entries(killers).sort((a,b)=>b[1]-a[1]).slice(0,8)));
  }
}
console.log(`\n=== Zusammenfassung (SEEDS=${SET}, BUILD=${(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BUILD ?? 'heur'}) ===`);
for (const l of summary) console.log(l);
console.log('\nKnoten (Anteil der Läufe):');
for (const [k, f] of Object.entries(nodeFreq)) console.log(k.padEnd(16), Object.entries(f).sort().map(([id, n]) => `${id} ${(100 * n / N).toFixed(0)}%`).join('  '));
void MOBS; void playerAtk;
