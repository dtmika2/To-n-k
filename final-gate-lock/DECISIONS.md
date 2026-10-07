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
  its correct one (one counter-clockwise tap each, and the 10th tap opens the lock). The one-move-left
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

## Deviations

(none yet)
