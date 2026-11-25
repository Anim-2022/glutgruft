# To-do (from playtesting)

## 1. Rune circle prop: make it bigger

- Where: `src/render/props.ts` (`runeCircle`, crypt biome, `flat` props).
- Problem: it is drawn inside a single 16×16 tile (radius 6×4 px), blue dotted ring that flickers.
  Players read it as a leftover spell effect, not as floor decor.
- Fix: draw it over several tiles (about 3×3), as an engraved floor pattern: outer and inner ring,
  a few glyphs, muted stone/blue colours, little or no flicker. It already only spawns in large rooms
  with a free 5×5 area, so a 3×3 footprint fits.

## 2. Sound: softer, less harsh

- Where: `src/core/audio.ts` (synthesised with `tone()` and `noise()`).
- Problem: some sounds are too loud, harsh and annoying.
- Likely causes: most sounds use `square`/`sawtooth` waves; master gain is 0.9; hard attacks;
  frequent sounds (hit, pick, zap) repeat at the same pitch.
- Fix ideas:
  - Switch to `triangle`/`sine` or put a lowpass filter on the tones.
  - Short attack/release envelopes instead of hard on/off.
  - Lower the master gain, add a compressor/limiter on the master bus.
  - Small random pitch variation; limit how often the same sound can play at once.
  - Make `hurt`, `crit`, `death` and `level` gentler first.
  - Optional: volume slider in the options.
