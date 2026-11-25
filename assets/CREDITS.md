# Herkunft der Grafiken

Alle Sprites stehen als Zeichenmatrizen im Code (`src/render/sprites.ts`, `src/render/poses.ts`, `src/render/gfx.ts`).
KI-Referenzen werden hier je Sprite eingetragen (Format siehe `docs/asset-pipeline.md`); PNG-Referenzen werden nicht eingecheckt.

## Knochenschütze (`schuetze`, `src/render/sprites.ts`)

- Von Hand gezeichnet, ohne KI-Referenz (2026-11-17). Die erste Fassung wurde entfernt.

## Von Hand gezeichnet (Phase 2)

- Angriffs-, Zauber- und Todesbilder der Helden (`src/render/poses.ts`, aus den vorhandenen Matrizen abgeleitet)
- Angriffsbilder der sieben Gegner und der drei Bosse; zweite Bossfassung `koenig2`, `mutter2`, `fuerst2` (`ATTACK`, `SPR` in `src/render/sprites.ts`)
- 64 Symbole 9×9 (`ICONS` in `src/render/sprites.ts`)
- Wand- und Bodenspielarten, Lava der Glutschmiede (`src/render/gfx.ts`, im Code gezeichnet)
- Palettenergänzung R, i, m, u (`PAL`)

Keine dieser Grafiken beruht auf einer KI-Referenz.

## Visual Pass 2 (Licht, Schatten, Texturen, Orte)

- Bodenmuster, Mauerkronen, Wandsockel, Übergänge (`src/render/tiles.ts`)
- Dekor je Biom: Ketten, Spinnweben, Banner, Wurzeln, Tropfsteine, Haken, Glutgitter, Kerzen, Knochen,
  Kristalle, Leuchtpilze, Barren, Kohle, Grabplatte, Pfütze, Glutrost (`src/render/props.ts`)
- Schatten, Licht, Teilchen, Nebel, Vignette (`src/render/shade.ts`, `light.ts`, `ambient.ts`)

Alles im Code gezeichnet, nur Farben aus `PAL`, ohne KI-Referenz.
