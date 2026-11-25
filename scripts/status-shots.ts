// Screenshots of the status bar (effects, buffs, passives) and its hover tooltips.
//
//   node scripts/status-shots.ts [output folder]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'docs/status'; mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e: Error) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);
const box = (await page.locator('canvas').boundingBox())!;
// internal 640x360 point -> page position
const at = (x: number, y: number) => page.mouse.move(box.x + (x + 0.5) * box.width / 640, box.y + (y + 0.5) * box.height / 360);

type Setup = { name: string; cls: string; many?: boolean; hint?: boolean; hover?: [number, number][] };
const SHOTS: Setup[] = [
  { name: 'krieger', cls: 'krieger', hover: [[0, 0], [4, 0], [2, 1]] },
  { name: 'waldlaeufer-many', cls: 'waldlaeufer', many: true, hover: [[15, 1]] },
  { name: 'magier', cls: 'magier', hover: [[1, 0]] },
  // floor-1 hint panel in the centre: the passive row stops left of it
  { name: 'hint', cls: 'krieger', many: true, hint: true, hover: [[9, 1]] },
];
for (const s of SHOTS) {
  await page.evaluate(async ({ cls, many, hint }) => {
    const draw = await import(/* @vite-ignore */ '/src/render/draw.ts');
    draw.setTutorial(!!hint); draw.setTutStep(null);
    const g = (window as any).__g, r = g.start(4242, cls), p = r.p;
    r.mobs = r.mobs.filter((m: any) => Math.abs(m.x - p.x) + Math.abs(m.y - p.y) > 12);
    for (let i = 0; i < (hint ? 5 : 1); i++) g.act({ t: 'wait' });
    p.st.gift = 4; p.st.brand = 2; p.st.netz = 1;
    if (cls === 'krieger') { p.st.stark = 9; p.st.wall = 9; p.st.dodge = 1; p.st.konter = 1; p.perks.push('vampir', 'vampir', 'dornen', 'panzer'); p.syn.push('stachel'); p.relics.push('steinhaut', 'eisenwille'); }
    if (cls === 'magier') { p.st.riss = 3; p.st.eis = 2; p.st.schild = 4; p.shield = 9; p.st.nachhall = 1; p.perks.push('meister', 'quelle'); p.relics.push('glutherz'); }
    if (cls === 'waldlaeufer') { p.st.aim = 3; p.st.rauch = 4; p.st.rx = p.x; p.st.ry = p.y; p.st.schatten = 1; }
    if (many) { p.perks.push('vampir', 'dornen', 'flink', 'krit', 'gier', 'pilz', 'henker', 'seelen', 'weitblick', 'atem', 'riese', 'giftklinge'); p.relics.push('giftzahn', 'zeitsand', 'muenze', 'echo', 'jaeger'); p.syn.push('konter', 'midas'); }
    p.gear[3] = { slot: 3, name: 'Blood Ring', rar: 3, atk: 0, def: 0, hp: 0, crit: 0, aff: [['vamp', 3], ['boss', 30]] };
  }, s);
  await page.waitForTimeout(700);
  await at(-10, -10);
  await page.mouse.move(box.x + 2, box.y + box.height - 2);
  await page.waitForTimeout(100);
  await page.locator('canvas').screenshot({ path: `${OUT}/status-${s.name}.png` });
  for (const [k, [col, row]] of (s.hover ?? []).entries()) {
    await at(3 + col * 12 + 5, 23 + row * 12 + 5);
    await page.waitForTimeout(120);
    await page.locator('canvas').screenshot({ path: `${OUT}/status-${s.name}-hover${k}.png` });
  }
  console.log('shot', s.name);
}
await browser.close(); await server.close();
