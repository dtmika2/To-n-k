# Final Gate Lock — Build Plan

A single-purpose PWA for a Samsung Galaxy Tab S11 that acts as the last lock of an escape room.
Ten brass "eye" wheels on a medieval castle plate. Each wheel hides three numbers behind an
eye-shaped shutter; players rotate the wheels until all ten show the right number, and the lock opens.

This file is the source of truth for the build. **Build all milestones M0–M10 in one unattended run**
following the protocol in section 0. Do not stop to ask questions.

---

## 0. Autonomous run protocol

1. **Never wait for the human.** The client is not watching. When something is unclear, choose the
   option that best fits this plan and `docs/DESIGN.md`, record it in `DECISIONS.md` (date, question,
   choice, reason), and continue.
2. **Fixed decisions (section 1) are not up for change.** If one turns out to be technically
   impossible, implement the closest possible version, log it in `DECISIONS.md` under "Deviations",
   and continue.
3. **Self-verify each milestone before moving on:** `npm run typecheck`, `npm test`, `npm run build`,
   the milestone's Playwright checks, and a screenshot saved to `screenshots/Mx-*.png`. Look at the
   screenshot yourself and fix what looks wrong. Only then start the next milestone.
4. **If a check keeps failing** after 3 honest fix attempts, log it in `PROGRESS.md` under "Known
   issues" with what you tried, keep the app runnable, and move on. Never leave the build broken.
5. **Git:** initialise a repo at the start; commit after each milestone with message `Mx: <summary>`.
6. **Things only the client can do** (feel on the real tablet, real sound files, real sprites) are
   never blockers: use placeholders and list them in `PROGRESS.md` under "Needs client".
7. **Finish** by writing `PROGRESS.md`: what was built, how to run it, the dev URL flags, known
   issues, needs-client list, and a 10-step manual test script for the real tablet.

Supporting material:
- `docs/DESIGN.md` — art direction, the reasoning behind the eye/sprite approach, sprite production
  guidance and the mood of each moment. Read it before M2 and before M9.
- `docs/reference/` — the client's mechanism sketch and the brass-disc quality reference. Look at both
  before drawing the wheel.
If `docs/DESIGN.md` and this plan disagree, this plan wins; flag the conflict.

---

## 1. Fixed decisions

| Topic | Decision |
| --- | --- |
| Platform | PWA, offline-first, runs fullscreen in landscape on a Galaxy Tab S11 (16:10), Chrome on Android |
| Input | Touch only. Multi-touch: several players may turn different wheels at once |
| Wheels | 10 wheels in rows of 3 / 4 / 3. Each wheel has exactly 3 positions (slots), 120° apart |
| Rotation | Two arrows above each wheel (counter-clockwise left, clockwise right) turn one slot per tap. Dragging anywhere on the wheel disc spins it; on release it snaps to the nearest slot |
| Win rule | Lock opens the moment all 10 wheels rest on their correct slot. No confirm button, no wrong-answer feedback |
| Text | No text on the play screen, ever. Text is allowed only in the operator menu |
| States | Shrouded (mist, wait for tap) → Intro → Playable → Success → Open (hold) → Reset → Shrouded |
| Reset | 40 s after the success sequence ends, mist rolls back and the app returns to Shrouded |
| Start positions | Fixed per wheel (see config). Shown by an intro spin that settles on them |
| Look | Procedural first (drawn in code). Every visual layer can later be replaced by a sprite via a manifest, one layer at a time |
| Eyes | The wheel IS the eye. Only wheel eyes, no central eye. Untouched eyes have idle behaviour |
| Sound | Tablet speaker only. SFX files supplied by the client later; app must run silently if any file is missing |
| Integration | None. No network calls at runtime |
| Operator mode | Hold bottom-left corner 3 s → PIN pad → plain menu |
| Power | Tablet always charging. Keep the screen awake |

---

## 2. Tech stack

- **Vite + TypeScript** (strict).
- **PixiJS v8** for rendering (WebGL). Reason: the same display-object tree can be drawn with
  `Graphics` (procedural) or `Sprite` (images), with identical transforms, masks, filters and blend
  modes. This is what makes the procedural→sprite switch cheap.
- **No UI framework** on the play screen. The operator menu may be plain DOM over the canvas.
- **Web Audio API** via a small in-house `AudioManager` (no Howler needed, but acceptable if simpler).
- **vite-plugin-pwa** (Workbox) for the service worker and manifest; precache everything.
- **Vitest** for unit tests of pure logic. **Playwright** (Chromium is preinstalled in dev environments)
  for smoke tests and screenshots.
- Tweening: a tiny in-house tween/timeline helper or `gsap` (core, free). Prefer one tool consistently.

---

## 3. Coordinate system and layout

- Logical canvas **1280 × 800**. Scale uniformly to fit the screen (letterbox with background colour
  if the aspect differs). All layout numbers below are logical px.
- Plate: centred, roughly 1180 × 740 with a rounded brass border.
- Wheel diameter ≈ 180. Rows centred horizontally:
  - top row (3): wheels 1–3
  - middle row (4): wheels 4–7, offset so they sit between the wheels of the rows of three
  - bottom row (3): wheels 8–10
- Arrows: two per wheel, just above it, left = CCW, right = CW. Drawn icon may be small but each
  **hit area ≥ 56 × 56**.
- Keep a 120 × 120 dead zone in the bottom-left corner free of interactive elements (operator gesture).
- Put all layout numbers in `layout.ts` so they can be tuned without touching render code.

---

## 4. Config (`public/config.json`, loaded at boot, overridable in operator menu only for timings)

```json
{
  "wheels": [
    { "id": 1,  "row": "top",    "slots": [57, 23, 9],  "correct": 2, "start": 0 },
    { "id": 2,  "row": "top",    "slots": [12, 63, 27], "correct": 0, "start": 2 },
    { "id": 3,  "row": "top",    "slots": [35, 88, 48], "correct": 1, "start": 0 },
    { "id": 4,  "row": "middle", "slots": [52, 70, 14], "correct": 2, "start": 1 },
    { "id": 5,  "row": "middle", "slots": [82, 5, 17],  "correct": 1, "start": 2 },
    { "id": 6,  "row": "middle", "slots": [3, 93, 24],  "correct": 0, "start": 1 },
    { "id": 7,  "row": "middle", "slots": [68, 45, 79], "correct": 2, "start": 0 },
    { "id": 8,  "row": "bottom", "slots": [0, 91, 38],  "correct": 0, "start": 1 },
    { "id": 9,  "row": "bottom", "slots": [74, 6, 58],  "correct": 1, "start": 0 },
    { "id": 10, "row": "bottom", "slots": [29, 43, 31], "correct": 2, "start": 1 }
  ],
  "timings": {
    "resetAfterSuccessMs": 40000,
    "asleepAfterIdleMs": 60000,
    "blinkIntervalMs": [4000, 9000],
    "glanceIntervalMs": [6000, 14000],
    "settledToDrowsyMs": 2000,
    "operatorHoldMs": 3000
  },
  "operator": { "pin": "1907" },
  "visual": { "mode": "procedural", "manifest": "assets/manifest.json" },
  "audio": { "masterVolume": 0.9 }
}
```

Notes:
- Slot indices are **0-based** and run **clockwise** around the disc. `correct` and `start` are slot
  indices. Correct numbers in wheel order: 9, 12, 88, 14, 5, 3, 79, 0, 6, 31.
- Validate config at boot (zod or hand-written): 10 wheels, 3 slots each, all 30 values unique,
  `start !== correct` on every wheel. On failure show a red error screen with the reason (this is the
  one exception to "no text"; it never happens in production).
- "6" and "9" are both correct numbers: render single-digit 6 and 9 with an underline or a dot so they
  can't be confused, and keep every numeral upright when it rests in the window.

---

## 5. Architecture

```
src/
  main.ts               boot: load config, validate, create Pixi app, start state machine
  config.ts             types + validation
  layout.ts             all positions/sizes
  state/
    machine.ts          Shrouded | Intro | Playable | Success | Open | Reset
    lockModel.ts        pure: wheel positions, rotate(id, dir), setSlot, isSolved — unit-tested
  wheel/
    Wheel.ts            container: owns layers, input, snapping, eye controller
    WheelInput.ts       arrows + drag (pointer capture per pointerId), snap logic
    Eye.ts              pupil tracking, lids, idle behaviours (state per wheel)
  scene/
    Background.ts       wall + mist (particles / noise)
    Plate.ts            plate halves, filigree, rivets
    IntroSequence.ts
    SuccessSequence.ts
    ResetSequence.ts
  render/
    layers.ts           LayerFactory: returns Graphics (procedural) or Sprite (from manifest)
    procedural/*.ts     one draw function per layer id
  audio/AudioManager.ts
  operator/OperatorMenu.ts   DOM overlay, PIN pad, actions
  util/                 tween/timeline, random ranges, wake lock
public/
  config.json
  assets/manifest.json  layer id → { file, width, height, pivotX, pivotY }  (empty to start)
  assets/sprites/       (empty to start)
  sfx/                  (client supplies files; see section 7)
```

Key rules:
- **`lockModel` is pure and owns the truth.** Rendering reads from it; input writes to it via
  `rotate`/`setSlot`. Win check runs only when a wheel *settles* (after snap animation), never mid-drag.
- **Animation lives in code, never in assets.** Sprites only replace how a layer is drawn.
- Every visual layer is created through `LayerFactory.create(layerId)`. If the manifest has a file for
  that id and `visual.mode === "sprites"`, return a Sprite; otherwise call the procedural draw function.
  Missing sprite = silent procedural fallback, logged once to console.
- Each wheel's eye state is independent. Idle randomness must never depend on whether the wheel is
  correct (no leaking the answer).

### Wheel layer stack (bottom → top), all centred on the wheel pivot

| Layer id | What | Moves |
| --- | --- | --- |
| `ring` | Stone socket + brass rim, fixed frame | Sinks on unlock |
| `disc` | Brass number disc; three numerals drawn in code at 120° spacing | Rotates (the only part that turns) |
| `iris` | Opaque iris plate with a **wedge cutout** (the only window onto the disc), radial pattern | Shifts a few px toward finger |
| `pupil` + `highlight` | Dark pupil and white glint at centre | Follow finger, scale for dilation |
| `lidTop`, `lidBottom` | Eyelids, masked to the eye circle | Slide to blink / droop |
| `glow` | Teal radial light (always procedural, additive blend) | Pulses |

The cutout (window) sits in the lower-right of the iris, around 15°–75° (clockwise from 3 o'clock),
matching the client sketch. The pupil stays in the centre, outside the window, so it never hides the
number. Lids cover the whole eye including the window when fully closed.

Arrows (`arrowCw`, `arrowCcw`, with pressed states) are separate layers above the wheel.

---

## 6. Behaviour specs

### 6.1 Rotation
- Arrow tap: rotate one slot in that direction, 250 ms ease-out with a small overshoot, then click.
  Taps during an animation queue at most one extra step.
- Drag: on `pointerdown` within the disc radius, capture that pointer; the disc follows the change in
  pointer angle around the wheel centre (1:1). On release, snap to the nearest slot (consider velocity:
  a fast flick may advance one extra slot). A wheel is owned by one pointer at a time.
- Each slot change during a drag plays a soft tick; the final settle plays the detent click.
- Support ≥ 5 simultaneous pointers on different wheels.

### 6.2 Eye states (per wheel)
| State | When | Look |
| --- | --- | --- |
| Drowsy | Default | Lids ~60% closed, slow breathing scale on pupil |
| Blink | Random every 4–9 s per wheel, never all at once | Quick close/open (~150 ms) |
| Glance | Random every 6–14 s | Iris+pupil drift to a nearby point for ~1 s, return |
| Curious | Another wheel is being touched | Neighbouring eyes open a bit and look toward it |
| Awake | This wheel is touched | Lids fully open, pupil tracks the finger (clamped to an ellipse; pupil moves ~1.3× iris for depth), glow up |
| Settled | Wheel just clicked into a slot | One blink, back to Drowsy after 2 s |
| Asleep | No touch anywhere for 60 s | Lids close in a ripple across the plate; screen dims via a 60% black overlay; any touch wakes |

### 6.3 Intro (Shrouded → Playable, ~5 s)
1. Shrouded: drifting mist only, faint teal glimmers where wheels will be.
2. First tap anywhere: resume AudioContext, mist parts outward from the tap point, plate fades up (0–2 s).
3. Eyes open one by one in a wave from the tap point, each with a slow blink (1–3 s).
4. All wheels spin fast and decelerate with clicks onto their `start` slots, staggered (2–5 s).
5. Unlock input; eyes go to Drowsy.
Input is ignored during the sequence.

### 6.4 Success (~7 s), then Open, then Reset
1. Last wheel settles correct → 0.4 s of silence (duck ambience).
2. All eyes open wide at once, pupils snap to centre, teal glow pulse across the plate.
3. Heavy clunk; wheels sink into the plate, brass rings slide inward and lock (1–3 s).
4. Plate splits into halves that slide apart, revealing a glowing gold core; dust particles fall (3–6 s).
5. **Open** state holds: halves apart, core glowing, eyes closed peacefully, core hum loop.
6. 40 s after step 5 begins (= after the success sequence ends): mist rolls back over everything (3 s),
   switch to Shrouded, reset `lockModel` to start slots off-screen. Players never see wheels move back.
Input is blocked from step 1 until Shrouded.

### 6.5 Operator mode
- Trigger: hold a pointer inside the bottom-left 120 × 120 zone for 3 s (show nothing to players
  until 3 s elapses; then a subtle ring fills during the last second).
- PIN pad (DOM overlay, plain, high contrast). Wrong PIN closes the pad.
- Menu actions: Reset to Shrouded · Force open (run success) · Show solution (overlay the correct
  number on each wheel while menu is open) · Set all wheels to correct-minus-one (for testing the last
  move) · Sound test (play each cue) · Master volume · Visual mode (procedural / sprites) · FPS meter
  on/off · Close.
- Settings changed here persist in `localStorage` (wrapped in try/catch); config.json stays the default.
- Menu auto-closes after 60 s without input.

### 6.6 Kiosk and power
- Manifest: `display: "fullscreen"`, `orientation: "landscape"`, dark `background_color`/`theme_color`.
- Request a Screen Wake Lock on first tap; re-request on `visibilitychange`.
- Block pinch-zoom, double-tap zoom, long-press context menu, text selection, pull-to-refresh,
  overscroll (CSS `touch-action: none`, `user-select: none`, `overscroll-behavior: none`, viewport meta).
- Document the tablet setup in `DEPLOY.md`: install PWA from Chrome, Android screen pinning (or a kiosk
  browser), developer option "Stay awake while charging", disable notifications / Do Not Disturb,
  auto-rotate locked.

---

## 7. Audio

`AudioManager` decodes all files at boot (allowed before a gesture), resumes the context on the first
tap. Missing or undecodable files → that cue is silent, warn once. Variants are picked randomly without
immediate repeats. Files: `public/sfx/<name>.ogg` (variants `<name>_1.ogg`, `<name>_2.ogg`…).

| Cue | Trigger | Loop | Variants |
| --- | --- | --- | --- |
| `mist_loop` | Shrouded + Playable ambience | yes | 1 |
| `reveal_whoosh` | First tap | | 1 |
| `eye_open` | Each eye opening in intro | | 3 |
| `spin_ratchet` | Intro wheel spin | | 1 |
| `detent_click` | Wheel settles in a slot | | 3 |
| `arrow_tap` | Arrow pressed | | 2 |
| `drag_tick` | Slot boundary crossed during drag | | 2 |
| `eye_blink` | Blink (low volume, max 1 per 2 s globally) | | 3 |
| `idle_whisper` | Random every 30–60 s in Playable | | 4 |
| `success_stinger` | Success step 1–2 | | 1 |
| `lock_clunk` | Success step 3 | | 1 |
| `plate_slide` | Success step 4 | | 1 |
| `dust_fall` | Success step 4 | | 1 |
| `core_hum` | Open state | yes | 1 |
| `reset_wind` | Reset mist | | 1 |
| `operator_beep` | Operator actions | | 1 |

For development, generate short placeholder tones with Web Audio or a script into `public/sfx/_placeholder/`
and use them when the real file is missing, behind a `?placeholderSfx` flag.

---

## 8. Milestones

Run them in order without pausing. Each milestone ends with the self-verification in section 0
(typecheck, tests, build, Playwright checks, screenshot reviewed), a commit, and a short note in
`PROGRESS.md`. "Feels smooth on a touchscreen" criteria are checked in Chrome device emulation with
synthetic pointer events and a frame-time measurement; the real-tablet check goes on the
"Needs client" list.

**M0 — Scaffold.** Vite + TS + Pixi + vite-plugin-pwa. Fullscreen canvas at 1280×800 logical,
letterboxed. Touch/zoom lockdown CSS. Config load + validation + error screen. Dev URL flags:
`?debug` (FPS, hit areas), `?skip-intro`, `?solve` (start one move from solved), `?placeholderSfx`.
*Done when:* app installs as PWA and loads offline; invalid config shows the error screen.

**M1 — Lock model + state machine.** Pure `lockModel` and `machine` with unit tests: rotate wraps
0↔2, solved only when all 10 correct, start state never solved, state transitions and timers
(use fake timers).
*Done when:* ≥ 95% coverage of these two files.

**M2 — One wheel, procedural.** Ring, disc with numerals, iris with wedge cutout (mask), pupil,
lids, arrows. Arrow taps + drag + snap. Numerals upright in the window, 6/9 marked. Dev page
`/wheel.html` shows a single large wheel.
*Done when:* on a touchscreen (or Chrome device emulation) rotation feels smooth at 60 fps and
always snaps to one of 3 slots.

**M3 — Ten wheels + win.** 3-4-3 layout on the plate, multi-touch, win detection on settle. Placeholder
success = flash.
*Done when:* Playwright test drives arrows to solve the lock and the state becomes Success; 5 parallel
synthetic pointers on different wheels work.

**M4 — Eyes alive.** All eye states from 6.2, including Curious and Asleep + dim overlay.
*Done when:* no two wheels blink in the same frame over a 5-minute run; idle behaviour identical
whether a wheel is correct or not (code review check).

**M5 — Background + intro.** Wall, drifting mist, Shrouded screen, full intro sequence.

**M6 — Success, Open, Reset.** Full sequence from 6.4 including plate split, core, dust, 40 s hold
timer, reset back to Shrouded with wheels on start slots.
*Done when:* full loop Shrouded → solve → Open → Shrouded runs 20 times in a row in Playwright
(with timings shortened via a test flag) without memory growth (check heap in DevTools).

**M7 — Audio.** AudioManager, all cues wired, placeholder fallback, ducking at success.

**M8 — Operator mode.** Gesture, PIN, every menu action, persistence, auto-close.

**M9 — Sprite pipeline.** `LayerFactory`, `manifest.json`, mode switch, per-layer fallback. Add a test
set of simple placeholder PNGs for the wheel layers to prove pivots and masks line up identically to
the procedural layers (screenshot diff with tolerance).
*Done when:* switching modes in the operator menu changes the look without changing any motion, and
removing any single sprite falls back cleanly.

**M10 — Hardening.** Performance budget (60 fps with all eyes idle and mist; texture memory < 150 MB),
wake lock, offline after reboot, 8-hour soak test in Playwright with periodic synthetic play, `DEPLOY.md`.

---

## 9. Art direction cheat sheet (procedural version)

- Palette: oak `#2B1B12`, brass `#B8913A` (shadow `#6E5220`), stone socket `#3A3A40`,
  parchment numerals `#E8D9B0`, accent teal glow `#7FE3D4` (pupils, mist, unlock light only),
  near-black wall. Warm everywhere except the teal.
- One light source from the top-left; bevels and shadows consistent on every layer.
- Numerals: a serif manuscript-style typeface bundled locally (e.g. a free blackletter-inspired or
  old-style serif with clear digits; must be legible at ~40 px). No webfont from a CDN — offline.
- Motion: mechanical parts slow with slight overshoot; eyes fast and a bit unpredictable.
- Quality target for the later sprite pass: the client's reference image (brass discs on an engraved
  plate). Procedural version matches silhouette and lighting, not texture detail.

---

## 10. Out of scope (for now)

Room-control integration, multiple languages, analytics, remote management, hint system beyond the
operator "show solution".
