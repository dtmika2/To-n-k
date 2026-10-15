# Phase 1 checkpoint: Dream Pattern

Milestones 1–6 from `PLAN.md` are done. Phase 2 (milestones 7–10) waits for the owner's go-ahead.

## Done
1. **Scaffold:** Vite 8, TypeScript, PixiJS 8 and vite-plugin-pwa, with the same versions as `final-gate-lock`. Full-screen canvas, `src/config/settings.ts`, and a debug overlay.
2. **Pattern tooling:**
   - `src/config/pattern.json` holds a generated placeholder layout for the placeholder sequence. It validates with 0 errors and 0 warnings.
   - `npm run validate` checks every §8 rule.
   - `npm run assign-pitches` produces exactly the plan's assignment: 0 = A3, 15 = A4, C4…G5 for the used points in order of first appearance, and E3/G3/A5…E6 for the unused points.
3. **Reducer:** `src/game/reducer.ts` is a pure `(state, event, now) → { state, effects }` that covers INTRO, GAME, REVEAL and IDLE plus all the GAME substates. There are 45 unit tests in total, and they cover every case in §11.
4. **Input and debug rendering:**
   - Input locks onto one pointer with pointer capture and uses coalesced samples.
   - Hit testing is segment-to-circle, processed in order along the path, with hysteresis.
   - Debug primitives show both hit radii, plain lines and the tether, fraying (colour, jitter and gaps), retract, collapse rewind, and the master ring.
   - Minimal versions of INTRO, REVEAL (placeholder "5" until the PNG exists), IDLE and the inactivity reset are in place.
5. **Audio:**
   - A theremin voice (PeriodicWave plus a +3 ct sine) with delayed vibrato, snap and drag glides, and a speed swell.
   - Event sounds: wrong-note bend with wobble, unsettled vibrato, collapse glide, reveal pad, and the intro drone.
   - The chain is lowpass → generated-IR reverb → limiter.
6. **Layout editor (E key):**
   - Drag points; the wheel or `[` `]` changes r.
   - Record a sequence by clicking points; Backspace undoes a step.
   - The validator and pitch assignment run live.
   - Export options: Apply to game, Download JSON, Copy JSON, and **Save to project** (dev server only, writes `src/config/pattern.json`).

## Run it
```
npm install
npm run dev            # http://localhost:5173  (add ?debug for the overlay, ?rotate=90 to test rotation)
npm run verify         # typecheck + tests + validate + build
```
Keys: `D` debug overlay · `E` editor · `R` reset to INTRO · `1`–`4` jump to INTRO / GAME / REVEAL / IDLE.
The mouse works like a finger.

## Worth tuning on the real TV
- **Hit radii:** `hit.correctScale` (1.5), `wrongScale` (0.6), `exitHysteresis` (1.25), and point `r` (0.045 of the portrait width ≈ 4.2 cm on a 75″).
- **Timings:** `demoStepMs`/`demoNoteMs` (900/600), `demoLeadMs` (900), and `liftStrikeMs` (4000).
- **Audio:** `masterGain` 0.7, `voiceLevel` 0.32, `speedSwell` 0.18, `reverbWet` 0.35, `introDroneLevel` 0.035, `padLevel` 0.08. The limiter sits at −6 dB.
- `master` position and size (top centre, y = 0.06).

## Deviations and open questions
- **Timers live in the reducer.** The demo steps and the collapse, reveal and cloud-return durations run off `TICK` + `now`, so they are testable. `DEMO_DONE` and `ANIM_DONE` still exist and end those phases early.
- **Hit testing is in the reducer.** Master-button hits are tested there too; `MASTER_PRESSED` is also accepted.
- **New settings:**
  - `timing.demoLeadMs`: a pause before the first demo blink.
  - `master` (position and size), `reveal.placeholderText`, `validator.segmentMargin` (0.015) and `edgeWarnFraction`.
  - `audio.voiceLevel`, `speedSwell`, `introDroneLevel` and `padLevel`.
- **Fray intensity restarts each interval.** It ramps 0→1 within each 4 s lift interval, as written in the plan, so after the first lift strike the line looks "fresh" again. A monotonic version (closeness to collapse) might read better. Owner's call.
- **Retouch must start on the point.** In LIFTED, a touch that lands elsewhere stays ignored even if it then slides onto the last point. The same applies in READY for the start point.
- **Unsettled sound fades by time.** It fades over time since the lift (≈2.5 s time constant); the vibrato follows the fray intensity.
- **Inactivity can't hit TRACING.** "30 s inactivity from every substate" cannot apply there while the finger is down (a held pointer counts as activity), so the test checks that it does *not* time out.
- **Kiosk browser not tested yet.** Smoke-tested in headless Chrome: the full trace → REVEAL → IDLE, wrong strike, lift strikes → collapse → READY, `?rotate=90` input mapping, and the editor, with no console errors. Real-touch, palm and audio checks still need the TV.
- **Phase 1 visuals are debug primitives,** so text labels show only in debug mode or the editor.
