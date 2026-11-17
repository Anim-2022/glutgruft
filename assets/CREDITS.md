# Herkunft der Grafiken

Alle Sprites stehen als Zeichenmatrizen im Code (`src/render/sprites.ts`, `src/render/poses.ts`, `src/render/gfx.ts`).
KI-Referenzen werden hier je Sprite eingetragen (Format siehe `docs/asset-pipeline.md`); PNG-Referenzen werden nicht eingecheckt.

## Knochenschütze (`schuetze`, Umschalter `SCHUETZE_NEU` in `src/render/sprites.ts`)

- Die im Repository eingebaute neue Fassung ist **von Hand gezeichnet, ohne KI-Referenz** (2026-11-17).
  Beim Zeichnen war das ZeroGPU-Kontingent für `mcp-tools/Z-Image-Turbo` erschöpft, und die Fassung
  `schuetze_hand` aus der Referenz-Sitzung lag im Repository nicht vor.
- Referenz aus der Pipeline-Sitzung (nicht in dieser Fassung verwendet): Modell Tongyi-MAI/Z-Image-Turbo
  (Space `mcp-tools/Z-Image-Turbo`), Lizenz Apache-2.0, Prompt „B“ (Wortlaut liegt hier nicht vor), Seed 42.
  Wird `schuetze_hand` eingebaut, wird dieser Eintrag mit vollständigem Prompt ergänzt.
- Alte Fassung bleibt als `schuetze_alt` erhalten – von Hand.

## Von Hand gezeichnet (Phase 2)

- Angriffs-, Zauber- und Todesbilder der Helden (`src/render/poses.ts`, aus den vorhandenen Matrizen abgeleitet)
- Angriffsbilder der sieben Gegner und der drei Bosse; zweite Bossfassung `koenig2`, `mutter2`, `fuerst2` (`ATTACK`, `SPR` in `src/render/sprites.ts`)
- 64 Symbole 9×9 (`ICONS` in `src/render/sprites.ts`)
- Wand- und Bodenspielarten, Lava der Glutschmiede (`src/render/gfx.ts`, im Code gezeichnet)
- Palettenergänzung R, i, m, u (`PAL`)

Keine dieser Grafiken beruht auf einer KI-Referenz.
