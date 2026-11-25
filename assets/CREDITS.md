# Graphics credits

All sprites are character matrices in code (`src/render/sprites.ts`, `src/render/poses.ts`, `src/render/gfx.ts`).
AI references are recorded here per sprite (format: see `docs/asset-pipeline.md`); PNG references are not checked in.

## Bone Archer (`schuetze`, toggle `SCHUETZE_NEU` in `src/render/sprites.ts`)

- The new version in the repository is **hand-drawn, without an AI reference** (2026-11-17).
  At drawing time the ZeroGPU quota for `mcp-tools/Z-Image-Turbo` was exhausted, and the
  `schuetze_hand` version from the reference session was not in the repository.
- Reference from the pipeline session (not used in this version): model Tongyi-MAI/Z-Image-Turbo
  (Space `mcp-tools/Z-Image-Turbo`), license Apache-2.0, prompt "B" (exact wording not available here), seed 42.
  If `schuetze_hand` gets built in, this entry is completed with the full prompt.
- The old version is kept as `schuetze_alt` – hand-drawn.

## Hand-drawn (phase 2)

- Hero attack, spell and death frames (`src/render/poses.ts`, derived from the existing matrices)
- Attack frames of the seven enemies and three bosses; second boss versions `koenig2`, `mutter2`, `fuerst2` (`ATTACK`, `SPR` in `src/render/sprites.ts`)
- 64 icons 9×9 (`ICONS` in `src/render/sprites.ts`)
- Wall and floor variants, lava of the Ember Forge (`src/render/gfx.ts`, drawn in code)
- Palette additions R, i, m, u (`PAL`)

None of these graphics is based on an AI reference.

## Visual Pass 2 (light, shadows, textures, places)

- Floor patterns, wall tops, wall bases, transitions (`src/render/tiles.ts`)
- Decor per biome: chains, cobwebs, banners, roots, stalactites, hooks, ember grates, candles, bones,
  crystals, glowing mushrooms, ingots, coal, grave slab, puddle, ember grate (`src/render/props.ts`)
- Shadows, light, particles, fog, vignette (`src/render/shade.ts`, `light.ts`, `ambient.ts`)

Everything drawn in code, only colors from `PAL`, no AI reference. Comparison images: `docs/visual-pass-2/`.
