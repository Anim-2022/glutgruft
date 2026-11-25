// Props gallery: every decoration of each biome (wall, foot of wall, flat), 4× scaled.
//
//   npx vite-node scripts/gallery.ts [out]   (default: docs/props)
//
// Starts Vite, opens the game in Chromium and saves galerie-<biome>.png via __g.propGallery().
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] ?? 'docs/props';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);
for (const [bi, name] of [[0, 'crypt'], [1, 'cave'], [2, 'forge']] as const) {
  const url: string = await page.evaluate(b => (window as any).__g.propGallery(b), bi);
  const file = `${out}/galerie-${name}.png`;
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log(file);
}
await browser.close();
await server.close();
