# Instructions for future sessions

## Language

- The game is **English only**. All player-facing text (UI, messages, item/skill/enemy names, tutorial, events) is written directly in English in the source.
- There is no i18n layer and no language toggle. Do not add German text, a translation dictionary, or a language option.
- New strings: write them in English right where they are used. Tests in `tests/*.test.ts` check that texts contain no German umlauts.
- New docs and commit messages: English.
- Internal identifiers (ids such as `krieger`, `magier`, `waldlaeufer`, perk/event ids, save keys like `glutgruft.v1`) stay as they are — they are not shown to the player and renaming them would break saves.
- "Glutgruft" is the game's name and stays.

## Workflow

- `npm test` runs the logic tests (including balance regression), `npx tsc --noEmit` type-checks, `npm run build` builds.
- Screenshot scripts live in `scripts/` (Playwright + Vite).
