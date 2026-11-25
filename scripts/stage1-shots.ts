// Screenshots for the stage 1 quick fixes: cursed chest (closed/open), hunter countdown,
// rune circle (3×3 floor pattern), crit flash on the hit enemy only.
//
//   node scripts/stage1-shots.ts [output folder]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'docs/stage1'; mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e: Error) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);
const shot = (name: string) => page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });

// cursed chest next to a normal chest, before and after opening, with the hunter countdown running
await page.evaluate(() => {
  const g = (window as any).__g; g.start(7, 'krieger');
  const r = g.run, W = 64;
  r.mobs = []; r.evQ = [];
  for (let y = r.p.y - 3; y <= r.p.y + 3; y++) for (let x = r.p.x - 5; x <= r.p.x + 5; x++) { r.tiles[y * W + x] = 1; r.seen[y * W + x] = 1; }
  r.tiles[r.p.y * W + r.p.x + 1] = 23; // cursed
  r.tiles[r.p.y * W + r.p.x - 1] = 3; // chest
  r.tiles[(r.p.y - 2) * W + r.p.x + 2] = 23;
  r.floorTurns = 700; r.hunt = { next: 730, n: 1 };
});
await page.waitForTimeout(800);
await shot('chest-closed');
await page.evaluate(() => { const g = (window as any).__g; g.act({ t: 'move', dx: 1, dy: 0 }); g.act({ t: 'move', dx: -1, dy: 0 }); });
await page.waitForTimeout(1200);
console.log('tiles after open:', await page.evaluate(() => { const r = (window as any).__g.run; return [r.tiles[r.p.y * 64 + r.p.x + 1], r.tiles[r.p.y * 64 + r.p.x - 1]]; }));
await shot('chest-open-hunter');

// rune circle: find one on a crypt floor and stand next to it
const found = await page.evaluate(async () => {
  const g = (window as any).__g, { propsFor, propSpan } = await import('/src/render/props.ts');
  for (let seed = 1; seed < 80; seed++) {
    g.start(seed, 'magier');
    const r = g.run, W = 64, map = propsFor(r.tiles, r.seed + r.floor);
    const i = map.findIndex((p: any) => p && p.kind === 'flat' && propSpan(0, p) === 3);
    if (i < 0) continue;
    r.mobs = []; r.evQ = []; r.hunt = null;
    r.p.x = i % W; r.p.y = ((i / W) | 0) + 2;
    for (let k = 0; k < r.seen.length; k++) r.seen[k] = 1;
    g.act({ t: 'wait' });
    return seed;
  }
  return -1;
});
console.log('rune circle seed', found);
await page.waitForTimeout(1500);
await shot('rune-circle');

// crit: an enemy next to the hero takes a critical hit
await page.evaluate(() => {
  const g = (window as any).__g; g.start(3, 'krieger');
  const r = g.run, W = 64;
  for (let y = r.p.y - 3; y <= r.p.y + 3; y++) for (let x = r.p.x - 5; x <= r.p.x + 5; x++) { r.tiles[y * W + x] = 1; r.seen[y * W + x] = 1; }
  const base = r.mobs[0];
  r.mobs = [{ ...base, id: 950, kind: 'skelett', x: r.p.x + 1, y: r.p.y, hp: 99, maxHp: 99, awake: true, st: { stun: 9 } }];
  r.evQ = [];
});
await page.waitForTimeout(800);
await page.evaluate(() => { const r = (window as any).__g.run; r.fx.push({ k: 'num', x: r.p.x + 1, y: r.p.y, s: '24!', col: '#ffcd75' }); });
await page.waitForTimeout(40);
await shot('crit-0');
await page.waitForTimeout(60);
await shot('crit-1');
await browser.close(); await server.close();
