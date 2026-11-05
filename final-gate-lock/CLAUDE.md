# Final Gate Lock

An escape-room lock for a Samsung tablet: a PixiJS 8 PWA, installed once and then run offline. Tablet setup is in `DEPLOY.md`; decisions are in `DECISIONS.md`; history is in `PROGRESS.md`. `NEXT-SESSION.md` dates from 2026-10-09, and its "run e2e before committing" step no longer applies.

## Commands
- `npm run dev` — Vite dev server on http://localhost:5173. URL flags are in `src/flags.ts`, example links in `docs/DEV-URLS.md`.
- `npm run verify` — typecheck, vitest and build. Run this before committing.
- `npm run signal` — build, then run the signal server from source.
- `npm run signal:exe` — build `release/Final-Gate-Lock-Server.exe` (about 115 MB, not in git).
- **Don't run the Playwright e2e tests unless asked.**
- **Public build:** every push to `main` publishes https://dtmika2.github.io/To-n-k/ (repo-root `.github/workflows/pages.yml`).

## Workflow
- Work directly on `main`, with no branches. Commit and push only when asked.

## Lock → TV signal
Setup and test steps are in `docs/SIGNAL-TEST.md`.
- **Design:** the tablet runs the installed HTTPS app and POSTs to a plain-HTTP server on the PC, at the address saved in the operator menu. The lock never depends on the PC to run. Don't serve the live lock from the PC: no offline copy, no fullscreen install, and a watchdog reload would fail if the PC is down.
- **Trigger:** `seq.after(S.coreLeftMs, …)` in `src/scene/SuccessSequence.ts` fires `game.onCoreLeft` as the core reaches the top edge (9.7 s), which also covers operator force-open. A reset before then sends nothing.
- **Delivery:** `src/signal/passSignal.ts` saves each pass, retries until confirmed and drops it after 10 minutes. The server ignores repeated ids.
- **PC side:** `scripts/signal-server.cjs` (server), `scripts/signal-tv.html` (TV page), `scripts/build-server-exe.mjs` (packs them with `dist/` and `PlaceholderVideo.mp4`).
- **TV show:** frozen first frame → core rises in from the bottom (same `core.png`) → collapses at the video's centre → flash + video starts with sound → back to frozen when it ends. Tunables: `FX` in `signal-tv.html`. Sound needs one click on the page; without it the video plays muted.
- **`?signal` / `?signal=URL`:** testing only. These also show the corner status label; players never see it in the installed app.

## Signal status (2026-11-05)
- **Proven on the real tablet:** the installed app reached the `.exe` over Wi-Fi and delivered one pass. The `.exe` ran on the development PC.
- **Not tested:** a separate or inventory PC (firewall, admin rights, blocked unsigned programs), Wi-Fi dropout on the tablet, the Ethernet setup.
- **Next up:** the real video (the current one is a placeholder), and feel-tuning the TV show on the real TV.

## Gotchas
- The commit code in the operator menu is the last commit, and ignores uncommitted changes. It doesn't prove a local build contains your work.
- The installed app only updates through a push to `main`, and the update arrives by the launch after the one that finds it. Rebuilding the `.exe` doesn't change it.
- `signal-server.cjs` must stay CommonJS with Node built-ins only, because it's packed without a bundler. Rebuild the `.exe` after changing the server, the TV page or the lock.
- postject's "signature seems corrupted" warning is expected; the `.exe` is unsigned.
- Plain-HTTP pages have no service worker, wake lock or `crypto.randomUUID`.
- Checking the TV page with Playwright: its Chromium has no H.264, so use `channel: 'msedge'`. Its `evaluate` counts as a user gesture, and headless Edge doesn't enforce the sound rule, so neither can prove the no-click path.
- Windows: stopping a backgrounded `npm run signal` can leave its Node process holding port 8787. Check with `Get-NetTCPConnection -LocalPort 8787`.
- To run `src/signal/passSignal.ts` directly in Node, add `--experimental-transform-types`; it uses parameter properties.
