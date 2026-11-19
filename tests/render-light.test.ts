import { describe, it, expect } from 'vitest';
import { W, H, T } from '../src/game/dungeon';
import { lightMask, maskFor, syncTiles } from '../src/render/light';

// Zwei Räume, getrennt durch eine Wandspalte bei x = 10
function twoRooms(): Uint8Array {
  const t = new Uint8Array(W * H).fill(T.WALL);
  for (let y = 5; y <= 12; y++) for (let x = 3; x <= 17; x++) if (x !== 10) t[y * W + x] = T.FLOOR;
  return t;
}
const at = (m: Uint8Array, R: number, ox: number, oy: number, x: number, y: number) => m[(y - oy + R) * (2 * R + 1) + x - ox + R];

describe('Licht mit Verdeckung', () => {
  it('eine Fackel im linken Raum erhellt den rechten Raum nicht', () => {
    const t = twoRooms(), R = 6;
    const m = lightMask(t, 7, 8, R);
    expect(at(m, R, 7, 8, 8, 8)).toBe(1);   // eigener Raum
    expect(at(m, R, 7, 8, 10, 8)).toBe(1);  // die zugewandte Wandseite
    for (let y = 5; y <= 12; y++) for (let x = 11; x <= 13; x++) expect(at(m, R, 7, 8, x, y)).toBe(0);
  });

  it('eine Quelle in der Wand (Lava) leuchtet nur zur offenen Seite', () => {
    const t = new Uint8Array(W * H).fill(T.WALL), R = 5;
    for (let y = 5; y <= 12; y++) for (let x = 3; x <= 8; x++) t[y * W + x] = T.FLOOR; // Raum links, Fels ab x = 9
    const m = lightMask(t, 9, 8, R);
    expect(at(m, R, 9, 8, 7, 8)).toBe(1);   // Raum
    expect(at(m, R, 9, 8, 9, 6)).toBe(1);   // Wandseite zum Raum
    for (let x = 10; x <= 13; x++) expect(at(m, R, 9, 8, x, 8)).toBe(0); // Fels dahinter
  });

  it('nach dem Sprengen der Wand verfallen die gespeicherten Masken', () => {
    const t = twoRooms(), R = 6;
    syncTiles(t);
    expect(at(maskFor(t, 7, 8, R), R, 7, 8, 12, 8)).toBe(0);
    expect(syncTiles(t)).toBe(false);
    for (let y = 5; y <= 12; y++) t[y * W + 10] = T.RUBBLE;
    expect(syncTiles(t)).toBe(true);
    expect(at(maskFor(t, 7, 8, R), R, 7, 8, 12, 8)).toBe(1);
  });
});
