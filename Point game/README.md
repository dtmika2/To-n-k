# Dream Pattern

A touch-table memory game: trace the pattern of the sleeping eyes to part the clouds. The design is in `PLAN.md`, the build status in `CHECKPOINT.md`, and the kiosk setup in `kiosk/README.md`.

```
npm install
npm run dev          # development, http://localhost:5173  (?debug for the overlay)
npm run verify       # typecheck + unit tests + pattern validator + build
npm run build && npm run serve   # production build on http://localhost:4173
npm run validate     # check src/config/pattern.json
npm run assign-pitches           # re-assign notes after changing the sequence
```

Operator keys: `D` debug overlay · `P` primitives · `L` switch look (or `?look=classic|vfx`) · `U` mark unused eyes (or `?unused`) · `E` layout editor · `R` reset · `1`–`5` jump to a state.

Two visual looks ship in the same build: `vfx` (default, `settings.display.look`: shader beams, portal irises, lids of light, rings of light) and `classic`. `/vfx.html` shows them side by side with sliders.
