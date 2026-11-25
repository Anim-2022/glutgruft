# Asset pipeline: AI image → sprite

Summary: **16×16 = auto-conversion as a draft, then clean up by hand. 24×24 (bosses) = image only as a reference, draw the matrix by hand.**

## 1. Generate the image (Z-Image-Turbo)

Space `mcp-tools/Z-Image-Turbo`, resolution `1024x1024 ( 1:1 )`, `random_seed: false`, note the seed.

Prompt template:

```
16x16 pixel art sprite of {enemy description} with a {signature color}, chunky large pixels, big head,
front view, no outline, flat solid black background, centered, retro game, very low resolution,
each pixel clearly visible, limited 8-color palette
```

Example: `{enemy description}` = `a skeleton archer`, `{signature color}` = `red hood`.

- If a "maybe not safe" panel appears instead of the image (safety filter): use **another seed**. The same seed keeps returning the panel.
- The model ignores "16x16": the figure is ~45–55 "pixels" wide in the image, so downscaling always loses detail.

## 2. Convert

Save the tool's WebP losslessly as PNG first, then:

```bash
node scripts/img2sprite.ts assets/_hf_test/<image>.png --size 16 --name <sprite_name>
```

```bash
node scripts/img2sprite.ts assets/_hf_test/<image>.png --size 16 --grid --name <sprite_name>
```

Recommended: run both modes and start from the better preview. Defaults are usually enough.

| Flag | Default | When to change |
|---|---|---|
| `--size` | 16 | 24 for bosses (comparison only, see above) |
| `--tol` | 12 | background remains → raise; figure gets eaten → lower |
| `--empty` | 0.5 | thin lines missing → raise (e.g. 0.65) |
| `--kweight` | 0.3 | the source outline eats details → lower |
| `--grid` | off | detect the source's pixel grid; falls back to normal mode if none is found |
| `--global` | off | remove the background color inside the figure as well |

Output: matrix in the format of `src/render/sprites.ts` (stdout) and a ×8 preview `<out>/<image>[_grid]_preview.png`.
`assets/_hf_test/` is in `.gitignore` – test images are not checked in.

## 3. Clean up by hand (required before adding)

- **Big head**: skull/head at least 6–8 px wide, eyes or eye sockets clear (2×2).
- **No black outline**: `k` only for eyes, nose, slits. The game draws the outline itself (mind `NO_OUTLINE`).
- **Only `PAL`**: no new characters without an entry in `PAL`.
- **Front view**, weapon on the right like the existing figures; add back and side views (`VIEWS`) by hand.
- Make the signature color clear (e.g. hood `e`/`r` on the Bone Archer), remove single-pixel noise.
- Check the finished matrix against the existing sprites at the same scale.

## 4. Sources and licenses

- **Z-Image-Turbo** (`Tongyi-MAI/Z-Image-Turbo`): Apache-2.0 – use it.
- **lm555/game-asset-generator**: do not use. Returns only `Error!`, license not stated.

Record every adopted sprite in `assets/CREDITS.md`:

```markdown
## <sprite_name> (src/render/sprites.ts)
- Model: Tongyi-MAI/Z-Image-Turbo (Space mcp-tools/Z-Image-Turbo), license Apache-2.0
- Prompt: "<full prompt>"
- Seed: <seed>, resolution 1024x1024
- Conversion: img2sprite --size 16 [--grid], then reworked by hand
- Date: <YYYY-MM-DD>
```
