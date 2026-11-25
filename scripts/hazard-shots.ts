// Bildschirmfotos der Bodenfallen und des Mimiks (Phase 2).
//
//   node scripts/hazard-shots.ts [ausgabeordner]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'docs/hazards'; mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5196, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);
const box = (await page.locator('canvas').boundingBox())!;
// Maus auf ein Feld relativ zum Helden (Kamera folgt dem Helden, Held ~ Bildmitte)
const hover = async (dx: number, dy: number) => {
  // Mitte des Heldenfelds liegt etwa 8 Pixel über der Bildmitte
  await page.mouse.move(box.x + box.width / 2 + dx * 16 * box.width / 640, box.y + box.height / 2 + (dy * 16 - 8) * box.height / 360);
  await page.waitForTimeout(250);
};
// Szene: Ebene 3, freie Fläche um den Helden, vier entdeckte Fallen
await page.evaluate(() => {
  const g = (window as any).__g; g.start(21, 'waldlaeufer'); g.goto(7);
  const r = g.run, W = 64; r.mobs = [];
  for (let y = r.p.y - 3; y <= r.p.y + 3; y++) for (let x = r.p.x - 5; x <= r.p.x + 5; x++) { r.tiles[y * W + x] = 1; r.seen[y * W + x] = 1; }
  const k = ['stachel', 'pfeil', 'gas', 'glut'];
  r.hazards = k.map((kind, i) => ({ x: r.p.x - 3 + i * 2, y: r.p.y - 2, kind, seen: true }));
  r.hazards.push({ x: r.p.x + 4, y: r.p.y + 1, kind: 'stachel', seen: false });
  r.tiles[(r.p.y + 1) * W + r.p.x - 3] = 31; // Mimik (sieht aus wie eine Truhe)
  r.tiles[(r.p.y + 1) * W + r.p.x - 1] = 3;  // echte Truhe zum Vergleich
  g.act({ t: 'wait' });
});
await page.waitForTimeout(1500);
await hover(-3, -2);
await hover(-3, -2);
await page.locator('canvas').screenshot({ path: `${OUT}/fallen.png` });
// Spieler tritt auf die Stachelfalle
console.log('Falle', await page.evaluate(() => { const g = (window as any).__g, r = g.run; r.p.x -= 3; r.p.y -= 1; const hp = r.p.hp; g.act({ t: 'move', dx: 0, dy: -1 }); return [hp, r.p.hp, r.floor, r.log.slice(-2)]; }));
await page.waitForTimeout(250);
await page.mouse.move(box.x + 5, box.y + 5);
await page.locator('canvas').screenshot({ path: `${OUT}/falle-ausgeloest.png` });
// Mimik anstoßen
console.log('Mimic', await page.evaluate(() => { const g = (window as any).__g, r = g.run; r.p.hp = r.p.maxHp; r.p.y += 2; g.act({ t: 'move', dx: 0, dy: 1 }); return [r.p.hp, r.mobs.map((m: any) => m.kind), r.log.slice(-2)]; }));
await page.waitForTimeout(350);
await page.locator('canvas').screenshot({ path: `${OUT}/mimik.png` });
await browser.close(); await server.close();
