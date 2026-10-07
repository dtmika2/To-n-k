# Progress

**Status: M0–M5 built and self-verified (checkpoint). M6–M10 follow in the same run.**

## How to run

```bash
cd final-gate-lock
npm install
npm run dev          # http://localhost:5173  (no service worker in dev)
npm run build        # production build → dist/ (PWA, precached)
npm run preview      # http://localhost:4173  (serves dist/, service worker active)
npm run typecheck    # tsc --noEmit (strict)
npm test             # Vitest unit tests (npm run test:cov for coverage)
npm run e2e          # Playwright against `npm run preview` (system Chrome, channel "chrome")
```

Dev page: `/wheel.html` shows a single large wheel for tuning the look and the feel.

### Dev URL flags

| Flag | Effect |
| --- | --- |
| `?debug` | FPS / frame-time meter, hit-area outlines (arrows, discs, operator zone, seam) |
| `?skip-intro` | Boot straight into Playable |
| `?solve` | Start one move from solved (wheel 10 needs one counter-clockwise step) |
| `?placeholderSfx` | Synthesised placeholder tones for missing sound files (M7) |
| `?speed=N` | Run every animation and timer N× faster (tests) |
| `?config=path.json` | Load an alternative config (tests; same-origin relative paths only) |
| `?sprites` / `?procedural` | Force the visual mode for this session |

## Milestone notes

- **M0 — Scaffold.** Vite 8 + TypeScript (strict) + PixiJS 8 + vite-plugin-pwa. 1280×800 logical
  canvas, letterboxed. Touch lockdown CSS and viewport. Config load and validation with a red error
  screen. Dev flags parsed. PWA manifest (fullscreen, landscape) and generated icons. Playwright
  verifies boot, the error screen, manifest/icons and a true-offline reload (server killed).
- **M1 — Lock model + state machine.** Pure `lockModel` (rotate/setSlot/isSolved, operator presets)
  and `machine` (all six states, the 40 s Open hold timer, idle → asleep). Timers are injected, so
  tests use Vitest fake timers and the app uses the speed-scalable game clock. Coverage of both
  files: 100% lines/functions, ≥95.9% branches.
- **M2 — One wheel, procedural.** Ring/socket, disc with an enamel band and Cinzel numerals (upright
  at rest; 6 and 9 underlined), iris with the wedge cut out, teal pupil and highlight, rigid lids
  masked to the eye, additive glow, and brass arrow buttons with pressed states. Every layer goes
  through `LayerFactory`. Arrow taps step one slot (250 ms ease-out-back, one queued tap); drag
  follows the pointer angle 1:1 and snaps with flick velocity (at most one extra slot). Playwright:
  arrows, queue, slow drag, flick, and 12 random drags all land on a slot. Frame time during drags:
  p95 7.1 ms.
- **M3 — Ten wheels + win.** `Game` wires model, machine, wheels, input and sound. The procedural
  plate is an oak panel with riveted brass trim, bezels, filigree and a centre seam; it is drawn once
  and shown as two masked halves, ready for the split. The wheels sit in the 3-4-3 layout. The win
  check runs only on settle and only when all wheels are at rest. Playwright: solves the lock with
  arrows (→ Success); five simultaneous CDP touch pointers own five different wheels and each turns
  one slot; no win while the last wheel is still held; dead-zone taps do nothing.
- **M4 — Eyes alive.** All eye states from §6.2: drowsy (breathing pupil), blink (via a global
  gate), glance, curious (neighbours within 430 px look at the touched wheel), awake (pupil tracks the
  finger, clamped to an ellipse, pupil 1.3× iris), settled (one blink, drowsy after 2 s), and asleep
  (lid ripple across the plate + 60% dim; any touch wakes). Over 5 simulated minutes in the browser
  (460 blinks), 0 frames had two eyes blinking. Code-review check: `Eye` never sees correctness; a
  unit test enforces it by checking the source.
- **M5 — Background + intro.** Procedural stone wall, top-left light pass over the plate, drifting
  procedural mist (density blend, part from a point, roll back from the edges), and teal glimmers.
  Shrouded = near-black veil + mist + glimmers. The intro follows §6.3 exactly: mist parts from the
  tap, the plate fades up (0–2 s), eyes open in a wave from the tap with a slow blink (1–3 s), and
  the wheels spin and decelerate with clicks onto their start slots (2–5 s). Measured: 5004 ms;
  input ignored throughout. Idle frame time with mist and all eyes: p95 7.1 ms.

## Verification at the M5 checkpoint

- `npm run typecheck`: 0 errors
- `npm test`: 82 passed. Coverage: `lockModel` 100%, `machine` 100% lines / 95.9% branches, `Eye`
  99.4% lines.
- `npm run build`: OK (PWA, precache)
- `npm run e2e`: 22 passed (M0–M5)
- Screenshots: `screenshots/M0-*` … `screenshots/M5-*`, each reviewed. Fixes made after review:
  wrong letterbox scale at DPR 2, stray arc lines in the wheel art, a see-through plate fade
  (replaced with a veil), and overly bright mist.

## Known issues

- None blocking. The plate filigree is simple procedural scrollwork. It matches the silhouette and
  light of the reference, not its engraved detail; the sprite pass (M9) is meant to raise that.

## Needs client

- Feel on the real Galaxy Tab S11 (drag responsiveness, arrow size, readability of the numerals at
  arm's length). It is verified only in Chrome device emulation with synthetic touch.
- Real sound files (`public/sfx/*.ogg`). The app runs silently without them.
- Final sprite art (optional; the procedural look is complete on its own).
- **M6 — Success, Open, Reset.** Full §6.4: 0.4 s ducked silence → all eyes wide and centred with a
  teal pulse → clunk, wheels sink and brass lock collars contract onto them, eyes close peacefully →
  the plate (with wheels, which straddle the seam) is snapshotted into a texture and its two halves
  slide apart over a gold core with soft god rays, while dust falls from the parting edges → Open
  holds (core hum, slow dust) → after 40 s the mist rolls back, the veil closes, and only then is
  everything restored and the snapshot texture destroyed. Measured: success 7.08 s, hold 40.13 s,
  reset 3.05 s. 20 full loops at 20×: display objects constant (507), 0 live snapshot textures,
  0 motes, heap 11.9 → 12.4 MB (the state log is now capped).
- **M7 — Audio.** `AudioManager` (Web Audio): decodes all cues at boot and resumes the context on the
  first tap (and on every press, in case Chrome suspended it). Ambience and effects run on separate
  buses; ducking at success affects only the ambience. Variants never repeat back to back, and each
  cue has a voice limit. Missing or undecodable file → silent (warned once), or a synthesised
  placeholder with `?placeholderSfx`. All 16 cues are wired: mist loop, whoosh, eye opens, ratchet,
  clicks, ticks, blinks (≤ 1 per 2 s), whispers every 30–60 s, stinger, clunk, slide, dust, core hum
  and reset wind. Playwright covers: silent with no files, real file wins over placeholder, context
  resumes on tap, duck and every cue through a full success, and loops swapped correctly on reset.
  File list for the client: `public/sfx/README.md`.
- **M8 — Operator mode.** Hold the bottom-left 120×120 zone for 3 s: nothing for 2 s, a faint ring
  fills in the last second, and leaving the zone or lifting cancels. A DOM PIN pad follows (wrong PIN
  closes it), then a plain high-contrast menu: Reset to Shrouded, Force open, Show solution (overlay
  only while the menu is open), All wheels correct − 1, Sound test, Master volume, Visual mode, FPS
  meter, timings, Close. Settings persist in localStorage (try/catch, sanitised; config.json stays
  the default) and the menu auto-closes after 60 s without input. Playwright covers each item,
  including persistence across a reload.
