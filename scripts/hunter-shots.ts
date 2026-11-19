// Bildschirmfotos der Jäger.
//
//   node scripts/hunter-shots.ts [ausgabeordner]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'docs/hunters'; mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);
const shot = (name: string) => page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });

// Ebene mit freier Fläche um den Helden; ein Jäger in der Nähe
const scene = (seed: number, cls: string, floor: number, kind: string, dx: number, turns: number) => page.evaluate(([seed, cls, floor, kind, dx, turns]) => {
  const g = (window as any).__g; g.start(seed, cls); g.goto(floor);
  const r = g.run, W = 64;
  r.mobs = []; r.evQ = []; r.p.hp = r.p.maxHp = 300;
  for (let y = r.p.y - 3; y <= r.p.y + 3; y++) for (let x = r.p.x - 6; x <= r.p.x + 6; x++) { r.tiles[y * W + x] = 1; r.seen[y * W + x] = 1; }
  r.floorTurns = 700; r.hunt = { next: 730, n: 1 };
  const d = { echse: [22, 5, 2, 16], krake: [24, 6, 1, 18], drache: [34, 7, 3, 28], medusa: [24, 5, 2, 22], tod: [40, 5, 3, 36] }[kind]!;
  r.mobs.push({ id: 900, kind, name: { echse: 'Riesenechse', krake: 'Landkrake', drache: 'Drache', medusa: 'Medusa', tod: 'Der Tod' }[kind], x: r.p.x + dx, y: r.p.y, hp: d[0] * 3, maxHp: d[0] * 3, atk: 0, def: d[2], st: {}, xp: d[3], cd: 0, awake: true });
  for (let k = 0; k < turns; k++) g.act({ t: 'wait' });
  return [r.mobs.map((m: any) => [m.kind, m.x - r.p.x, m.st]), r.log.slice(-2)];
}, [seed, cls, floor, kind, dx, turns] as [number, string, number, string, number, number]);

// Banner beim Erscheinen
console.log(await page.evaluate(() => {
  const g = (window as any).__g; g.start(21, 'krieger'); g.goto(7);
  const r = g.run; r.mobs = []; r.evQ = []; r.floorTurns = 559; r.hunt = { next: 560, n: 0 };
  g.act({ t: 'wait' });
  return r.log.slice(-2);
}));
await page.waitForTimeout(700);
await shot('jaeger-banner');
console.log(await scene(5, 'magier', 12, 'tod', 2, 1));
await page.waitForTimeout(3300);
await shot('tod-sense');
console.log(await scene(8, 'waldlaeufer', 9, 'drache', 3, 1));
await page.waitForTimeout(3300);
await shot('drache-atem');
console.log(await scene(9, 'krieger', 6, 'krake', 3, 1));
await page.waitForTimeout(3300);
await shot('krake-tentakel');
await browser.close(); await server.close();
