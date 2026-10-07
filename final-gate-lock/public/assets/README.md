# Sprites

Any visual layer can be replaced by an image, one at a time. The motion stays in code, so a sprite
only changes how a layer *looks*.

1. Put the image in `public/assets/sprites/` (transparent PNG or WebP, authored at **2×** logical size).
2. Add an entry to `public/assets/manifest.json`:

```json
{
  "iris": { "file": "sprites/iris.webp", "width": 148, "height": 148, "pivotX": 74, "pivotY": 74 }
}
```

`width`/`height` are the **logical** size (half the pixel size). `pivotX`/`pivotY` is the point (in
logical px from the image's top-left) that sits on the wheel centre — for the lids, that is the
centre of the lid's edge.

3. Switch the operator menu to **Visual mode → sprites**. A layer without a working sprite falls back
   to its procedural drawing automatically, logged once to the console.

Layer ids: `ring`, `disc`, `iris` (the turning plate with the window), `irisShade` (fixed light over it), `pupil`, `highlight`, `lidTop`, `lidBottom`, `arrowCw`,
`arrowCwPressed`, `arrowCcw`, `arrowCcwPressed`, `lockRing`, `wall` (pivot = image centre, 1280×800),
`plateLeft` / `plateRight` (drawn in absolute logical coordinates: pivot = 0,0 with a 1280×800 image),
`core` (pivot = centre). `glow`, dust and sparks always stay procedural.

Rules (see docs/DESIGN.md): every layer on its own transparent background, one light direction (top
left), pivot at the exact centre of each eye part, **no digits in sprites** (numbers are drawn in
code), and parts stay rigid (they never deform).

`test-sprites/` holds a generated reference set (the procedural layers in a steel tint) that proves
pivots and masks line up: open the app with `?manifest=assets/test-sprites/manifest.json&sprites`.
Regenerate it with `npm run test-sprites` (needs `npm run preview` running).
