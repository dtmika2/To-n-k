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

## Deviations

(none yet)
