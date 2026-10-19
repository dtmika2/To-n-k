# Dream Pattern (Point game)

A memory game for a 75" portrait touch table: a PixiJS 8 + Web Audio PWA, run in kiosk Chrome. `PLAN.md` is the design source; its amendments at the end record later changes. `CHECKPOINT.md` records progress.

## Commands
- `npm run dev` — Vite dev server on http://localhost:5173.
  - URL flags: `?debug`, `?primitives`, `?unused` (marks decoy eyes), `?scale=`, `?rotate=`, `?octaves=`.
- `npm run verify` — typecheck, vitest, pattern validation and build. Run this before committing.
- `npm run validate` / `npm run assign-pitches` — run these after changing `src/config/pattern.json`.
- **Don't run the Playwright e2e/perf tests unless asked.**

## Workflow
- Work directly on `main`, with no branches.
- Commit (and push) only when asked.
- Don't restart a dev server that was stopped for low memory unless asked.

## Architecture
- **World units:** portrait width = 1, height = `ASPECT` (16/9). `pattern.json` stores normalized x/y; use `toWorld` to convert.
- **Game rules:** a pure reducer, `src/game/reducer.ts`: `(state, event, now) → {state, effects}`.
  - Modes: INTRO / GAME (DEMO, READY, TRACING, LIFTED, COLLAPSE) / REVEAL / IDLE / CREATIVE.
  - Effects drive `render/scene.ts`, `render/debugRenderer.ts` and `audio/engine.ts`. Rules belong in the reducer, and get unit tests in `tests/unit/reducer.test.ts`.
- **Attract demo:** `game/attract.ts`, an INTRO-only presentation kept outside the reducer.
- **Tunables:** `src/config/settings.ts`. The "get ready" notice timing is in `src/config/notice.ts`, shared by the scene and the audio.
- **Pattern:** the Leo constellation, 18 eyes (ids 0–8 form Leo; 9–17 are decoys) and a 13-touch sequence.
  - The start eye may repeat; the end may not.
  - Each eye has its own note from A minor pentatonic D3–G6.
  - The `E` key opens the layout editor.
- **Scene layers, bottom to top:** sky/backdrop, clouds (puff sprites), mist shader, puffs, strands, dust, eyes, reveal number, master button, fx.

## Gotchas
- Pixi tessellates circles by their local radius, which is tiny in world units. Use the `circle()` / `wobblyCircle()` helpers in `render/draw.ts`.
- Recreate RenderTextures on resize; don't resize them.
- Windows/Git Bash: `node -e` with backticks breaks. Write a script file instead, and run `.ts` files directly with `node`.
