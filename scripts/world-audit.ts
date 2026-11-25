// Audit of world placement over many floors: objects touching, objects at doorways,
// decor inside puzzle chambers or next to objects, repeated decor nearby.
//
//   npx vite-node scripts/world-audit.ts [runs]
import { newRun, act, Run } from '../src/game/run';
import { defaultMeta } from '../src/core/save';
import { W, H, T, walkable, wallLike } from '../src/game/dungeon';
import { biomeOf } from '../src/game/content';
import { VS } from '../src/game/puzzles';
import * as P from '../src/render/props';

const OBJ = new Set<number>([T.POT, T.SPORE, T.BARREL, T.CHEST, T.CURSED, T.MIMIC, T.ALTAR, T.TRADER, T.FOUNTAIN, T.TABLET, T.CRATE]);
const runs = Number(process.argv[2] ?? 40);
const types: Record<string, number> = {};
const c = { floors: 0, pairsNear: 0, samePick: 0, objects: 0, objTouch: 0, objDoor: 0, props: 0, propVault: 0, propNextObj: 0, dupFam: 0, torchVault: 0 };
const doorway = (t: Uint8Array, i: number) => walkable(t[i]) && ((wallLike(t[i - 1]) && wallLike(t[i + 1]) && walkable(t[i - W]) && walkable(t[i + W])) || (wallLike(t[i - W]) && wallLike(t[i + W]) && walkable(t[i - 1]) && walkable(t[i + 1])));
function audit(r: Run) {
  const t = r.tiles, z = r.puzzle, bi = biomeOf(r.floor);
  const inZ = (x: number, y: number) => !!z && x >= z.x - 1 && x <= z.x + VS && y >= z.y - 1 && y <= z.y + VS;
  c.floors++;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!OBJ.has(t[i]) || inZ(x, y)) continue;
    c.objects++; const nm = Object.keys(T).find(k => (T as any)[k] === t[i])!; types[nm] = (types[nm] ?? 0) + 1;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const j = i + oy * W + ox; if (j > i && OBJ.has(t[j])) c.objTouch++; }
    if ([1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1].some(d => doorway(t, i + d))) c.objDoor++;
  }
  const map = P.propsFor(t, r.seed + r.floor, bi, z ? { x0: z.x - 1, y0: z.y - 1, x1: z.x + VS, y1: z.y + VS + 1 } : null);
  const fam = (p: P.PropSpot) => P.propFamily(bi, p);
  const spots: [number, number, P.PropSpot][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = map[y * W + x]; if (p) spots.push([x, y, p]); }
  for (const [x, y, p] of spots) {
    c.props++;
    if (inZ(x, y)) c.propVault++;
    if (p.kind !== 'wall') { let near = false; for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (OBJ.has(t[(y + oy) * W + x + ox]) || t[(y + oy) * W + x + ox] === T.STAIRS) near = true; if (near) c.propNextObj++; }
  }
  for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) {
    const [ax, ay, ap] = spots[a], [bx, by, bp] = spots[b];
    if (Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 8 && ap.kind === bp.kind) { c.pairsNear++; if (fam(ap) === fam(bp)) c.dupFam++; if (ap.pick === bp.pick) c.samePick++; }
  }
  for (const i of P.torchSpots(t, r.seed + r.floor)) if (inZ(i % W, (i / W) | 0)) c.torchVault++;
}
for (let s = 1; s <= runs; s++) {
  const r = newRun(s * 7919, 'krieger', defaultMeta());
  for (let f = 1; f <= 9; f++) {
    audit(r);
    r.mode = 'play'; r.mobs = []; r.tiles[r.p.y * W + r.p.x] = T.STAIRS; act(r, { t: 'descend' });
    if (r.mode !== 'play' && r.mode !== 'perk') r.mode = 'play';
  }
}
console.log(JSON.stringify(c)); console.log(JSON.stringify(types));
