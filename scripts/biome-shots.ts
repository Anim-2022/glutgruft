// Bildschirmfotos der Gebietsereignisse (Phase 4).
//
//   node scripts/biome-shots.ts [ausgabeordner]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'docs/events/biome'; mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);
const shot = (name: string) => page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });

// Startet ein Ereignis: Raumereignisse im größten Raum, Ruheereignisse sofort
const scene = (seed: number, cls: string, floor: number, id: string) => page.evaluate(([seed, cls, floor, id]) => {
  const g = (window as any).__g; g.start(seed, cls); g.goto(floor);
  const r = g.run, W = 64, rooms = r.evRooms;
  r.p.hp = r.p.maxHp; r.p.gold = Math.max(r.p.gold, 60);
  const room = ['hinterhalt', 'fallenkammer', 'zwilling', 'einsturz', 'tote', 'glocke', 'parade', 'ratten', 'koloss', 'sarkophag', 'pilzring', 'schlamm', 'riesenpilz', 'brutnest', 'lavariss', 'esse', 'golem', 'amboss', 'ofen'].includes(id);
  if (room) {
    let k = 1;
    for (let i = 1; i < rooms.length - 1; i++) if (rooms[i].w * rooms[i].h > rooms[k].w * rooms[k].h) k = i;
    const q = rooms[k];
    r.mobs = r.mobs.filter((m: any) => !(m.x >= q.x - 2 && m.x <= q.x + q.w + 1 && m.y >= q.y - 2 && m.y <= q.y + q.h + 1));
    r.p.x = q.x + (q.w >> 1); r.p.y = q.y + (q.h >> 1); r.tiles[r.p.y * W + r.p.x] = 1;
    r.evQ = [{ id, room: k }];
  } else { r.mobs = []; r.evQ = [{ id }]; r.evCalm = 60; }
  g.act({ t: 'wait' });
  return [r.ev?.id, r.log.slice(-2)];
}, [seed, cls, floor, id] as [number, string, number, string]);

for (const [seed, cls, floor, id] of [
  [11, 'krieger', 3, 'parade'], [5, 'magier', 2, 'kerzen'], [12, 'waldlaeufer', 4, 'rivale'],
  [7, 'krieger', 7, 'pilzring'], [8, 'magier', 8, 'schlamm'], [9, 'waldlaeufer', 7, 'brutnest'],
  [13, 'krieger', 12, 'amboss'], [14, 'magier', 13, 'lavariss'], [15, 'waldlaeufer', 12, 'glutader'],
] as [number, string, number, string][]) {
  console.log(await scene(seed, cls, floor, id));
  await page.waitForTimeout(3600);
  await shot(id);
}
await browser.close(); await server.close();
