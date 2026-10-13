# Dev URLs

Start the dev server first (VS Code Live Server can't run the app; it needs Vite to compile the
TypeScript):

```bash
cd final-gate-lock
npm run dev
```

| URL | What you get |
| --- | --- |
| http://localhost:5173/ | The real experience: mist first, tap anywhere to start the intro |
| http://localhost:5173/?skip-intro | Straight to the playable wheels |
| http://localhost:5173/?skip-intro&solve | One move from solved: touch the bottom-right wheel to make it active, then tap its ↻ to see the opening |
| http://localhost:5173/?placeholderSfx | Stand-in sounds (click once first so the browser allows audio) |
| http://localhost:5173/?debug | FPS meter and touch-area outlines |
| http://localhost:5173/wheel.html | A single large wheel |
| http://localhost:5173/?skip-intro&procedural | The drawn version (sprites are the default: `public/assets/sprites/`, listed in `public/assets/manifest.json`) |
| http://localhost:5173/?skip-intro&manifest=assets/test-sprites/manifest.json&sprites | The starter sprite set; replace files in `public/assets/test-sprites/` one by one |

Flags can be combined, e.g. `/?skip-intro&solve&placeholderSfx`. Other flags (`?speed=N`,
`?config=…`, `?manifest=…`, `?sprites`, `?procedural`) are listed in `PROGRESS.md`.

With a mouse, click the arrows or drag a wheel. The operator menu is a 1-second hold in the
bottom-left corner; the PIN is `0000`.

To test the installable, offline version instead, run `npm run build` and then `npm run preview`,
and open http://localhost:4173/.
