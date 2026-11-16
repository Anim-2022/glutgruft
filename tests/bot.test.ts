import { describe, it, expect } from 'vitest';
import { defaultMeta } from '../src/core/save';
import { newRun } from '../src/game/run';
import { CLASS_ORDER } from '../src/game/content';
import { botRun } from './bot';

describe('bot', () => {
  it('spielt Läufe ohne Absturz und kommt voran', () => {
    const N = 10;
    for (const meta of [defaultMeta(), { ...defaultMeta(), upg: { vit: 5, atk: 2, trank: 3 } }]) {
      for (const cls of CLASS_ORDER) {
        const floors: number[] = [];
        let wins = 0, stuck = 0;
        for (let seed = 1; seed <= N; seed++) {
          const run = botRun(newRun(seed * 7919, cls, meta));
          floors.push(run.floor);
          if (run.mode === 'win') wins++;
          if (run.mode !== 'win' && run.mode !== 'dead') { stuck++; if (stuck === 1) console.log('HÄNGT', cls, seed, run.floor, run.turn, run.mobs.length, run.log.slice(-3), JSON.stringify({ p: [run.p.x, run.p.y, run.p.hp, run.p.res], vis: run.mobs.filter(m => run.vis[m.y * 52 + m.x]).map(m => [m.kind, m.x, m.y, m.awake]), fire: run.fire.size })); }
        }
        floors.sort((a, b) => a - b);
        const hist = [1, 3, 5, 6, 10, 11, 15].map(f => `>=${f}:${floors.filter(x => x >= f).length}`).join(' ');
        console.log(`${meta.upg.vit ? 'max ' : 'neu '}${cls.padEnd(12)} median ${floors[N >> 1]}  ${hist}  Siege ${wins}  hängt ${stuck}`);
        expect(stuck).toBe(0);
        expect(floors[N >> 1]).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
