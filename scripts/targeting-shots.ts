// Aiming at objects: a ranger cycles targets with Tab (enemy first, then the barrel), shoots the barrel, it explodes.
//
//   node scripts/targeting-shots.ts [outdir]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'docs/targeting'; mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e: Error) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);
// a ranger with four free floor tiles to the right; a barrel at distance 4 and a sleeping skeleton beside it
const info = await page.evaluate(() => {
  const g = (window as any).__g, W = 64, FLOOR = 1, BARREL = 8;
  for (let s = 1; s < 500; s++) {
    const r = g.start(s, 'waldlaeufer'), p = r.p;
    const free = (x: number, y: number) => r.tiles[y * W + x] === FLOOR;
    if (![1, 2, 3, 4, 5].every(k => free(p.x + k, p.y)) || !free(p.x + 4, p.y + 1) || !free(p.x + 5, p.y + 1)) continue;
    r.tiles[p.y * W + p.x + 4] = BARREL;
    const m = r.mobs.find((q: any) => !q.boss && !q.elite);
    r.mobs = [m];
    m.x = p.x + 5; m.y = p.y + 1; m.awake = false;
    g.act({ t: 'wait' }); // recompute sight
    return { seed: s, x: p.x, y: p.y, mob: m.name };
  }
  return null;
});
console.log('scene', JSON.stringify(info));
await page.waitForTimeout(800);
const shot = (name: string) => page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });
const key = async (k: string, wait = 400) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
await key('Tab');
await shot('target-1-enemy');
await key('Tab');
console.log('tgt', await page.evaluate(() => (window as any).__g.run.tgt));
await shot('target-2-barrel');
await key('f', 250);
await shot('target-3-shot');
console.log('fuses', await page.evaluate(() => [...(window as any).__g.run.fuses]));
await key(' ', 500);
await key(' ', 120);
await shot('target-4-boom');
await page.waitForTimeout(600);
await shot('target-5-after');
console.log('tgt after', await page.evaluate(() => (window as any).__g.run.tgt));
await browser.close(); await server.close();
