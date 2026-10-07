# Pick up from here (next session)

State at end of 2026-10-07: everything is committed and pushed on `main`. Dev server:
`npm run dev`; links are in `docs/DEV-URLS.md`. Full history and decisions are in `PROGRESS.md` and
`DECISIONS.md`.

## To do

1. **Iris sits below the ring frame.** The iris plate (with the window) must be layered *under* the
   ring frame around the eye. When the eye moves (follows a finger, glances), the iris should slide
   inside the ring, not over it.
   - Today the stack is `ring` → `disc` → `iris`, so the shifted iris draws over the rim.
   - Likely fix: split the ring into the socket (below the disc) and a rim (above the iris and lids),
     or mask the iris to the ring's opening.
   - A new rim layer also needs a starter sprite and a manifest entry.
2. **No flashing on the active eye.** The eye a player is touching or using should not flash.
   - Candidates: the glow flaring up when it wakes (awake glow 0.7), and it still blinking while
     touched.
   - Confirm with the client which one they mean (probably both), then calm the awake state.
3. **Arrows only on the active eye.** Show the ↺ / ↻ buttons only above the wheel being interacted
   with, and hide them on dozing (drowsy) wheels.
   - Decide how a player first brings them up, e.g. touching the wheel shows its arrows and they
     fade out a few seconds after the last touch.
   - Decide whether the hidden arrows still respond to taps. If not, the only way to turn a resting
     wheel is to drag it.
   - The plan's arrow hit areas (≥ 56 px) and multi-touch must keep working.
4. **Upper-lid sprite overlap.** The client's `lidTop.png` covers the top of the upper-left and
   upper-right numbers while dozing. Fix it in the art (end the rim on the starter lid's curve), by
   raising `lidTop`'s `pivotY` in `public/assets/manifest.json`, or with a lighter doze.

## Housekeeping

- `public/assets/sprites/PlateLeft.jpg` and `PlateRight.jpg` are unused (the plate-half slots are
  gone) and can be deleted.
- Remaining layers to replace are listed in `public/assets/test-sprites/README.md`.
- Each change: `npm run verify` and `npm run e2e` before committing (work directly on `main`).
