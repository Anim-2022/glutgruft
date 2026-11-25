// Frames of an ice slide (hero slides tile by tile), for checking the animation.
//
//   node scripts/ice-slide-shots.ts [outdir]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'docs/ice-slide'; mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e: Error) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);
// ice chamber with a long horizontal slide; the hero stands at its start
const info = await page.evaluate(() => {
  const g = (window as any).__g, ICE = (() => { for (let s = 1; s < 3000; s++) { const r = g.start(s, 'krieger'); if (r.puzzle?.kind === 'ice') return r; } })();
  const r = ICE, z = r.puzzle;
  r.mobs = r.mobs.filter((m: any) => Math.abs(m.x - z.x - 3) + Math.abs(m.y - z.y - 3) > 14);
  for (let y = z.y - 1; y <= z.y + 8; y++) for (let x = z.x - 1; x <= z.x + 8; x++) r.seen[y * 64 + x] = 1;
  let best: any = null;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) for (const dx of [1, -1]) {
    let n = 0, cx = z.x + x, cy = z.y + y, t0 = r.tiles[cy * 64 + cx];
    while (r.tiles[cy * 64 + cx + dx * (n + 1)] === t0) n++;
    if (n >= 3 && (!best || n > best.n)) best = { x: cx, y: cy, dx, n, t: t0 };
  }
  r.p.x = best.x; r.p.y = best.y;
  return best;
});
console.log('slide', JSON.stringify(info));
await page.waitForTimeout(700);
const shot = (name: string) => page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });
await shot('slide-0-start');
// record every frame in the page (screenshots are too slow for 50 ms per tile) and lay them out as a contact sheet
const sheet = await page.evaluate(async (key: string) => {
  const g = (window as any).__g, cv = document.querySelector('canvas') as HTMLCanvasElement;
  const frames: { img: ImageBitmap; busy: boolean; t: number }[] = [];
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key }));
  const t0 = performance.now();
  await new Promise<void>(done => {
    const tick = async () => {
      frames.push({ img: await createImageBitmap(cv), busy: g.busy(), t: performance.now() - t0 });
      if (performance.now() - t0 < 520) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  const pick = frames.filter((_, i) => i % 2 === 0).slice(0, 16), cw = 320, ch = 180, cols = 4;
  const out = document.createElement('canvas'); out.width = cw * cols; out.height = ch * Math.ceil(pick.length / cols);
  const c = out.getContext('2d')!; c.imageSmoothingEnabled = false; c.font = '12px monospace';
  pick.forEach((f, i) => {
    const x = (i % cols) * cw, y = ((i / cols) | 0) * ch;
    c.drawImage(f.img, cv.width * 3 / 8, cv.height * 3 / 8, cv.width / 4, cv.height / 4, x, y, cw, ch);
    c.fillStyle = '#000'; c.fillRect(x, y, 120, 16); c.fillStyle = f.busy ? '#ffcd75' : '#a7f070';
    c.fillText(`${f.t.toFixed(0)} ms ${f.busy ? 'busy' : 'free'}`, x + 3, y + 12);
  });
  return { url: out.toDataURL('image/png'), n: frames.length, freeAt: frames.find(f => !f.busy)?.t };
}, info.dx > 0 ? 'ArrowRight' : 'ArrowLeft');
const { writeFileSync } = await import('node:fs');
writeFileSync(`${OUT}/slide-frames.png`, Buffer.from(sheet.url.split(',')[1], 'base64'));
console.log(`frames ${sheet.n}, input free after ${sheet.freeAt?.toFixed(0)} ms (expected ~${info.n * 50 + 90} ms)`);
await page.waitForTimeout(300);
await shot('slide-9-end');
await browser.close(); await server.close();
