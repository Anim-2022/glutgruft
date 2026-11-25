# Glutgruft

Turn-based pixel roguelike for the browser. No install, no account, progress is saved in the browser.

## Development

```bash
npm install
npm run dev      # local server
npm test         # logic tests
npm run build    # output in dist/
```

## Deployment (Vercel)

Build command `npm run build`, output directory `dist`.

## Controls

Arrows/WASD move and attack · Space wait · 1–6 skills (4–6: new ones from the tree) · U ultimate · 7–0 scrolls and potions · K skill tree · F ranged attack · Q healing potion · B bomb · E stairs
Click or Tab selects a target · I backpack · C character · H help · N minimap · M sound · V fullscreen

## Content

- 15 floors in three biomes, a boss every fifth floor, three classes
- destructible environment: cracked walls, barrels, pillars, brittle floor, fire
- puzzle chambers (crates, runes, ice hall, combat trial) with relics as rewards
- traders, gold, gear in four rarities, cursed chests
- permanent upgrades in camp, daily run, autosave

The game is English only.

`tests/bot.ts` contains an autoplayer; `npm test` reports how far it gets per class.
