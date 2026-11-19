// Bildschirmfotos aller Rätselkammern (eine je Art), für Abnahme und Doku.
//
//   node scripts/vault-shots.ts [ausgabeordner]   KINDS=ice,darts  NOHOVER=1 (ohne Tooltip)
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'docs/vaults'; mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);
for (const kind of (process.env.KINDS ?? 'crates,runes,ice,arena,braziers,darts').split(',')) {
  const info = await page.evaluate((kind) => {
    const g = (window as any).__g;
    let r: any;
    for (let s = 1; s < 3000; s++) { r = g.start(s, 'krieger'); if (r.puzzle?.kind === kind) break; }
    const z = r.puzzle;
    r.mobs = r.mobs.filter((m: any) => Math.abs(m.x - z.x - 3) + Math.abs(m.y - z.y - 3) > 14);
    r.p.x = z.x + 3; r.p.y = z.y + 7;
    for (let y = z.y - 1; y <= z.y + 8; y++) for (let x = z.x - 1; x <= z.x + 7; x++) r.seen[y * 64 + x] = 1;
    if (kind === 'runes') z.read = true;
    g.act({ t: 'move', dx: 0, dy: -1 });
    if (kind === 'arena') { g.act({ t: 'move', dx: 0, dy: -1 }); g.act({ t: 'move', dx: 0, dy: -1 }); }
    if (kind === 'darts') g.act({ t: 'wait' });
    return { seed: r.seed, x: z.x, y: z.y, px: r.p.x, py: r.p.y };
  }, kind);
  await page.waitForTimeout(900);
  // Tooltip über einem Kammerfeld
  const box = (await page.locator('canvas').boundingBox())!;
  if (!process.env.NOHOVER) await page.mouse.move(box.x + box.width / 2 + 2 * box.width / 640 * 16 * 1, box.y + box.height / 2 - box.height / 360 * 16 * 2);
  await page.waitForTimeout(200);
  await page.locator('canvas').screenshot({ path: `${OUT}/vault-${kind}.png` });
  console.log(kind, JSON.stringify(info));
}
await browser.close(); await server.close();
