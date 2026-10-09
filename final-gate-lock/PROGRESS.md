# Progress

**Status: M0–M10 built and self-verified.** Every milestone passed typecheck, unit tests, build,
its Playwright checks and a reviewed screenshot, and was committed as `Mx: …` on branch
`build/final-gate-lock`. Decisions and interpretations are in `DECISIONS.md` (no deviations from the
fixed decisions). Tablet setup is in `DEPLOY.md`.

## What was built

A single-purpose offline PWA (Vite 8 + strict TypeScript + PixiJS 8 + vite-plugin-pwa) for the
Galaxy Tab S11. Ten brass eye-wheels on an oak-and-brass castle plate, 3-4-3 layout. Each wheel is
an eye: a numbered disc turns under an opaque iris plate whose wedge window shows one number. The
lids, pupil and glow live above it. No text on the play screen.

Shrouded (mist, teal glimmers) → tap → intro (mist parts, eyes open in a wave, wheels spin onto
their start slots) → playable (arrows or drag, multi-touch, eyes doze, blink, glance, get curious,
wake under a finger, fall asleep after 60 s idle) → the last wheel settles correct → success (held
breath, eyes stare, wheels sink and lock, the plate splits over a gold core, dust) → Open for 40 s →
the mist rolls back → Shrouded.

Everything is drawn procedurally. Any layer can be swapped for a sprite through
`public/assets/manifest.json`, one at a time. There is an operator menu behind a 3 s corner hold
and PIN, Web Audio with 16 cues (silent without files), a screen wake lock, and self-healing
reloads.

## How to run

```bash
cd final-gate-lock
npm install
npm run dev          # http://localhost:5173 (no service worker in dev)
npm run verify       # typecheck + unit tests + production build (dist/)
npm run preview      # http://localhost:4173 serves dist/ with the service worker
npm run e2e          # 44 Playwright checks against the preview (system Chrome)
npm run soak         # 8 simulated hours of synthetic play at 100× (~5 min)
npm run test:cov     # unit tests with coverage
npm run test-sprites # regenerate the aligned test sprite set (needs preview running)
npm run icons        # regenerate PWA icons
```

Dev page: `/wheel.html`, one large wheel for tuning the look and the feel.

### Dev URL flags

| Flag | Effect |
| --- | --- |
| `?debug` | FPS / frame-time meter, hit-area outlines (arrows, discs, operator zone, seam) |
| `?skip-intro` | Boot straight into Playable |
| `?solve` | Start one move from solved: wheel 10 needs one ↻ tap |
| `?placeholderSfx` | Synthesised placeholder tones for every missing sound file |
| `?speed=N` | Run every animation and game timer N× faster (tests) |
| `?config=path.json` | Load an alternative config (same-origin relative path) |
| `?manifest=path.json` | Use another sprite manifest, e.g. `assets/test-sprites/manifest.json` |
| `?sprites` / `?procedural` | Force the visual mode for this session |

Flags combine, e.g. `/?skip-intro&solve&placeholderSfx`.

## Milestones

- **M0 — Scaffold.** 1280×800 logical canvas, letterboxed. Touch/zoom lockdown. Config validation
  with a red error screen. PWA manifest and icons, everything precached. Verified: installable
  manifest, and an offline reload with the server actually killed.
- **M1 — Lock model + state machine.** Pure `lockModel` and `machine` (six states, the 40 s hold,
  idle → asleep) with injected timers. Coverage 100% lines; branches ≥ 95.9%.
- **M2 — One wheel.** Ring, disc with Cinzel numerals (upright at rest; 6 and 9 underlined), iris
  with the wedge window, pupil, highlight, masked rigid lids, additive glow, and arrows with pressed
  states. Arrow steps (one queued tap) and 1:1 drag with flick snapping always land on one of the
  3 slots.
- **M3 — Ten wheels + win.** Plate (oak, riveted brass, bezels, filigree, seam), 3-4-3 layout,
  multi-touch with one pointer per wheel, and the win check only on settle with all wheels at rest.
  Verified: solving by arrows; five simultaneous touch pointers on five wheels.
- **M4 — Eyes alive.** Drowsy, blink, glance, curious, awake, settled, asleep (ripple + 60% dim).
  A global blink gate: over 5 simulated minutes, 460 blinks and 0 frames with two eyes blinking.
  The eye can't see correctness (enforced by a source-level unit test).
- **M5 — Background + intro.** Stone wall, mist (density, part, roll), glimmers, a veil-based fade,
  and the full §6.3 intro (measured 5004 ms; input ignored throughout).
- **M6 — Success, Open, Reset.** The full §6.4 sequence: plate snapshot split, gold core with god
  rays, dust, 40 s hold, and a reset hidden behind the mist. Measured 7.08 s / 40.13 s / 3.05 s.
  20 full loops: objects constant, 0 leaked textures.
- **M7 — Audio.** `AudioManager`: ambience and effects buses, ducking, variants without repeats,
  voice limits, silent fallback, placeholder synthesis, all 16 cues wired. File list:
  `public/sfx/README.md`.
- **M8 — Operator mode.** Corner hold (ring in the last second), PIN pad (a wrong PIN closes it),
  every menu action, persisted settings (localStorage, sanitised), and auto-close after 60 s.
- **M9 — Sprite pipeline.** Manifest-driven layers, runtime mode switch, per-layer fallback, and an
  aligned steel test set. Screenshot diff procedural vs sprites: mean |ΔL| 2.1/255 (vs 14.5 when
  offset by 2 px). Transforms are identical across the switch. Authoring guide:
  `public/assets/README.md`.
- **M10 — Hardening.** Performance budget met, offline after a browser "reboot", wake lock
  (deduplicated, re-requested on visibility), adaptive render resolution, reload on WebGL context
  loss or a stalled loop, the 8-hour soak, and `DEPLOY.md`.

## Changes after M10

- **Rotating window plate** (client request): the numbered disc is fixed and the iris plate with
  the window turns. See DECISIONS.md → Deviations.
- **Heavy feel** (client request): slower, weighted motion with hard stops, recoil and thuds; drag
  inertia with ratchet notches; slower eyes; a longer intro (~6.5 s) and success (~9 s); iron
  straps and aged brass; deeper sounds. All tuning lives in `src/feel.ts`.
- **Door split into sprite layers** (client request): `plateShadow`, `oak`, `frame`, `straps`,
  `brackets`, `ornaments`, `bezel` and `seam` replace the two plate-half images. Each piece can be
  swapped on its own, and the app splits the door into halves itself. `mistTile` is a sprite layer
  too (24 layers in all).
- **Starter sprite set** in `public/assets/test-sprites/`: every layer as its own PNG, identical to
  the procedural look, with `manifest.json` and a README listing each file's size and placement.
  `npm run test-sprites` fills in missing files and never overwrites replaced ones (unless
  `-- --force`). The sprite browser test now uses its own in-memory copy.
- **Client sprites in progress** (`public/assets/sprites/`, listed in `public/assets/manifest.json`):
  `Iris.png`, `lidTop.png`, `lidBottom.png`, `Oak.jpg` and `frame.png` are live in sprite mode
  (`/?skip-intro&sprites`). Open point: the new upper lid covers the top of the upper-left and
  upper-right numbers while the eye dozes. Fix either in the art (end the rim on the starter lid's
  curve) or by raising `lidTop`'s `pivotY` in the manifest.

- **2026-10-09 pickup** (see DECISIONS.md): the iris slides under a new `rim` layer; the active eye
  no longer flares or blinks; arrows show only on the wheel in use; the core swells and flies off
  the top at the end of Success (≈ 10 s now), and `core_hum` plays while it is visible. The unused
  `PlateLeft.jpg`/`PlateRight.jpg` were deleted.

## Next session

- Decide the `lidTop` overlap fix (art, manifest pivot or a lighter doze).
- Keep replacing layers; the starter set's README lists the remaining ones.

## Verification (final run)

| Check | Result |
| --- | --- |
| `npm run typecheck` | 0 errors |
| `npm test` | 107 passed; coverage `lockModel` 100%, `machine` 100% lines / 95.9% branches |
| `npm run build` | OK, 43 precached entries (≈ 1.2 MB) |
| `npm run e2e` | **44 passed** (M0–M10) |
| `npm run soak` | 8 simulated h, 23 solves, 1,783 actions, 0 errors; display objects 509 → 509, GPU 23.7 → 23.7 MB, heap 9.98 → 10.51 MB (levelling off as the capped logs fill) |
| Frame time (RTX 3060 laptop, DPR 2) | p95 ≈ 7–8 ms in Shrouded (dense mist), Playable and Open; JS update 0.33 ms/frame even at 4× CPU throttle |
| GPU memory | 20 MB playable, **39 MB peak** (Open, split snapshot alive); budget 150 MB |

Screenshots for every milestone are in `screenshots/` (M0–M10), each reviewed. Issues found in
review and fixed:

- letterbox scale at DPR 2
- stray arc lines in the wheel art
- a see-through plate fade
- mist that was too bright
- hard-edged core rays
- a doubled wake-lock request
- a GPU memory probe that crashed on destroyed textures
- an empty precache caused by duplicate workbox entries

## Known issues

- **Performance is measured on a desktop GPU, not the tablet.** All frame-time numbers come from a
  laptop RTX 3060 in headless Chrome. The Tab S11's GPU is strong, but mist overdraw at 2560×1600 is
  the main cost. If the tablet struggles, adaptive quality steps the resolution down (2 → 1)
  automatically. Confirm on the device (Needs client).
- **The soak ran in accelerated time.** 100× means each frame advances ~1.7 s of game time, so it
  proves state and memory stability rather than wall-clock behaviour (GPU driver, thermals, Chrome
  updates).
- **The plate filigree is simple.** It is procedural scrollwork that matches the reference's
  silhouette and light, not its engraved detail; the sprite pass is meant for that.
- **Missing sound files show 404s in the console.** The app is silent and unaffected, but each
  missing `public/sfx/*.ogg` shows a 404 in the console at boot.

## Needs client

1. **Feel on the real tablet:** drag responsiveness, arrow size, numeral legibility at arm's
   length, and the lid "drowsy" amount (top 0.42 / bottom 0.12).
2. **Real sound files** (`public/sfx/*.ogg`, names in `public/sfx/README.md`), plus a level check
   with the Sound test.
3. **Optional sprite art** (`public/assets/README.md`). Start with one wheel (ring, disc, iris,
   pupil, lids), as DESIGN.md suggests.
4. **A real 8-hour wall-clock run on the tablet** (charging, pinned, Stay awake on).
5. **Final config:** confirm the puzzle numbers, the start positions and the operator PIN (default
   `1907`).
6. **HTTPS hosting** for the one-time install (see `DEPLOY.md`).

## Manual test script for the real tablet (10 steps)

1. **Install:** open the HTTPS URL in Chrome, tap once, then Chrome ⋮ → *Install app*. Launch it
   from the home screen. ✔ Fullscreen landscape, dark mist, faint teal glimmers, no text, no
   browser UI.
2. **Offline:** Airplane mode on, swipe the app away, relaunch. ✔ The misty screen appears within a
   few seconds.
3. **Intro:** tap anywhere. ✔ The mist parts from your finger, the plate fades up, eyes open in a
   wave from that point, and wheels spin and click onto their start numbers (57 27 35 / 70 17 93 68
   / 91 74 43). Taps during the intro do nothing.
4. **Arrows:** on wheel 1, tap ↻ once, then ↺ twice quickly. ✔ Each tap moves exactly one number
   with a click, and the quick double tap queues just one extra step. Hit areas feel generous.
5. **Drag + multi-touch:** spin one wheel with a finger and release fast. ✔ It follows the finger
   and always snaps onto a number. Then have two or three people turn different wheels at the same
   time. ✔ All respond. Neighbours' eyes look toward the active finger, and the touched eye opens
   and follows it.
6. **Readability:** from a player's standing distance, read all ten numbers. ✔ 6 and 9 are
   underlined, and numbers are never hidden by drowsy lids.
7. **Asleep:** leave the tablet untouched for 60 s. ✔ Lids close in a ripple and the screen dims.
   Touch anywhere. ✔ It wakes instantly.
8. **Solve:** set 9, 12, 88, 14, 5, 3, 79, 0, 6, 31 (or use operator → *Show solution*, then
   *All wheels correct − 1* and one ↻ per wheel). ✔ On the last click: a short silence, all eyes
   stare, a clunk, the wheels sink and lock, the plate splits over the gold core with dust, and
   input is ignored.
9. **Reset:** wait. ✔ About 40 s after the plate has opened, the mist rolls back (≈ 3 s) and the
   misty screen returns. The next tap starts a fresh intro with the start numbers. You never see the
   wheels move back.
10. **Operator + power:** hold the bottom-left corner for 3 s (the ring appears only in the last
    second), enter a wrong PIN (the pad closes), then the right PIN. Run *Sound test*, set the
    volume, toggle the FPS meter (expect ~60 fps), and close. Reopen it to check the settings
    stuck, then leave the menu alone for 60 s (✔ it closes itself). Finally leave the tablet on
    the charger with the lock running for a full day. ✔ The screen never sleeps and the lock is
    still responsive at the end.
