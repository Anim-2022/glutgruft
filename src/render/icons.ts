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
  'Aschenspalter': ['ashaxe'], 'Weltenbrand': ['firestaff'], 'Sternenfall': ['starbow'],
  'Drachenhaut': ['dragonscale'], 'Schattenmantel': ['cloak'],
  'Herz des Vulkans': ['volcanoheart'], 'Auge des Sehers': ['eyeamulet'], 'Blutring': ['bloodring'],
  'Ring der Gier': ['greedring'], 'Sturmring': ['stormring'],
};
// Gaben, Reliquien und Verbesserungen im Lager
export const PERK_ICON: Record<string, Ref> = {
  zaeh: ['heart'], scharf: ['sword'], panzer: ['shield'], vampir: ['drop'], krit: ['target'],
  quelle: ['manaorb'], meister: ['book'], vorrat: ['potion'], dornen: ['thorns'], seelen: ['soul'],
  flink: ['boot'], gier: ['goldbag'], weitblick: ['eye', { s: 'l', k: 'G' }], brandklinge: ['flame'], giftklinge: ['poison'],
  frosthauch: ['snow'], riese: ['crown'], sprengsatz: ['bomb'], berserker: ['horns'], atem: ['potion', { r: 'c' }],
  pilz: ['mushroom'], ausdauer: ['soul', { s: 'l', c: 'G' }], henker: ['axeblood'], spalter: ['axe'],
  kettenblitz: ['lightning'], durchschuss: ['arrows'],
  // Reliquien: jede mit eigenem Motiv
  glutherz: ['flameheart'], donnerfaust: ['fist'], pulverfass: ['barrel'], sprengmeister: ['bombs'],
  geisterlicht: ['ghost'], steinhaut: ['rock'], blutpakt: ['scroll'],
  seelenkelch: ['chalice', { v: 's' }], zeitsand: ['hourglass'], giftzahn: ['fang'], frostkern: ['crystal'],
  muenze: ['coin'], eisenwille: ['helm'], jaeger: ['skull'], echo: ['waves'],
};
export const UPG_ICON: Record<string, Ref> = {
  vit: ['heartplus'], atk: ['whetstone'], trank: ['potion'], fokus: ['soul', { s: 'v', c: 'p' }], gold: ['coins'],
  bombe: ['bomb', { g: 'y' }], fund: ['key'], wahl: ['owl'], erbe: ['amulet'],
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
