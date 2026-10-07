# Starter sprite set

Every visual layer of the lock as its own image, rendered from the procedural drawing at 2× size.
Open the app with **`?manifest=assets/test-sprites/manifest.json&sprites`** (or switch the operator menu
to *sprites* with that manifest) and it looks exactly like the procedural version. Replace one file at
a time with your own art and only that piece changes.

**Rules**
- Keep the **same pixel size** as the file you replace. Then nothing else needs to change. If you
  change the size, update that layer's `width`/`height` (logical = pixels ÷ 2) and `pivotX`/`pivotY`
  in `manifest.json`.
- **Transparent PNG**, fully transparent (alpha 0) wherever the layer should not cover anything.
- The **door pieces** are positioned on the 1280×800 canvas: their pivot is minus their top-left
  position. The app splits the door into halves itself, so draw each piece whole (no left/right files).
- **No digits** in any image: the numbers are drawn in code, on top of `disc`.
- One light direction (top left) for every piece.
- `glow`, dust and sparks always stay in code.

| File | Group | What it is | Pixels (2×) | Placement |
| --- | --- | --- | --- | --- |
| `ring.png` | wheel | stone socket + brass rim around each wheel (fixed) | 394×400 | pivot (89, 89) from its top-left |
| `disc.png` | wheel | numbered disc, without digits (fixed; numbers are drawn in code) | 308×308 | pivot (77, 77) from its top-left |
| `iris.png` | wheel | turning plate with the window cut out (transparent wedge) | 296×298 | pivot (74, 74) from its top-left |
| `irisShade.png` | wheel | fixed light/shade over the turning plate (semi-transparent) | 292×292 | pivot (73, 73) from its top-left |
| `pupil.png` | wheel | pupil (follows the finger, scales) | 64×64 | pivot (16, 16) from its top-left |
| `highlight.png` | wheel | glint on the pupil | 30×32 | pivot (9, 9) from its top-left |
| `lidTop.png` | wheel | upper eyelid; pivot = centre of its lower edge | 332×366 | pivot (85, 174) from its top-left |
| `lidBottom.png` | wheel | lower eyelid; pivot = centre of its upper edge | 328×354 | pivot (83, 3) from its top-left |
| `arrowCw.png` | wheel | clockwise arrow button | 88×90 | pivot (20, 20) from its top-left |
| `arrowCwPressed.png` | wheel | clockwise arrow button, pressed | 86×88 | pivot (19, 19) from its top-left |
| `arrowCcw.png` | wheel | counter-clockwise arrow button | 88×90 | pivot (20, 20) from its top-left |
| `arrowCcwPressed.png` | wheel | counter-clockwise arrow button, pressed | 86×88 | pivot (19, 19) from its top-left |
| `wall.png` | scene | stone wall behind the door (full screen) | 2564×1604 | pivot (641, 401) from its top-left |
| `mistTile.png` | scene | one mist puff (used for every puff; tinted and faded in code) | 516×516 | pivot (129, 129) from its top-left |
| `plateShadow.png` | door | shadow the door casts on the wall | 2364×1484 | top-left at (59, 43) on the 1280×800 canvas |
| `oak.png` | door | the wooden panel (only the wood) | 2276×1396 | top-left at (71, 51) on the 1280×800 canvas |
| `frame.png` | door | brass trim around the panel, with its rivets (the panel area is transparent) | 2368×1488 | top-left at (48, 28) on the 1280×800 canvas |
| `straps.png` | door | wrought-iron straps across the wood, with rivets | 2274×472 | top-left at (73, 305) on the 1280×800 canvas |
| `brackets.png` | door | iron corner brackets | 2268×1390 | top-left at (74, 54) on the 1280×800 canvas |
| `ornaments.png` | door | brass filigree scrolls | 2152×1270 | top-left at (102, 83) on the 1280×800 canvas |
| `bezel.png` | door | brass ring a wheel sits in — one image, placed under all 10 wheels | 424×430 | pivot (99, 99) from its top-left |
| `seam.png` | door | dark line where the door parts | 14×1484 | top-left at (637, 29) on the 1280×800 canvas |
| `core.png` | scene | gold core revealed when the door opens (glow halos stay in code) | 1964×1964 | pivot (491, 491) from its top-left |
| `lockRing.png` | wheel | brass collar that slams onto the wheel on unlock | 382×384 | pivot (94, 94) from its top-left |

Regenerate missing files with `npm run test-sprites` (dev server running); `-- --force` rebuilds all
of them and overwrites your replacements.
