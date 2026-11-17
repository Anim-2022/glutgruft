// Symbole 9x9 für Ausrüstung, Gaben, Reliquien und Verbesserungen (Phase 2). Nur Darstellung.
import { ICONS, PAL } from './sprites';
import type { Item } from '../game/content';

// Motiv und optionale Umfärbung (Zeichen -> Zeichen)
type Ref = [string, Record<string, string>?];

const WEAPON_ICON: Record<string, Ref[]> = {
  krieger: [['sword'], ['axe'], ['spear']],
  magier: [['staff'], ['staff', { o: 'c', y: 's' }], ['staff', { o: 'Y', y: 'w' }]],
  waldlaeufer: [['bow'], ['crossbow'], ['knife']],
};
const ARMOR_ICON: Ref[] = [['leather'], ['chain'], ['plate'], ['plate', { y: 'o' }]];
const UNIQUE_ICON: Record<string, Ref> = {
  'Aschenspalter': ['axe', { w: 'o' }], 'Weltenbrand': ['staff', { y: 'w' }], 'Sternenfall': ['bow', { i: 'y', w: 'y' }],
  'Drachenhaut': ['plate', { y: 'G' }], 'Schattenmantel': ['leather', { n: 'p', N: 'k' }],
  'Herz des Vulkans': ['heart', { r: 'o', w: 'y' }], 'Auge des Sehers': ['eye'], 'Blutring': ['ring', { r: 'R' }],
  'Ring der Gier': ['coin'], 'Sturmring': ['lightning'],
};
// Gaben, Reliquien und Verbesserungen im Lager
export const PERK_ICON: Record<string, Ref> = {
  zaeh: ['heart'], scharf: ['sword'], panzer: ['shield'], vampir: ['drop'], krit: ['eye', { s: 'r', k: 'R' }],
  quelle: ['chalice', { v: 'c' }], meister: ['book'], vorrat: ['potion'], dornen: ['thorns'], seelen: ['soul'],
  flink: ['boot'], gier: ['coin'], weitblick: ['eye', { s: 'l', k: 'G' }], brandklinge: ['flame'], giftklinge: ['poison'],
  frosthauch: ['snow'], riese: ['crown'], sprengsatz: ['bomb'], berserker: ['fist', { y: 'r' }], atem: ['potion', { r: 'c' }],
  pilz: ['mushroom'], ausdauer: ['soul', { s: 'l', c: 'G' }], henker: ['axeblood'], spalter: ['axe'],
  kettenblitz: ['lightning'], durchschuss: ['arrows'],
  // Reliquien
  glutherz: ['heart', { r: 'o', w: 'y' }], donnerfaust: ['fist'], pulverfass: ['bomb', { D: 'n' }], sprengmeister: ['bomb', { D: 'r', g: 'y' }],
  geisterlicht: ['eye', { s: 'w', k: 's' }], steinhaut: ['shield', { d: 'g' }], blutpakt: ['chalice', { v: 'r' }],
  seelenkelch: ['chalice', { v: 's' }], zeitsand: ['hourglass'], giftzahn: ['poison', { l: 'w' }], frostkern: ['snow', { s: 'c' }],
  muenze: ['coin', { Y: 'y', y: 'Y' }], eisenwille: ['shield', { d: 'D' }], jaeger: ['skull'], echo: ['book', { k: 'c' }],
};
export const UPG_ICON: Record<string, Ref> = {
  vit: ['heart'], atk: ['whetstone'], trank: ['potion'], fokus: ['soul'], gold: ['coin'],
  bombe: ['bomb'], fund: ['key'], wahl: ['book'], erbe: ['amulet'],
};

const cache = new Map<string, HTMLCanvasElement>();
function bakeIcon([name, swap]: Ref, tint: string): HTMLCanvasElement {
  const key = `${name}|${JSON.stringify(swap ?? {})}|${tint}`;
  let c = cache.get(key);
  if (c) return c;
  const rows = ICONS[name];
  c = document.createElement('canvas'); c.width = 9; c.height = 9;
  const g = c.getContext('2d')!;
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return;
    const k = swap?.[ch] ?? ch;
    g.fillStyle = k === '#' ? tint : PAL[k] ?? tint;
    g.fillRect(x, y, 1, 1);
  }));
  cache.set(key, c);
  return c;
}

// Symbol eines Gegenstands: Unikat nach Name, sonst Waffenart der Klasse, Rüstung nach Seltenheit, Amulett, Ring
export function itemIconRef(it: Item, cls: string): Ref {
  if (UNIQUE_ICON[it.name]) return UNIQUE_ICON[it.name];
  if (it.slot === 0) return WEAPON_ICON[cls]?.[it.wk ?? 0] ?? ['sword'];
  if (it.slot === 1) return ARMOR_ICON[Math.min(3, it.rar)];
  return it.slot === 2 ? ['amulet'] : ['ring'];
}
export function drawItemIcon(ctx: CanvasRenderingContext2D, it: Item, cls: string, x: number, y: number, tint: string) {
  ctx.drawImage(bakeIcon(itemIconRef(it, cls), tint), x, y);
}
export function drawIcon(ctx: CanvasRenderingContext2D, ref: Ref | undefined, x: number, y: number, tint: string, scale = 1) {
  if (!ref) return;
  ctx.drawImage(bakeIcon(ref, tint), x, y, 9 * scale, 9 * scale);
}
