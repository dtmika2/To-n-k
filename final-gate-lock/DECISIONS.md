# Decisions

Format: date — question → choice (reason).

## Decisions

- 2026-10-07 — Where is the repo? → The git repo already existed one level up (`Točník/`); the app
  lives in `final-gate-lock/`. Work happens on branch `build/final-gate-lock`, one commit per milestone
  (no need to re-init; branching keeps `main` clean).
- 2026-10-07 — When does the user validate M0–M5? → The user asked to build M0–M5, write
  PROGRESS.md, and then continue to M6–M10 once M0–M5 is validated. Validation = the section 0
  self-verification per milestone; the run continues without waiting (plan §0.1).
- 2026-10-07 — Playwright browser → The cached Playwright Chromium build did not match
  @playwright/test 1.63, so tests use the installed system Chrome (`channel: 'chrome'`). Headless
  Chrome gets the real GPU via ANGLE/D3D11 here, so frame-time numbers are meaningful.
- 2026-10-07 — Numeral typeface → Cinzel 700 (OFL), bundled through `@fontsource/cinzel` (woff2 is
  emitted into `dist/` and precached; no CDN). Classical Roman-inscription serif with lining digits,
  legible at 34 px. Blackletter faces were rejected because their digits are hard to read.
- 2026-10-07 — Offline test → Chrome's offline emulation and Playwright routing both block the
  navigation before the service worker sees it, so the M0 offline test starts a private preview
  server, lets the SW install, **kills the server**, then reloads. That is a true offline check.
- 2026-10-07 — vite-plugin-pwa `includeAssets` → removed. It duplicated files that `globPatterns`
  already covers, and workbox threw in `addToCacheList`, which silently left the precache empty.
- 2026-10-07 — Test timing flag → `?speed=N` scales the game clock. Every animation, sequence and
  game timer (reset hold, asleep, blink and glance intervals) runs on that clock, so one flag shortens
  everything consistently.
- 2026-10-07 — Placeholder SFX → synthesised at runtime with Web Audio behind `?placeholderSfx` (the
  plan allows "Web Audio or a script"); no placeholder files are shipped.

- 2026-10-07 — Operator hold feedback → §6.5 says "show nothing until 3 s elapses; then a subtle ring
  fills during the last second", which contradicts itself. Chosen: nothing for the first 2 s, a faint
  white ring fills during the 3rd second, then the PIN pad opens.
- 2026-10-07 — "Set all wheels to correct-minus-one" → taken literally: every wheel one slot before
  its correct one (one clockwise tap each, and the 10th tap opens the lock). The one-move-left
  case is the `?solve` dev flag.
- 2026-10-07 — Operator timings → the menu edits the four single-value timings in seconds (reset hold,
  asleep, settled→drowsy, operator hold); blink/glance ranges stay config-only (still overridable via
  the stored settings object). Menu auto-close and hold timing run on the game clock so `?speed`
  shortens them in tests.
- 2026-10-07 — Waking touch → the first touch after Asleep wakes the plate *and* acts normally
  (turns a wheel if it lands on one); swallowing it felt unresponsive.
- 2026-10-07 — Plate split → wheels 2 and 9 sit on the seam, so the plate (with wheels, after they
  have sunk and locked) is snapshotted into a texture and the two halves are masked sprites of it.
  The texture is destroyed on reset (verified over 20 loops).
- 2026-10-07 — Window wedge 10°–80° (r 24–71) instead of exactly 15°–75° → the plan says "around",
  and a two-digit numeral held upright inside a 60° wedge clipped at its corners. Numerals are 30
  logical px (60 device px on the tablet), sitting on a dark enamel band for contrast.
- 2026-10-07 — Lid curvature means fully-closed lids must overlap past the centre line (closure 1 = lid
  edge 0.35 R past centre) so no gap shows at the sides; drowsy = top 0.62 / bottom 0.22, which keeps
  the number readable while dozing.
- 2026-10-07 — Plate fade-in uses a near-black veil over the plate instead of plate alpha: container
  alpha in Pixi applies per child, which made the stacked eye layers see-through mid-fade.
- 2026-10-07 — Test sprite set ships in `public/assets/test-sprites/` (≈ 200 KB, precached) but is only
  used with `?manifest=assets/test-sprites/manifest.json`; the real `assets/manifest.json` starts
  empty as the plan says, so "sprites" mode with no client art = procedural fallback everywhere.
- 2026-10-07 — Hardening extras not in the plan: adaptive render resolution (2 → 1 in 0.25 steps
  after 3 consecutive 2 s windows averaging > 19 ms), reload on WebGL context loss, reload if the
  render loop stalls 15 s while visible, wake lock re-requested on any touch, state log capped.
- 2026-10-07 — Soak test runs on the game clock at 100× (8 simulated hours ≈ 6 real minutes) via
  `npm run soak`; a real 8-hour wall-clock run belongs on the tablet (Needs client).

## Deviations

- 2026-10-07 — **The iris plate rotates, not the numbered disc** (requested by the client after M10).
  PLAN §1/§5 had the disc turning under a fixed window. Now the disc and its numerals are fixed and
  always upright; the plate with the window turns (arrows and drag), and still shifts a few px with
  the eye. Consequences:
  - A clockwise turn moves the window onto the next clockwise slot, so `rotate(cw)` = slot + 1
    (was − 1). "Correct − 1" and `?solve` now need one ↻ tap per wheel.
  - The window rests at the bottom (55°–125°), and the other slots sit upper-left (210°) and
    upper-right (330°). This replaces the sketch's lower-right start (client choice), because one of
    three positions 120° apart always lands near the top of the eye.
  - Drowsy lids are now top 0.42 / bottom 0.12 (was 0.62 / 0.22), which is the most the lids can
    close while every number stays readable. Curious is 0.26 / 0.08. This is lighter than PLAN
    §6.2's "~60% closed".
  - The iris plate's own art is rotation-neutral (radial fill, even window rim). A new fixed layer,
    `irisShade`, carries the top-left light, so lighting doesn't spin with the plate.
- 2026-10-07 — **Heavier feel throughout** (requested by the client: "stone and iron, not paper").
  Every motion number now lives in `src/feel.ts`.
  - **Arrow step** is ~650 ms with a heavy-mass curve: a slow start, then it lands still moving (a
    hard stop), with a 1.3° recoil and a thud (the wheel dips into its socket with a ~1 px jolt).
    PLAN §6.1 said 250 ms ease-out with overshoot.
  - **Drag** no longer follows the finger 1:1 (§6.1). The plate trails through a critically damped
    spring (lag ≈ 80 ms) and a notch field (sticky near each number, quicker between). On release
    the finger's flick picks the slot (still at most one extra) and the plate carries its own
    momentum there, in 450–800 ms.
  - **Intro** ≈ 6.5 s (§6.3 says ~5 s): fewer, heavier turns that wind down with a hard stop.
  - **Success** ≈ 9 s (§6.4 says ~7 s), with a 0.6 s held breath (was 0.4 s), a low whole-screen
    jolt, collars that slam with no bounce, and a break-free shove before a slow grinding split.
    The 40 s hold and 3 s reset are unchanged.
  - **Eyes are slower too** (blink 280 ms, lid and look rates roughly halved, longer glances). This
    goes against DESIGN.md's "eyes fast", at the client's request.
  - **Look:** aged, darker brass (palette changed from PLAN §9's #B8913A); wrought-iron straps,
    rivets and corner brackets on the oak; deeper socket shadows and bevels; heavier arrow buttons
    that travel when pressed.
  - **Placeholder sounds** are lower and heavier (clunks, grinding, a slow ratchet).
