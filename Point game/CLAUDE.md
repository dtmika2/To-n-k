# Dream Pattern (Point game)

A memory game for a 75" portrait touch table: a PixiJS 8 + Web Audio PWA, run in kiosk Chrome. `PLAN.md` is the design source; its amendments at the end record later changes. `CHECKPOINT.md` records progress.

## Commands
- `npm run dev` — Vite dev server on http://localhost:5173.
  - URL flags: `?debug`, `?primitives`, `?unused` (marks decoy eyes), `?look=classic|vfx`, `?scale=`, `?rotate=`, `?octaves=`, `?depth=0` (depth off), `?backdrop=loop|swirl`.
  - The picture is turned 270° by default (`display.rotateDeg`), for a landscape TV; use `?rotate=0` to work upright in a desktop browser.
  - `M` opens the menu overlay (`src/debug/menu.ts`): the key legend plus live switches. New keys and safe live tunables belong there too.
  - `/vfx.html`: look-dev page, classic and vfx side by side with sliders.
  - `/install.html`: one-tap install page (`src/install/installPage.ts`); public at https://dtmika2.github.io/To-n-k/point-game/install.html.
- `npm run verify` — typecheck, vitest, pattern validation and build. Run this before committing.
- `npm run validate` / `npm run assign-pitches` — run these after changing `src/config/pattern.json`.
- **Don't run the Playwright e2e/perf tests unless asked.**
- **Public build:** every push to `main` publishes https://dtmika2.github.io/To-n-k/point-game/ (repo-root `.github/workflows/pages.yml`, `BASE_PATH=/To-n-k/point-game/`; asset URLs must go through `import.meta.env.BASE_URL`). The workflow runs typecheck, tests and validate first. Building locally with that base in Git Bash needs `MSYS_NO_PATHCONV=1`.

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
  - An eye's optional `turn` (degrees) adjusts the angle its seed gives it.
  - The start eye may repeat; the end may not.
  - Each eye has its own note from A minor pentatonic D3–G6.
  - The `E` key opens the layout editor.
- **Scene layers, bottom to top:** sky/backdrop, clouds (puff sprites), mist shader, puffs, strands, beams, dust, eyes, lid light, master button, rings, orb, fx.
- **Depth mode (on by default; `Z` key, M menu, `?depth=0` for off):** each eye gets a depth from its seed (`render/depth.ts`), which sets its size, haze and the width of its lines. `SceneRenderer.applyLayering()` gives each eye its own draw layer, furthest first (strands, beams, orbiters, eye, lid light), so a line passes over the eyes further than it and under the nearer ones while staying under its own two end eyes (`lineLayer`); a dragged line's tip takes its depth from the regions around the eyes (`fingerDepth`); clouds and a mist veil go in between the far, mid and near bands; off, everything uses the first layer in the order above. Visual only: hit radii ignore depth. Tunables: `settings.display.depth`.
- **Backdrop:** an image by default (`display.backdrop`); experimental looping videos in `display.backdropVideos` (`B` key, M menu). Videos are H.264 MP4, fetched whole and played from memory (`render/videoBackdrop.ts`) so they work offline from the service worker's cache; a video that fails falls back to the image.
- **Reveal:** no number image. After a solve the eyes in pattern.json `"figure"` are joined in order and draw the number; timing in `game/figure.ts` (`figureProgress`), shared by the scene, the debug drawing and the audio (each figure eye plays its note as the line reaches it).
- **Two looks in one build** (`settings.display.look`, `?look=`, `L` key live): `classic` and `vfx`. The vfx look swaps three primitives for shaders in `render/vfx/`: the iris (`portal.ts`, inside the same lid mask), the strands (`beam.ts`, via `render/strand.ts`), the rings (`ring.ts`), the notice centre (`orb.ts` plus sparks) and the lids (`lidLight.ts`, lids and lashes of light; lash tips spark). Beams and rings are each one dynamic mesh per frame (`batch.ts`). Everything else is shared; new visuals should work in both looks.
- **Shader time:** never pass raw time into noise (hash precision; the kiosk runs for days). Use `wrap()` from `render/vfx/shaders.ts` with the periodic `tnoise`/`tfbm`, or `shaderTime()` for sin-only use.

## Gotchas
- Pixi tessellates circles by their local radius, which is tiny in world units. Use the `circle()` / `wobblyCircle()` helpers in `render/draw.ts`.
- Recreate RenderTextures on resize; don't resize them.
- Windows/Git Bash: `node -e` with backticks breaks. Write a script file instead, and run `.ts` files directly with `node`.
