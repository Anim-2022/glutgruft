// Corpse variants by cause of death (to-do #6): a gallery of enemy kinds × causes and an in-game shot.
//
//   npx vite-node scripts/corpse-shots.ts [out]   (default: docs/corpses)
//
// Writes corpses-1x.png, corpses-2x.png, corpses-4x.png (gallery), variants-2x.png (the four variants
// per cause for a few kinds) and ingame.png / ingame-fresh.png (a fight after several kills).
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] ?? 'docs/corpses';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e: Error) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('glutgruft.v1', JSON.stringify({ tutOff: true, best: 1 })));
await page.goto(server.resolvedUrls!.local[0]);
await page.waitForFunction(() => (window as any).__g);

const save = (name: string, url: string) => { const f = `${out}/${name}`; writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log(f); };

// Gallery: one row per kind, the living sprite first, then one column per cause
const shots: Record<string, string> = await page.evaluate(async () => {
  const g = (window as any).__g;
  // (a plain import() here would be rewritten by vite-node; the page imports from the dev server itself)
  const imp = new Function('u', 'return import(u)') as (u: string) => Promise<any>;
  const C = await imp('/src/render/corpses.ts');
  const { DEATH_CAUSES } = await imp('/src/game/run.ts');
  const kinds = ['ratte', 'skelett', 'schuetze', 'fledermaus', 'sporling', 'golem', 'glutgeist', 'goblin', 'dieb', 'mimik', 'rivale_k', 'schatten_m', 'schlange', 'koenig', 'mutter', 'fuerst', 'echse', 'drache', 'tod'];
  const src = (k: string) => g.sprites[g.sprites[`${k}2:f0`] && ['koenig', 'mutter', 'fuerst'].includes(k) ? `${k}2:f0` : `${k}:f0`];
  const sheet = (rows: [string, string, number, boolean][][], cw: number, ch: number, labels: string[], rowLabels: string[], k: number) => {
    const lw = 64, th = 12;
    const c = document.createElement('canvas'); c.width = (lw + rows[0].length * cw) * k; c.height = (th + rows.length * ch) * k;
    const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
    x.fillStyle = '#14172a'; x.fillRect(0, 0, c.width, c.height);
    x.font = `${8 * k}px monospace`; x.fillStyle = '#c9d4dc'; x.textBaseline = 'top';
    labels.forEach((l, i) => x.fillText(l, (lw + i * cw + 2) * k, 2 * k));
    rows.forEach((row, ry) => {
      x.fillStyle = '#c9d4dc'; x.fillText(rowLabels[ry], 2 * k, (th + ry * ch + ch / 2 - 4) * k);
      row.forEach(([kind, cause, v, alive], i) => {
        const X = lw + i * cw, Y = th + ry * ch;
        x.fillStyle = ['#343a5c', '#22443f', '#40262b'][ry % 3]; x.fillRect((X + 1) * k, (Y + 1) * k, (cw - 2) * k, (ch - 2) * k);
        const img = alive ? src(kind) : C.corpseCanvas(src(kind), kind, cause, v, false, true);
        if (!img) return;
        x.drawImage(img, (X + ((cw - img.width) >> 1)) * k, (Y + ch - 3 - img.height) * k, img.width * k, img.height * k);
      });
    });
    return c.toDataURL('image/png');
  };
  const rows = kinds.map(kind => [[kind, '', 0, true] as [string, string, number, boolean], ...DEATH_CAUSES.map((c: string) => [kind, c, 0, false] as [string, string, number, boolean])]);
  const labels = ['alive', ...DEATH_CAUSES];
  const res: Record<string, string> = {};
  for (const k of [1, 2, 4]) res[`corpses-${k}x.png`] = sheet(rows, 44, 40, labels, kinds, k);
  const vk = ['ratte', 'skelett', 'golem', 'glutgeist', 'sporling'];
  const vrows: [string, string, number, boolean][][] = [];
  const vlab: string[] = [];
  for (const kind of vk) for (let v = 0; v < 4; v++) { vrows.push(DEATH_CAUSES.map((c: string) => [kind, c, v, false])); vlab.push(`${kind} v${v}`); }
  res['variants-2x.png'] = sheet(vrows, 40, 32, DEATH_CAUSES, vlab, 2);
  return res;
});
for (const [n, u] of Object.entries(shots)) save(n, u);

// In-game: a row of enemies around the hero, killed by different causes (one by a real melee hit)
await page.evaluate(() => {
  const g = (window as any).__g;
  const r = g.start(5, 'krieger');
  r.mobs = [];
  const p = r.p;
  for (let y = p.y - 5; y <= p.y + 5; y++) for (let x = p.x - 8; x <= p.x + 8; x++) { r.tiles[y * 64 + x] = 1; r.seen[y * 64 + x] = 1; }
  const kinds = ['ratte', 'skelett', 'golem', 'sporling', 'glutgeist', 'schuetze', 'fledermaus', 'goblin'];
  const causes = ['slash', 'arrow', 'fire', 'frost', 'magic', 'blast', 'poison', 'crush'];
  let k = 0;
  for (const [dx, dy] of [[-4, -2], [-2, -2], [0, -2], [2, -2], [4, -2], [-4, 2], [-2, 2], [0, 2], [2, 2], [4, 2], [-6, 0], [6, 0], [-4, 0], [4, 0], [-6, -2], [6, 2]]) {
    const kind = kinds[k % kinds.length], cause = causes[k % causes.length];
    r.fx.push({ k: 'die', x: p.x + dx, y: p.y + dy, kind, cause });
    k++;
  }
  // a real kill through the game logic
  r.mobs.push({ id: 999, kind: 'ratte', name: 'Crypt Rat', x: p.x + 1, y: p.y, hp: 1, maxHp: 1, atk: 0, def: 0, st: {}, xp: 1, cd: 0, awake: true });
  g.act({ t: 'move', dx: 1, dy: 0 });
});
await page.waitForTimeout(1200);
await page.locator('canvas').screenshot({ path: `${out}/ingame-fresh.png` });
await page.waitForTimeout(3500);
await page.locator('canvas').screenshot({ path: `${out}/ingame.png` });
console.log(`${out}/ingame.png`);
await browser.close();
await server.close();
