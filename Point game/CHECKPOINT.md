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

---

# Phase 2: look, feel and deployment

The owner confirmed without feedback, so the Phase 1 settings and behaviour were kept as they were.

## Done
7. **Visuals** (`src/render/`):
   - **Sky:** a night gradient plus 600 twinkling stars on 3 depths with parallax drift (`sky.ts`).
   - **Clouds and mist:** a single GLSL pass at `renderScale` (`atmosphere.ts`). The cloud cover is domain-warped fBm, solid over the number and broken elsewhere. The mist is lighter and faster, and parts around the finger. The finger trail is drawn into a small mask texture, so the mist closes back in over about 2.6 s.
   - **Eyes:** procedural per seed (`eye.ts`): an almond/blob outline with slow noise morphing, wispy lashes, size 0.85–1.15×, a random rotation, and lids that open, half-open or snap shut. The iris is a pre-rendered nebula texture, two counter-rotating copies clipped by the lids.
   - **Constellation:** wavy gold strands with a glow, a core and a hot centre. The tether sheds stardust. Unsettled lines jitter, gap, cool, dim and shed cold particles. Retract has an elastic rewind and a spark. Collapse un-draws back to the start, then puffs into mist. The reveal flares the whole line.
   - **Master button:** an eye glyph inside a ring of light. It breathes in READY and sits at 8 % elsewhere.
   - **Debug primitives:** still available. `D` draws them faintly over the scene; `P` (or `?primitives`) shows them alone.
8. **App states:**
   - INTRO: drifting mist, random blinks and a rippling ring glyph.
   - INTRO → GAME: the mist thins.
   - REVEAL: the line flares, all eyes open and close slowly, and the clouds tear open in wisps from the constellation centre with lit rims (5 s).
   - IDLE: 15 s, then the clouds roll back (3 s) → INTRO.
   - Inactivity → INTRO with a mist swell.
9. **Deployment:**
   - PWA precaching and a Screen Wake Lock.
   - `kiosk/serve.mjs`: a static server with no dependencies (`npm run serve`).
   - `kiosk/start-kiosk.bat` (Windows) and `start-kiosk.sh` (Linux).
   - `kiosk/README.md`: the setup checklist.
10. **Performance:**
    - The shader resolution (`display.renderScale` 0.5) and `noiseOctaves` (5) can be tuned. URL overrides: `?scale=` and `?octaves=`.
    - `display.autoScale` lowers the render scale in 0.05 steps, down to 0.3, while the frame rate stays under 55 fps.
    - FPS and the current scale show in the `D` overlay.

## Not verified
- **60 fps at 3840×2160 on the target PC.** This needs the real hardware. Headless Chrome uses a software GPU (about 6 fps), so it says nothing about performance.
- **Real touch, palms and room audio,** as listed in §11.

## Deviations
- **Iris swirl:** two counter-rotating pre-rendered nebula textures instead of a per-eye shader. It looks like a swirl and costs almost nothing.
- **Cloud cover over the stars:** it is solid only around the number (sized from the number's bounds). Elsewhere it is broken, so the stars stay visible during play.
- **Layers 3 and 4:** the cloud cover and the mist are computed in one shader pass, since nothing is drawn between them.

---

# Additions after Phase 2

- **Attract demo (INTRO)** in `src/game/attract.ts`, which replaces the random blinks:
  - Three random points connect A → B → C, each note at full voice level.
  - The line then un-draws from A to C, and a new triple follows.
  - A triple's segments always stay clear of other points, and consecutive triples use different points.
  - Timing is set in `settings.timing.attract`.
  - Before the first touch the demo has sound only under the kiosk autoplay flag; a normal browser stays silent until the first tap.
- **Creative mode** (new top-level mode `CREATIVE` in the reducer):
  - **Button:** bottom centre (`settings.creative`), a ring holding three linked stars. It is active in READY; tapping it again returns to READY.
  - **Play:** dragging connects any points (radius `hit.creativeScale` × r) and plays each note.
  - **No penalties:** there are no strikes and no reveal.
  - **Fading:** the drawing is coloured by pitch and fades over `timing.creativeFadeMs` after the finger lifts.
  - **Timeout:** 30 s without input returns to INTRO.
  - **Debug key:** `5`.
- **Validator:** points must also keep clear of the creative button.
- **Cloud cover reworked after final-gate-lock** (`src/render/clouds.ts`). It replaces the cloud half of the shader; the shader now draws only the finger-parting mist.
  - Soft puff sprites drift, turn slowly and breathe, with one density value from shroud to wisps.
  - At the reveal they are pushed outward from the constellation centre and thin out over `revealDisperseMs`.
  - After IDLE they roll back in from the edges over `cloudsReturnMs`.
  - There is no black veil, and `display.clouds.opacity` (0.85) keeps the cover slightly see-through over the backdrop.
  - The number is drawn only from the reveal on, and fades in as the clouds thin.
- **Second look, "vfx"** (PLAN amendment 2026-10-20), `src/render/vfx/`:
  - `?look=vfx` / `L` key / `settings.display.look`; the overlay shows the current look.
  - `portal.ts` (iris shader per eye), `beam.ts` + `ring.ts` (one dynamic mesh each per frame, `batch.ts`), shared GLSL in `shaders.ts`.
  - Strand geometry moved to `render/strand.ts`, shared by both looks.
  - `/vfx.html` (`src/dev/vfxLab.ts`): classic vs vfx eye, strand and rings with sliders. Built as a second page; the service worker doesn't serve it as the app fallback.
  - Not yet measured on the TV: check fps with `?debug` in both looks.
