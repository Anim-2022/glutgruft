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

## 3. Hunters: one at a time, each stronger

- Where: `src/game/run.ts` (`spawnHunter`, hunt pressure), balance tests in `tests/`.
- Problem: once the first hunter appears, more spawn in quick succession while the player runs
  to the exit.
- Fix: only one hunter alive at a time. When it dies, the next one spawns a few turns later
  and is stronger than the previous one (scale by hunter index). Re-run the balance regression.

## 4. Hunter countdown text is hidden by the minimap

- Where: `hunterWarn` in `src/game/run.ts`, drawn in `src/render/draw.ts` (~line 436).
- Fix: move the "hunter arrives in N turns" warning to a free spot (e.g. top centre under the
  event goal line), never under the minimap.

## 5. Status bar: buffs, effects, passives on screen

- Problem: the player has to read items to know what is active.
- Plan: a row of small icons on the HUD (near the HP/resource bars):
  - temporary statuses (Burn, Poison, Net, War Cry, Bulwark, ...) with remaining turns,
  - active buffs from shrines/events/items,
  - perks and item passives (vampir, thorns, ...) grouped and compact.
  Hover with the mouse shows a tooltip with name and full description. Reuse `STATUS` in
  `src/render/draw.ts` and icons in `src/render/icons.ts`. Must fit at small screens.

## 6. Corpse variants by cause of death

- Where: `src/render/deaths.ts` (corpse/death per enemy kind), kill events in `src/render/draw.ts`.
- Plan: pass the cause of death (melee/sword, arrow, magic/fire, explosion/barrel, poison, ...)
  with the kill event and pick a corpse per enemy kind and cause, e.g. arrow → corpse with
  arrows stuck in it; fire/magic → charred; explosion → scattered parts; sword → cut in two.
  Class-specific: warrior cuts, ranger arrows, mage burns/freezes. Fallback: current corpse.

## 7. Aim at barrels instead of enemies

- Problem: ranged attacks (ranger, mage) always auto-target enemies, so a barrel can't be shot
  from distance on purpose.
- Plan: a target cycle key (e.g. Tab) and mouse click on a tile choose the target; barrels and
  other destructibles are valid targets. Show the chosen target with a marker.

## 8. Bug: cursed (purple) chest turns yellow when opened

- Where: `src/render/draw.ts` tile sprites: `T.CURSED` uses `cursed`, but after opening it
  becomes `T.CHEST_OPEN` (gold `chest_open`).
- Fix: add a cursed open state (own tile or flag) with a purple `cursed_open` sprite.
