# Herkunft der Grafiken

Alle Sprites stehen als Zeichenmatrizen in `src/render/sprites.ts` und `src/render/poses.ts`.
KI-Referenzen werden hier je Sprite eingetragen (Format siehe `docs/asset-pipeline.md`); PNG-Referenzen werden nicht eingecheckt.

## Phase 2 (Visual Pass)

Keine KI-Referenz verwendet: Das ZeroGPU-Kontingent für `mcp-tools/Z-Image-Turbo` war erschöpft
(„ZeroGPU quota exceeded“). Alle neuen Sprites der Phase 2 sind von Hand gezeichnet:

- `schuetze` (neue Fassung, Umschalter `SCHUETZE_NEU`) – von Hand, 2026-11-17
- Angriffs-, Zauber- und Todesbilder der Helden (`src/render/poses.ts`, abgeleitet aus den vorhandenen Matrizen) – 2026-11-17
- Angriffsbilder der sieben Gegner und der drei Bosse, zweite Bossfassung `koenig2`/`mutter2`/`fuerst2` (`src/render/sprites.ts`, `ATTACK`) – von Hand, 2026-11-17
- 37 Symbole 9×9 (`ICONS` in `src/render/sprites.ts`) – von Hand, 2026-11-17
- Wand- und Bodenspielarten, Lava (`src/render/gfx.ts`, im Code gezeichnet) – 2026-11-17
