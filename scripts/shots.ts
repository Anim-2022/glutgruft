// Bildschirmfotos je Biom für den Vorher/Nachher-Vergleich.
//
//   node scripts/shots.ts [ausgabeordner]   (Standard: docs/shots)
//
// Startet Vite, öffnet das Spiel in Chromium, steigt mit __g.goto() auf die gewünschte Ebene
// und speichert ein Bild je (Ebene, Seed). Zusätzlich wird die Bildrate gemessen.
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'docs/shots';
mkdirSync(out, { recursive: true });
const SHOTS: [number, number, string][] = [
  [1, 11, 'krieger'], [3, 23, 'magier'], [5, 11, 'krieger'],
  [6, 11, 'waldlaeufer'], [8, 23, 'krieger'], [10, 11, 'magier'],
  [11, 11, 'krieger'], [13, 23, 'waldlaeufer'], [15, 11, 'krieger'],
];

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls!.local[0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(url);
await page.waitForFunction(() => (window as any).__g);
for (const [floor, seed, cls] of SHOTS) {
  await page.evaluate(([f, s, c]) => { const g = (window as any).__g; g.start(s, c); g.goto(f); }, [floor, seed, cls] as const);
  await page.waitForTimeout(700);
  const fps = await page.evaluate(() => new Promise<number>(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(n); };
    requestAnimationFrame(tick);
  }));
  const file = `${out}/ebene${String(floor).padStart(2, '0')}-s${seed}.png`;
  await page.locator('canvas').screenshot({ path: file });
  console.log(file, `${fps} fps`);
}
await browser.close();
await server.close();
