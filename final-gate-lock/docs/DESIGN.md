# Final Gate Lock — Visual Design Reference

> **For Claude Code:** this file explains the *why* and the *look*. `PLAN.md` is authoritative for
> every number, timing, file name and behaviour. If the two ever disagree, follow `PLAN.md` and
> flag the conflict. Wheel data and the sound cue list live only in `PLAN.md`.

Reference images in `docs/reference/`:
- `sketch-shutter-dial.png` — the client's sketch of the mechanism: a numbered disc under an opaque
  top layer with one wedge cutout; on the right, the same wheel read as an eye (iris + pupil + window).
- `reference-brass-discs.png` — the quality and material target: brass discs with a cutout on an
  engraved brass and wood plate. The procedural version matches its silhouette and light, not its
  texture detail.

---

## Art direction

The lock reads as a medieval castle door that is watching you: heavy brass and oak, with living eyes
as the only organic thing on it. Mechanical parts move slowly and settle with weight; eyes move fast
and slightly unpredictably. That contrast carries the "illusion" theme without any text.

| Element | Direction |
| --- | --- |
| Base plate | Dark oak panel (#2B1B12) with riveted brass trim and engraved filigree, echoing the reference image |
| Wheels | Brass discs (#B8913A, shadow #6E5220) set into stone-grey sockets (#3A3A40), the number carved and gilded |
| Eye accent | One cold glow colour, teal (#7FE3D4), used only for pupils, mist and the unlock light; everything else stays warm |
| Numerals | Serif manuscript-style digits on parchment (#E8D9B0), upright in the window at every position |
| Background | Near-black stone wall with slow drifting mist; never brighter than the plate, so the wheels stay the focus |
| Motion | Mechanical parts: ease-in-out with a small overshoot at each click. Eyes: fast blinks, small darting movements, slow lid droop when idle |
| Light | One soft light from the top left, so every layer shades consistently whether it is drawn or a sprite |

---

## The wheel is the eye

Layer stack, top to base: glow → brass rim → eyelids → pupil + highlight → iris plate with wedge cutout →
**number disc** → stone socket. The rim sits above the iris, so the iris slides under it when the eye moves.

Only the number disc turns when a player spins the wheel. The eye parts sit above it and never turn
with it, so the pupil can follow a finger while the disc spins underneath. The iris plate is opaque
except for the wedge cutout, which is the only place a number can be seen. The pupil sits at the
centre, outside the window, so it never covers the number.

---

## Why sprites don't stop the eyes from moving

The animation is never in the picture. An eye is built from separate parts (socket, iris plate,
pupil, highlight, upper lid, lower lid), and code moves, scales and rotates those parts every frame.
Whether a part is drawn from vector shapes or loaded from a transparent image makes no difference to
the motion — the same method as cut-out puppet animation.

| Motion | How code does it | Works with sprites? |
| --- | --- | --- |
| Pupil follows the finger | Shift iris plate, pupil and highlight toward the touch point by a few px, clamped to an ellipse; pupil moves slightly more than the iris for depth | Yes, pure translation |
| Blink and sleepy lids | Upper lid slides down, lower lid slides up, quick ease | Yes, two lid sprites sliding |
| Pupil widening | Scale the pupil | Yes, pure scale |
| Idle glances | Small random offsets of iris and pupil on a timer | Yes, same as tracking |
| Illusion shimmer | Rotate a radial texture inside the iris, pulse the glow, blend modes | Yes, rotating texture sprite or looping sheet |
| Number window | Cutout reveals the disc below (mask) | Yes, the wedge is transparent pixels in the iris sprite |
| Pupil or lid changing shape | Redraw the path | Only via pre-made variants; **keep these parts rigid** |

**Rule:** eyes never deform. Every part is a rigid layer with a fixed pivot listed in the manifest.
Animation, timing and touch handling live in code, never in assets. Pre-rendered frame sequences are
allowed only for one-off effects that part-based motion can't fake well (mist reveal, unlock light
burst, falling dust), and even those start as procedural particles.

---

## Sprite production guidance (for the later art pass)

- Each layer is generated or rendered on its own transparent background — never one finished picture
  that has to be cut apart.
- Authored at 2× the logical size (full canvas 2560 × 1600), transparent WebP or PNG.
- All sprites share one light direction (top left) and a pivot at the exact centre of each eye part.
- Digits are never baked into sprites; they are always drawn in code so numbers stay configurable.
- First art pass: one wheel only (ring, disc, iris, pupil, lids), tested in the app before producing
  the plate and wall.
- Always procedural, even in sprite mode: glow, dust and sparks.

| Layer | Procedural version | Sprite file(s) |
| --- | --- | --- |
| Wall and mist | Dark gradient with noise, drifting particles | `wall.webp`, `mist_tile.webp` |
| Plate | Oak panel with bevelled brass trim, two halves | `plate_left.webp`, `plate_right.webp` |
| Socket and rim | Stone socket (`ring`, below the disc) and brass rim (`rim`, above the iris and lids) | `ring.webp`, `rim.webp` (shared) |
| Number disc | Brass disc with engraved edge | `disc.webp` (blank) |
| Iris plate | Radial pattern with a wedge hole | `iris.webp` |
| Pupil and highlight | Dark circle, small white glint | `pupil.webp`, `highlight.webp` |
| Eyelids | Two curved lid shapes | `lid_top.webp`, `lid_bottom.webp` |
| Arrows | Brass arrow shapes | `arrow_cw.webp`, `arrow_ccw.webp` (+ pressed) |
| Unlock core | Gold radial light | `core.webp` |

---

## Mood of the key moments

- **Shrouded:** almost nothing — mist, and faint teal glimmers hinting that something is behind it.
- **Intro:** the door wakes up. Mist parts from the player's finger, eyes open in a wave from that
  point, wheels spin and settle like a mechanism finding its rest.
- **Playable:** the door is watching. Eyes doze, blink and glance on their own, look toward whoever is
  touching a neighbour, and wake fully under a finger. Idle behaviour never hints at the answer.
- **Success:** a held breath (0.4 s of silence), then every eye opens at once and stares straight
  ahead, the wheels sink, the plate splits, and gold light pours out.
- **Open:** calm. Eyes closed peacefully, the core hums. Then the mist quietly takes it all back.
