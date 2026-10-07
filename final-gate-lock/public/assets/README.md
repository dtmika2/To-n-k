# Sprites

Any visual layer can be replaced by an image, one at a time. The motion stays in code, so a sprite
only changes how a layer *looks*.

## Start here: the starter set

`test-sprites/` holds **every layer as its own image**, rendered from the procedural drawing at 2×
size, plus a ready `manifest.json`. Its `README.md` lists what each file is, its pixel size and where
it sits. Open the app with:

    ?manifest=assets/test-sprites/manifest.json&sprites

It looks exactly like the procedural version. Replace one file with your own art (same pixel size,
transparent PNG) and reload: only that piece changes. Work through the set one file at a time.

`npm run test-sprites` (dev server running) re-creates any missing files and keeps the ones you have
replaced. `npm run test-sprites -- --force` regenerates the whole set and **overwrites** your files.

## Going live

When pieces are final, copy them to `sprites/` and list them in `public/assets/manifest.json` (the
manifest the app uses by default). Then switch the operator menu to **Visual mode → sprites**. Any
layer without a working sprite falls back to its procedural drawing automatically, logged once to the
console.

```json
{
  "oak": { "file": "sprites/oak.webp", "width": 1138, "height": 698, "pivotX": -71, "pivotY": -51 }
}
```

`width`/`height` are the **logical** size (half the pixel size). `pivotX`/`pivotY` is the image point,
in logical px from its top-left, that lands on the layer's origin:

- **Wheel parts:** the wheel centre (for the lids, the centre of the lid's edge).
- **Door pieces:** the canvas origin, so the pivot is minus the image's top-left position on the
  1280×800 canvas. Copy the numbers from `test-sprites/manifest.json`.
- **`bezel`:** the ring's centre. One image is placed under all 10 wheels.

## Layers

| Group | Layers |
| --- | --- |
| Wheel (×10) | `ring`, `disc`, `iris` (turning plate with the window), `irisShade` (fixed light over it), `pupil`, `highlight`, `lidTop`, `lidBottom`, `lockRing`, `arrowCw`, `arrowCwPressed`, `arrowCcw`, `arrowCcwPressed` |
| Door | `plateShadow`, `oak`, `frame`, `straps`, `brackets`, `ornaments`, `bezel`, `seam` |
| Scene | `wall`, `mistTile`, `core` |

The door is a stack of separate pieces, so the wood can change without touching the brass or iron.
**Draw each piece whole**: the app splits the door into its two halves along the seam by itself.

`glow`, dust and sparks always stay procedural.

## Rules (see docs/DESIGN.md)

- Every layer on its own transparent background, with **alpha 0** wherever it shouldn't cover
  anything. A faint "almost transparent" background shows as a box.
- One light direction (top left).
- **No digits in sprites.** The numbers are drawn in code, on top of `disc`.
- Parts stay rigid; they never deform.
- The `iris` turns, so it must not contain a pupil or a fixed highlight; those are separate layers.

**Memory:** with the full starter set loaded, GPU memory peaks at about 131 MB (budget 150 MB). The
full-screen pieces (`wall`, `core`) are the largest. Don't author above 2×.
