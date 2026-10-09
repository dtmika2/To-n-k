# Pick up from here (next session)

State at 2026-10-09: work is on `main`. Dev server:
`npm run dev`; links are in `docs/DEV-URLS.md`. Full history and decisions are in `PROGRESS.md` and
`DECISIONS.md`.

## To do

Items 1–3 and 5 from the 2026-10-07 list are done (2026-10-09, see DECISIONS.md). Still open:

1. **Upper-lid sprite overlap.** The client's `lidTop.png` covers the top of the upper-left and
   upper-right numbers while dozing. Fix it in the art (end the rim on the starter lid's curve), by
   raising `lidTop`'s `pivotY` in `public/assets/manifest.json`, or with a lighter doze.
2. **Confirm with the client:** the active eye now neither flares nor blinks (both candidates
   calmed), and taps on hidden arrows still turn the wheel. Both are easy to change in `FEEL`.

## Housekeeping

- Remaining layers to replace are listed in `public/assets/test-sprites/README.md`.
- Each change: `npm run verify` and `npm run e2e` before committing (work directly on `main`).
