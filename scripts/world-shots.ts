// Screenshots of busy rooms (objects + decor) per biome and of a puzzle chamber, for checking placement.
//
//   node scripts/world-shots.ts [outdir]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'docs/world'; mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5201, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e: Error) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);
// floor 1, 6, 11: the three biomes. The hero stands where most objects are in view.
for (const [floor, seed] of [[1, 3], [1, 8], [6, 5], [6, 9], [11, 4], [11, 12]]) {
  const info = await page.evaluate(([floor, seed]) => {
    const g = (window as any).__g, W = 64, H = 40;
    g.start(seed, 'krieger'); g.goto(floor);
    const r = g.run; r.mobs = [];
    r.seen.fill(1);
    let best = -1, bi = 0;
    for (let y = 6; y < H - 6; y++) for (let x = 10; x < W - 10; x++) {
      if (r.tiles[y * W + x] !== 1) continue;
      let n = 0;
      for (let oy = -5; oy <= 5; oy++) for (let ox = -9; ox <= 9; ox++) { const t = r.tiles[(y + oy) * W + x + ox]; if (t === 34 || t === 36 || t === 8 || t === 3) n++; }
      if (n > best) { best = n; bi = y * W + x; }
    }
    r.p.x = bi % W; r.p.y = (bi / W) | 0;
    return { floor, seed, n: best };
  }, [floor, seed]);
  await page.waitForTimeout(600);
  await page.locator('canvas').screenshot({ path: `${OUT}/room-f${floor}-s${seed}.png` });
  console.log(JSON.stringify(info));
}
// puzzle chamber: no decor inside
for (const kind of ['arena', 'runes']) {
  await page.evaluate((kind) => {
    const g = (window as any).__g;
    let r: any;
    for (let s = 1; s < 3000; s++) { r = g.start(s, 'krieger'); if (r.puzzle?.kind === kind) break; }
    const z = r.puzzle; r.mobs = []; r.seen.fill(1);
    r.p.x = z.x + 3; r.p.y = z.y + 8;
  }, kind);
  await page.waitForTimeout(600);
  await page.locator('canvas').screenshot({ path: `${OUT}/vault-${kind}.png` });
}
await browser.close(); await server.close();
