# Progress

## Milestone notes

- **M0 — Scaffold.** Vite 8 + TypeScript (strict) + PixiJS 8 + vite-plugin-pwa. 1280×800 logical
  canvas, letterboxed. Touch lockdown CSS and viewport. Config load and validation with a red error
  screen. Dev flags parsed. PWA manifest (fullscreen, landscape) and generated icons. Playwright
  verifies boot, the error screen, manifest/icons and a true-offline reload.
- **M1 — Lock model + state machine.** Pure `lockModel` (rotate/setSlot/isSolved, operator presets)
  and `machine` (all six states, the 40 s Open hold timer, idle → asleep). Timers are injected, so
  tests use Vitest fake timers and the app uses the speed-scalable game clock. Coverage of both
  files: 100% lines/functions, 98.6% branches.
