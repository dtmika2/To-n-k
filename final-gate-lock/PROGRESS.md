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
- **M2 — One wheel, procedural.** Ring/socket, disc with an enamel band and Cinzel numerals (upright
  at rest; 6 and 9 underlined), iris with the wedge cut out, teal pupil and highlight, rigid lids
  masked to the eye, additive glow, and brass arrow buttons with pressed states. Every layer goes
  through `LayerFactory`. Arrow taps step one slot (250 ms ease-out-back, one queued tap); drag
  follows the pointer angle 1:1 and snaps with flick velocity (at most one extra slot). Dev page
  `/wheel.html`. Playwright: arrows, queue, slow drag, flick, and 12 random drags all land on a
  slot. Frame time during drags: p95 7.1 ms.
- **M3 — Ten wheels + win.** `Game` wires model, machine, wheels, input and sound. The procedural
  plate is an oak panel with riveted brass trim, bezels, filigree and a centre seam; it is drawn once
  and shown as two masked halves, ready for the split. The wheels sit in the 3-4-3 layout. The win
  check runs only on settle and only when all wheels are at rest. Placeholder success = flash.
  Playwright: solves the lock with arrows (→ Success); five simultaneous CDP touch pointers own five
  different wheels and each turns one slot; no win while the last wheel is still held; dead-zone
  taps do nothing.
