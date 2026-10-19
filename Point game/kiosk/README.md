# Dream Pattern: kiosk setup

The app runs from the built `dist/` folder through a tiny local server and a full-screen Chrome window. It works fully offline: the service worker caches everything after the first start.

## Build and test once

```
npm install
npm run build
npm run serve            # → http://localhost:4173 — check it in a normal browser first
```

Put the real number image at `public/assets/reveal-number.png` before building. It needs a transparent background and should be at least 1500 px tall. Without it, the app shows a placeholder "5".

## Start it

- **Windows:** double-click `kiosk\start-kiosk.bat`. It starts the server in a minimized window, waits for it, then opens Chrome in kiosk mode with its own profile, so it works even if Chrome is already open.
- **Linux:** `sh kiosk/start-kiosk.sh`.

To quit kiosk Chrome, press Alt+F4. Then close the "Dream Pattern server" window.

## PC checklist (Windows)

- [ ] **Portrait:** Settings → System → Display → Display orientation → *Portrait* (or *Portrait, flipped*) for the TV. If OS rotation is impractical, set `display.rotateDeg` in `src/config/settings.ts` instead (0/90/180/270) and rebuild. Rendering and touch then rotate together.
- [ ] **Map touch input to the TV:** Control Panel → *Tablet PC Settings* → *Setup…* → touch the TV when asked. Re-do this after changing the rotation.
- [ ] **Edge swipes off:** Settings → Bluetooth & devices → Touch → turn off *Three- and four-finger touch gestures*. Disable *edge swipes* via Group Policy (Computer Configuration → Administrative Templates → Windows Components → Edge UI → *Allow edge swipe* = Disabled) or the registry (`HKLM\SOFTWARE\Policies\Microsoft\Windows\EdgeUI`, DWORD `AllowEdgeSwipe` = 0).
- [ ] **Press-and-hold right-click off:** Control Panel → Pen and Touch → Touch → *Press and hold* → Settings → untick *Enable press and hold for right-clicking*. The app also blocks the context menu.
- [ ] **Touch visual feedback off:** Settings → Accessibility → Mouse pointer and touch → *Touch indicator* off. In Control Panel → Pen and Touch → Touch, untick *Show visual feedback when touching the screen*.
- [ ] **No sleep or screensaver:** Settings → System → Power → Screen and sleep → *Never* (on mains power), and screen saver → *None*. The app also requests a Screen Wake Lock.
- [ ] **No update restarts during opening hours:** Settings → Windows Update → Advanced options → *Active hours* covering the opening hours. Also pause updates for the exhibition period.
- [ ] **Auto-start on login:** press Win+R, run `shell:startup`, and put a shortcut to `kiosk\start-kiosk.bat` there. Set the PC to sign in automatically (`netplwiz`, or Settings → Accounts).
- [ ] **Volume:** set the system volume once with the real speakers. The app limits its own peaks (limiter at −6 dB, `audio.masterGain` = 0.7).

## Operator keys (keyboard only, invisible to visitors)

| Key | Action |
|---|---|
| `D` | debug overlay: state, strikes, timers, FPS, render scale, and hit radii over the scene |
| `P` | switch to the plain debug primitives (Phase 1 look) and back |
| `U` | mark the unused (decoy) eyes with a red ring and cross; also `?unused` in the URL |
| `E` | layout editor (drag points, change radii, record the sequence, export `pattern.json`) |
| `R` | back to the intro |
| `1`–`5` | jump to INTRO / GAME / REVEAL / IDLE / CREATIVE |

URL options: `?debug`, `?primitives`, `?rotate=90`, `?scale=0.4` (shader resolution, turns auto-scaling off), `?octaves=4`.

## Performance

The cloud and mist shader runs at `display.renderScale` (0.5) of the screen resolution with `display.noiseOctaves` (5). With `display.autoScale` on, the app lowers the render scale in 0.05 steps while the frame rate stays under 55 fps, never below `display.minRenderScale` (0.3). Press `D` to see the current FPS and scale. If it still stutters at 4K, try `?octaves=4` or `?octaves=3`. Once you've found good values, put them in `settings.ts` and rebuild.

## Updating

Run `npm run build` again and restart the kiosk. The service worker picks up the new version on the next load.
