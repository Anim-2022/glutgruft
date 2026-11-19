/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';
import { hasGlyph } from '../src/render/gfx';

// Jedes Zeichen in Texten des Spiels (deutsch und englisch) muss in der Pixelschrift vorkommen,
// sonst zeichnet das Spiel an seiner Stelle ein „?“.
const SOURCES = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('Pixelschrift', () => {
  it('kennt alle Zeichen aus den Texten', () => {
    const missing = new Map<string, string>();
    for (const [f, text] of Object.entries(SOURCES)) {
      text.split('\n').forEach((line, n) => {
        if (line.trim().startsWith('//')) return;
        for (const m of line.matchAll(/'([^'\n]*)'|`([^`\n]*)`/g)) for (const ch of m[1] ?? m[2] ?? '') {
          if (ch.charCodeAt(0) < 128 || hasGlyph(ch)) continue;
          if (!missing.has(ch)) missing.set(ch, `${f}:${n + 1}`);
        }
      });
    }
    expect(Object.keys(SOURCES).length).toBeGreaterThan(10);
    expect([...missing]).toEqual([]);
  });
});
