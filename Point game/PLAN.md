# Dream Pattern — Implementation Plan

A touchscreen memory game for a 75" TV lying flat as a table, used in portrait orientation. Glowing "eyes" sleep in a night sky full of mist. A sequence of them blinks, each with its own theremin-like tone. The visitor traces the sequence with one finger, like a pattern-lock gesture. A correct trace disperses the clouds and reveals a hidden number.

The app is an offline PWA running in kiosk-mode Chrome on a PC that drives the TV.

> **Instructions for Claude Code — two phases with one checkpoint**
>
> Build in **two phases** (see §12).
>
> 1. **Phase 1:** complete milestones 1–6, run the unit tests and the validator, and then **STOP**. Write a short checkpoint summary covering:
>    - what is done;
>    - how to run it (`npm run dev` and the debug keys);
>    - which settings are worth tuning on the real TV (hit radii, timings, audio levels);
>    - anything you deviated from or were unsure about.
>
>    Then wait for the owner's confirmation. Do not start Phase 2 on your own.
> 2. **Phase 2:** starts only after the owner explicitly confirms. Apply any feedback from the checkpoint first, then complete milestones 7–10.
>
> Within a phase, work through the milestones in order without stopping. If a decision in this plan is impossible or clearly wrong, note it in the checkpoint summary instead of silently changing the design.

---

## 1. Fixed decisions

| Topic | Decision |
|---|---|
| Platform | PWA: Vite + TypeScript + PixiJS v8 + vite-plugin-pwa. Native Web Audio API. No UI framework. |
| Display | 75" 4K touch TV lying flat. The app is laid out in **portrait**. "Top" means the top edge of the portrait layout. |
| Input | **One touch at a time.** Lock onto the first pointer and ignore all others until it lifts. |
| Points | **16 points**, organic eye-like shapes. Some are never used in the sequence. Used and unused points look identical. |
| Sequence | **Fixed, hand-authored** (not procedural). **13 touches = 12 segments.** The start and end are **two different points**; the end appears only once. Other points, including the start, may repeat (amended for the Leo pattern). No point follows itself. |
| Pitch | **Same point = same pitch.** Notes come from the A minor pentatonic scale (see §5). |
| Sound | Theremin-like monophonic voice with glide, vibrato and reverb. |
| Visual style | Clouds, mist, stars, eyes, fantasy, dream. |
| Reveal | A PNG of the number (currently **5**), with a fixed orientation, uncovered when the cloud layer disperses. |
| Session length | The 2-minute exhibit slot is **not** enforced by the app. |
| UI text | **None.** All affordances are glyphs and light, because visitors stand on every side of the table. |
| Strike counters | **Not shown** as UI. Strikes show only through animation (fraying, retraction, collapse). |

---

## 2. App states

```
INTRO ──tap anywhere──► GAME ──sequence complete──► REVEAL ──► IDLE ──15 s──► INTRO
  ▲                       │
  └──── 30 s inactivity ──┘
```

### INTRO (attract mode)
- Drifting mist over a starfield. Eyes blink occasionally at random, not in the sequence order. A soft ambient drone plays if audio is already unlocked.
- A central pulsing glyph invites a touch, for example a ring of light that ripples outward.
- **Any tap** starts the game. The first tap also unlocks/resumes the `AudioContext`.
- Transition: the mist thins slightly and the eyes settle → GAME → DEMO.

### GAME
Substates are described in §3.

### REVEAL
- Triggered the instant the 13th touch lands on the end point.
- The constellation flares, then all eyes open at once and close slowly.
- Audio: the final note blooms into a soft chord made of the unique pitches in the sequence, which then decays.
- The **cloud cover layer disperses** outward from the centre of the constellation over about 5 s and uncovers the number PNG.
- Then → IDLE.

### IDLE (after reveal)
- The number stays visible for **15 s**. Touches only ripple the mist and have no game effect.
- Then the clouds roll back in (about 3 s) → INTRO.

### Inactivity
- In GAME (any substate), **30 s** without input returns to INTRO with a mist fade. A pointer held down counts as activity.

---

## 3. Game rules (the core state machine)

### Substates

**DEMO**
- Plays automatically when GAME starts, and again whenever the master button is pressed.
- Each point in the sequence blinks in order: the eye opens, the iris glows, the note plays, the eye closes. A revisited point blinks again with the same note.
- Default timing: 900 ms per step, with the note sustained for about 600 ms. The theremin voice glides between notes with a short volume dip.
- Touch input is ignored apart from mist ripples (`allowSkipDemo: false` in settings).
- Afterwards → READY.

**READY (the "zero connections" state)**
- No segments are drawn and no finger is down.
- The **start point** glows faintly so players know where to begin.
- The **master button** is active, breathing and glowing. See §4.
- A touch on the start point (within its correct radius) plays its note → TRACING with `progress = 1`.
- A touch anywhere else only ripples the mist.
- A touch on the master button → DEMO.

**TRACING (finger down)**
- A live tether runs from the last correct point to the finger.
- When the finger reaches the **expected next point**: `progress++`, the segment locks in as part of the constellation, the note plays, and **both strike counters reset to 0** along with any lift timer.
- If `progress === 13` → REVEAL.
- When the finger reaches a **wrong point** (any other point, see §6 for radii): `wrongStrikes++`.
  - `wrongStrikes === 1`: the wrong eye flinches shut, the tether flickers and **retracts to the last correct point**. The app then treats the finger as lifted → LIFTED. The current physical pointer is ignored until it is actually lifted.
  - `wrongStrikes === 2`: → COLLAPSE.
- When the finger lifts (pointerup or pointercancel) → LIFTED.

**LIFTED**
- The locked segments and the tether (if still hanging at the lift position) become **unsettled**. Over time they jitter, gap and fray, cool in colour, and shed particles. Intensity ramps from 0 to 1 across each 4 s interval.
- A lift timer fires every **4 s** while in LIFTED. Each firing is a **lift strike**: `liftStrikes++`.
  - `liftStrikes === 1`: the hanging tether **retracts to the last correct point**. If it was already retracted after a wrong point, the line just pulses to show the strike.
  - `liftStrikes === 2`: → COLLAPSE.
- A **retouch on the last correct point** (within its correct radius) → TRACING. The timer stops, but the counters do **not** reset; only progress resets them.
- A touch anywhere else is ignored, and the last correct point pulses gently as a hint.

  This means:
  - lift and retouch within 4 s → no penalty;
  - wait 4 s → retract; wait 4 more s → collapse;
  - lift, wait 4 s, retouch, lift again, wait 4 s → collapse.

**COLLAPSE**
- The whole line rewinds segment by segment back to the start point (about 1.5 s) and dissolves into a puff of mist. Audio: a long descending glide fading to silence.
- Both counters reset → READY.

### Counters summary
- `liftStrikes` and `wrongStrikes` are **separate**. One lift strike plus one wrong strike does **not** collapse.
- Both reset on every correct point reached, and on COLLAPSE.

### Implementation requirement
Write the rules as a **pure reducer**: `(state, event, now) → { state, effects[] }`.
- Events: `POINTER_DOWN`, `POINTER_MOVE` (with an interpolated path), `POINTER_UP`, `POINTER_CANCEL`, `TICK`, `MASTER_PRESSED`, `DEMO_DONE`, `ANIM_DONE`.
- Effects: `playNote`, `noteGlide`, `lockSegment`, `retract`, `collapse`, `flinch`, `pulseHint`, `startReveal`, and so on.

Rendering and audio subscribe to effects. Unit-test the reducer exhaustively (§11).

---

## 4. Master button

- A **glyph, no text**: a stylized eye inside a thin ring of light (any orientation reads fine).
- Position: **top centre** of the portrait layout, with a fixed position and orientation.
- **Active only in READY** (zero connections). It breathes and glows there, and tapping it → DEMO.
- In every other state it fades to about 8% opacity and does not respond to touch.
- Use a generous hit area (about 1.5× its visual radius).

---

## 5. Audio

### Theremin voice (monophonic, one continuous voice)
- Oscillator: a custom `PeriodicWave` with harmonics `[1, 0.25, 0.08, 0.03]` (a sine with a little body), plus a second sine detuned +3 cents at low gain for warmth.
- **Vibrato:** an LFO at about 5.5 Hz on detune. The depth ramps from 0 to about 8 cents over 400 ms after each note onset (delayed vibrato, as a real thereminist plays).
- **Portamento:** use `setTargetAtTime` on frequency. Time constant ≈ 0.06 s for note snaps and ≈ 0.25 s for drag glides.
- Envelope: attack ≈ 80 ms, release ≈ 600 ms.
- Lowpass filter at about 2.5 kHz, then a **convolution reverb** with a generated impulse response (decaying noise, about 3.5 s, wet ≈ 35%), then a `DynamicsCompressor` used as a limiter to protect the TV speakers.

### Drag glide (agreed design)
- While tracing, pitch glides continuously in log-frequency from the last correct point's note toward the **expected next point's note**. The amount is `t = 1 − clamp(dist(finger, target) / dist(lastPoint, target))`. This intentionally gives a subtle hint about direction (`glideHint: true` in settings).
- Volume swells slightly with finger speed (smoothed).
- On reaching a correct point, the note "rings": a short gain accent, and the pitch snaps exactly to the note.

### Event sounds
- **Wrong point:** that point's note sounds briefly, bends down about a semitone with a wobble, then fades.
- **Unsettled:** the vibrato becomes irregular and widens with fray intensity, and the volume fades.
- **Collapse:** a long descending glide to silence.
- **Reveal:** the unique sequence pitches swell as a soft pad (one extra oscillator per pitch), then decay over about 6 s.
- **Intro:** an optional very quiet drone on the tonic (A2 with a soft fifth), only once audio is unlocked.

### Pitch assignment (A minor pentatonic, E3–E6, 16 notes)
`E3 G3 A3 C4 D4 E4 G4 A4 C5 D5 E5 G5 A5 C6 D6 E6`

Rule (implemented by `scripts/assign-pitches.ts` and re-run whenever the sequence changes):
- **Start point = A3** (tonic). **End point = A4** (tonic an octave up, so the melody resolves).
- The 8 notes in the middle of the range (`C4 D4 E4 G4 C5 D5 E5 G5`) go to the other points **used** in the sequence, in order of first appearance.
- The extreme notes (`E3 G3 A5 C6 D6 E6`) go to the **unused** points, so a wrong touch sounds slightly "outside".
- If the final sequence uses a different number of unique points, the script spreads the notes using the same principle (used points in the middle, unused at the edges) and prints the result for review.

---

## 6. Input and hit detection

### Pointer handling
- Pointer Events on the canvas. CSS `touch-action: none; user-select: none; cursor: none`.
- Lock onto the first `pointerId` on `pointerdown` and call `setPointerCapture`. Ignore other pointers until it ends.
- Treat `pointercancel` as a lift.
- Suppress `contextmenu`, because a long press on Windows touch screens becomes a right-click.
- Mouse input works the same way for development.
- Use `getCoalescedEvents()` and **interpolate between consecutive samples**. Hit testing works on the line segment between samples (segment-to-circle intersection), so a fast swipe cannot skip over a point. If one segment crosses several point radii, process them in order along the path.

### Radii (in layout units, relative to each point's visual radius `r`)
- **Expected next point:** generous, `1.5 × r`.
- **Any other point (wrong):** tight, `0.6 × r`. Brushing past is forgiven; landing on it is not.
- **Last correct point:** never counts as wrong. Hysteresis applies: the finger must leave `1.25 × r` before the point can register again (this matters for A → B → A patterns).
- **Retouch in LIFTED / start in READY:** uses the generous radius.

### Coordinates
- All layout data is normalized to 0–1 in portrait space (x across the short edge, y down the long edge) and scaled to the viewport while keeping the aspect ratio.
- `display.rotateDeg` (0/90/180/270) in settings rotates both rendering and input, in case setting portrait rotation in the OS is impractical. The preferred setup is OS-level rotation with touch mapped to the TV (see §10).

---

## 7. Visuals

### Layers (bottom to top)
1. **Sky:** deep night gradient (indigo to violet to near-black) and a starfield with twinkle (instanced sprites, about 600 stars, 3 depths with slight parallax drift).
2. **Reveal layer:** the number PNG, centred, at a fixed orientation, with a soft glow. Hidden beneath layer 3 until REVEAL.
3. **Cloud cover:** a full-screen fBm noise shader of thick, slow, luminous clouds. A `disperse` uniform from 0 to 1 thresholds the density outward from a centre point, so the clouds tear open in wisps instead of fading uniformly.
4. **Mist:** a lighter, faster drifting fog that is always present. It **parts around the finger**: the shader receives the finger position plus the last ~16 trail positions and lowers density nearby, so the mist closes back in slowly behind the finger.
5. **Constellation:** locked segments are luminous, slightly wavy strands of light in warm white-gold. The live tether runs to the finger. Stardust particles shed along the tether.
6. **Eyes (points):** see below.
7. **Master button.**
8. **Particles / FX:** blink blooms, flinch ripples, collapse puff.

Render the shader layers (3, 4) at reduced resolution (`renderScale`, default 0.5) and upscale them. They are soft by nature, and this keeps 4K at 60 fps.

### Eyes — "organic" points
- Each eye is generated procedurally from its seed: an almond- or blob-shaped outline perturbed by noise, wispy lashes, and small variations in size (0.85–1.15×) and rotation. No two eyes look alike, and none has an "up".
- The outline morphs very slowly with time-based noise, so the eyes look alive.
- States:
  - **Sleeping:** closed lid line with a faint breathing glow. All points look identical here, used or not.
  - **Blink (demo / reached):** the lid opens and shows an iris with a nebula-like swirl shader and a bright pupil, plus a bloom and a ring of light.
  - **Awake (part of the current line):** half-open with a soft glow.
  - **Start point in READY:** sleeping, but with a slightly stronger, slow pulse.
  - **Hint pulse:** a brief bright ring.
  - **Flinch (wrong):** snaps shut, small shudder, a violet ripple.
- Pre-render each eye's static parts to textures at startup. Animate the lids, iris and glow with sprites and a small shader.

### Line states
- **Stable:** smooth, bright, gentle shimmer.
- **Unsettled (LIFTED):** with intensity `u` from 0 to 1, jitter amplitude rises, noise-driven gaps appear, colour shifts from gold to cold blue-grey, particles shed, and the mist creeps over the line.
- **Retract:** the tether rewinds to the last correct point (about 600 ms, elastic ease) with a spark at the tip.
- **Collapse:** the segments un-draw in reverse order to the start point (about 1.5 s), then puff into mist.
- **Reveal flare:** the whole constellation brightens, then fades as the clouds part.

---

## 8. Data files

### `src/config/pattern.json` (hand-authored, edited with the editor in §9)
```json
{
  "points": [
    { "id": 0, "x": 0.50, "y": 0.80, "r": 0.045, "seed": 101, "note": "A3" }
  ],
  "sequence": [0, 4, 9, 5, 4, 11, 13, 9, 14, 6, 11, 2, 15]
}
```
- 16 points (ids 0–15). The `sequence` above is a **placeholder** that follows the rules: 13 touches, start 0 and end 15 each appear once, and 4, 9 and 11 repeat. Unused points: 1, 3, 7, 8, 10, 12.
- Positions are placeholders. Claude Code should generate a layout that passes the validator, and the real layout will be set with the editor.

### `src/config/settings.ts`
```ts
export const settings = {
  timing: {
    demoStepMs: 900, demoNoteMs: 600,
    liftStrikeMs: 4000,
    retractMs: 600, collapseMs: 1500,
    revealDisperseMs: 5000, revealHoldMs: 15000, cloudsReturnMs: 3000,
    inactivityMs: 30000,
  },
  hit: { correctScale: 1.5, wrongScale: 0.6, exitHysteresis: 1.25, masterScale: 1.5 },
  audio: { masterGain: 0.7, reverbWet: 0.35, vibratoHz: 5.5, vibratoCents: 8, glideHint: true, introDrone: true },
  display: { rotateDeg: 0, renderScale: 0.5 },
  game: { allowSkipDemo: false },
  reveal: { image: "assets/reveal-number.png", widthFraction: 0.45 },
};
```

### `scripts/validate-pattern.ts` (`npm run validate`)
Fails if any of these hold:
- the number of points is not 16;
- the sequence length is not 13;
- the start equals the end;
- the end appears more than once (a repeated start is allowed since the Leo pattern);
- a point follows itself;
- an id is unknown;
- a note is missing;
- **any segment passes within `wrongScale × r` (plus a margin) of a point that is not one of its endpoints**;
- any points overlap.

It warns if a point lies within about 4% of the screen edge.

---

## 9. Debug tools (hidden from visitors, keyboard only)
- `?debug` URL parameter or the `D` key: overlay showing hit radii (correct and wrong), point ids and notes, sequence indices, the current state and substate, both strike counters, the lift timer, and FPS.
- `E` key: **layout editor**. Drag points, change `r`, and click points in order to record a new sequence. Export `pattern.json` via download or clipboard. Runs the validator live.
- `R`: reset to INTRO. `1`–`4`: jump to INTRO, GAME, REVEAL or IDLE.

---

## 10. PWA and kiosk deployment
- `vite-plugin-pwa`: manifest with `display: "fullscreen"`, and precache all assets (JS, PNG, glyphs) so the app runs fully offline.
- Serve the built `dist/` from a tiny local static server (for example `npx serve dist -l 4173`, or a bundled Node script). Service workers require `http://localhost`, not `file://`.
- Request a Screen Wake Lock in the app.
- `kiosk/start-kiosk.bat` (Windows assumed; add a `.sh` equivalent if the PC runs Linux): starts the server, then Chrome with:
  ```
  --kiosk --app=http://localhost:4173 --autoplay-policy=no-user-gesture-required
  --disable-pinch --overscroll-history-navigation=0 --noerrdialogs
  --disable-session-crashed-bubble --disable-features=Translate --check-for-update-interval=31536000
  ```
- `kiosk/README.md` checklist:
  - Set the TV display to portrait rotation in the OS.
  - **Map touch input to the TV display** (Windows: Tablet PC Settings → Setup).
  - Disable edge swipes, press-and-hold right-click, and touch visual feedback.
  - Disable sleep, screensaver and Windows Update restarts during opening hours.
  - Auto-start the script on login. Set system volume.

---

## 11. Tests

### Unit tests (Vitest) for the reducer and hit testing
- Correct full trace → REVEAL. Revisited points register correctly.
- Fast swipe where samples jump over a correct point → still registers (interpolation).
- Path that brushes a wrong point inside `correctScale` but outside `wrongScale` → no strike.
- Wrong #1 → retract + LIFTED; the physical pointer is ignored until lifted.
- Wrong #2 without progress → COLLAPSE.
- Wrong #1, progress, wrong → retract only (counter reset).
- Lift → retouch on the last correct point within 4 s → no strike.
- Lift → 4 s → retract; → 8 s → COLLAPSE.
- Lift → 4 s → retouch → lift → 4 s → COLLAPSE.
- One lift strike plus one wrong strike → no collapse.
- Retouch in LIFTED on a non-last point → ignored plus `pulseHint`.
- Master button works only in READY.
- A second pointer is ignored while the first is active.
- 30 s inactivity → INTRO from every GAME substate.

### Manual checks on the real hardware
- Palm and sleeve contacts, a second visitor's finger, accuracy at the edges, and audio level in the room.

---

## 12. Milestones

### Phase 1 — playable core (debug visuals, real sound)
Goal: the owner can play the full rules on the real TV, hear the real sound, and enter the real pattern, before any effort goes into visuals.

1. Scaffold: Vite + TS + PixiJS v8 + PWA, full-screen canvas, settings, debug overlay skeleton.
2. `pattern.json`, validator, pitch-assignment script, and a placeholder layout that passes validation.
3. Game reducer and the full unit test suite (§11).
4. Input layer (pointer lock, coalesced and interpolated hit testing) wired to the reducer, drawn with **debug primitives only**:
   - points as circles, with the correct and wrong radii visible;
   - lines and the tether as plain strokes;
   - the master button as a simple ring;
   - a simple colour shift or dashing for "unsettled".

   Include minimal placeholder versions of INTRO (tap to start), REVEAL (show the PNG, or a placeholder "5" if the PNG is missing), IDLE (15 s) and the 30 s inactivity reset, so the whole loop runs.
5. Audio engine: theremin voice, glide, event sounds, reverb, limiter.
6. Layout editor (§9), so the owner can set the real positions and sequence at the checkpoint.

**⏸ CHECKPOINT — stop here.** Write the checkpoint summary described at the top of this plan and wait for the owner's explicit confirmation.

### Phase 2 — look, feel and deployment (only after confirmation)
0. Apply the owner's checkpoint feedback (tuned settings, final `pattern.json`, rule changes).
7. Visuals: sky, mist with finger parting, eyes, constellation and its unsettled/retract/collapse animations, master button glyph. These replace the debug primitives; keep the primitives available in debug mode.
8. Full app states: INTRO attract mode, REVEAL cloud dispersal with the PNG, IDLE, clouds returning, and all transitions.
9. PWA offline and kiosk scripts plus README.
10. Performance pass at 3840×2160: hold 60 fps on the target PC and tune `renderScale` and the number of noise octaves.

---

## 13. Open items (to be provided by the owner)
- Final point positions and sequence (set with the editor, then re-run `assign-pitches`).
- `public/assets/reveal-number.png`: transparent background, high resolution (at least 1500 px tall).
- The PC's OS (Windows assumed) and its audio output (TV speakers or external).

---

## Amendment (2026-10-15): attract demo and creative mode

- **INTRO attract demo.** Instead of random blinks, three random points connect one after another (1 → 2 → 3), each playing its note at full volume. Then the line un-draws from the first point to the third, like the collapse but running forwards. Then three new points are chosen, and so on.
- **Creative mode.**
  - **Button:** a second button at the bottom centre (a ring with three linked stars), active in READY.
  - **Play:** dragging connects any points and plays their notes.
  - **No penalties:** there are no strikes and no reveal.
  - **Fading:** each drawing fades a few seconds after the finger lifts.
  - **Leaving:** tap the button again, or wait 30 s without input (→ INTRO).

## Amendment (2026-10-19): Leo pattern

- **Layout.** The pattern is now the Leo constellation, rotated 90° to portrait with the head at the top-left. It has 9 stars (ids 0–8, in order of first touch) and 9 decoy eyes around it (ids 9–17; 16 and 17 placed by hand). The point count is now 18 and the scale gains D3 and G6 (D3–G6), so every eye still has its own note.
- **Sequence:** `0 1 2 3 1 4 3 0 5 4 6 7 8`. The start star is touched again at step 8, so the "start appears only once" rule is dropped. The end still appears only once.

## Amendment (2026-10-19): small edits

- **Creative button in INTRO.** It also works under the clouds. The clouds part from the button, and tapping it again returns to INTRO (the clouds roll back in and the attract demo resumes).
- **Quiet tail.** After the "get ready" notice there is ½ s of quiet before the first eye opens (`NOTICE.tailMs`). `introLeadMs` is now 5.5 s.
- **Reveal number.** The number is drawn above the eyes. Through IDLE it shrinks towards the centre and fades into the distance, gone as the clouds close.
- **Hint while the start is pending.** With only the start eye touched and lifted (no connection yet), the hint button cancels the pending start and replays the demo.

## Amendment (2026-10-20): second look, "vfx"

- **Two looks, one link.** As in final-gate-lock, both looks ship in one build. `settings.display.look` sets the default (`classic`), `?look=vfx` overrides it per session, and `L` switches live, so the two can be compared on the table.
- **vfx look** (League-style effects: additive light, scrolling noise, hot cores, bright rims):
  - **Eyes:** the iris becomes a portal, a dark star-flecked void inside a hot rim with twisting arms and light streaks. It stays inside the same organic lids, and the void opens with them (a sleeping eye shows a small ring).
  - **Lines:** every strand becomes an energy beam with light flowing from start to end. Fraying flickers and breaks it softly instead of cutting it into pieces.
  - **"Get ready" centre:** instead of the soft dot, an energy orb (flame tongues around a white-hot core) gathers as the ring contracts. Sparks stream in from the ring; each pulse flares the orb and bursts sparks outward. The demo outro plays it in reverse: the same ring expands, the orb shrinks away and its sparks scatter outward with the ring.
  - **Rings:** ripples, blink and notice rings and both buttons become rings of light with a full soft fill and no dashes (owner's pick from the lab, 2026-10-20). The eye rings (blink, reach, hint) and the touch ripple are gold; the others (wrong touch, notice, outro, reveal, buttons) are lavender. The beams and everything else keep their colours.

## Amendment (2026-10-20): refined eyes

- **Lids** (both looks): brush-like tapered lid lines that swell in the middle and end in fine points, with a soft halo and a light sheen, in the iris's own colour (each eye its own colour family, warming slightly to gold as it glows).
- **Lashes:** 9–12 curved lashes per eye that taper and fade to fine tips and curl towards the nearer corner; when the eye opens, a few small ones appear on the lower lid. They still sway and hang down when the eye closes.
- **Opening:** the lid casts a soft, feathered shadow into the eye, with a thin rim of light just inside the edge, so the iris sits inside the eye. The shadow lightens as the eye closes, so sleeping slits keep their colour.
- **vfx look:** the lids and lashes are made of light (a thin white-hot core in the iris's colour, with light travelling along them and brief bright pulses). As an eye opens wide, most lash tips throw a spark outward; while it glows open, single tips glint now and then.
- **Default look (2026-10-20):** `vfx` is now the default (`settings.display.look`); `?look=classic` or `L` still shows the classic look.

## Amendment (2026-10-20): the number is drawn by the eyes

- **No number image.** The reveal no longer fades in a picture of the number (`reveal-number.png` is not needed any more).
- **The figure.** `pattern.json` lists the eyes that form the number, in drawing order (`"figure"`, now `12 4 13 1 2 10 15`, a "5" drawn in one stroke). After the solve, while the clouds part and the Leo lines flare and fade, a bright line runs from eye to eye (from 3.4 s, once the Leo lines have faded, over 4 s, at even speed along the line). Each eye opens with a gold ring and a burst of stardust as it is reached, and plays its note.
- **Hold.** The finished figure breathes gently through IDLE with its eyes half open and glowing, and fades as the clouds roll back in.
- Timing: `timing.revealFigureDelayMs`, `timing.revealFigureDrawMs`; the notes can be switched off (`audio.revealNotes`, also in the M menu). The validator checks the figure's ids.
