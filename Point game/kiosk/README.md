# Dream Pattern: kiosk setup

The app runs from the built `dist/` folder through a tiny local server and a full-screen Chrome window. It works fully offline: the service worker caches everything after the first start.

To try it on another PC without this setup, open the public build instead: **https://dtmika2.github.io/To-n-k/point-game/** (published from `main`; also offline after the first visit). To install it as an app, open **https://dtmika2.github.io/To-n-k/point-game/install.html**.

## Build and test once

```
npm install
npm run build
npm run serve            # → http://localhost:4173 — check it in a normal browser first
```

The hidden number needs no image: after a solve, the eyes listed in `src/config/pattern.json` under `"figure"` are joined in order and draw it. To change the number, change that list (eye ids, in drawing order) and run `npm run validate`.

## Start it

- **Windows, no install (easiest):** copy `kiosk\start-kiosk-online.bat` to the PC and double-click it. It opens the public build (https://dtmika2.github.io/To-n-k/point-game/) in kiosk Chrome with the same flags as below (Edge if Chrome is missing), in its own profile. It needs internet on the first start only; after that the service worker runs the game offline. No Node, no build, no server window. It's better than the installed app: kiosk mode has no title bar or close button, no exit-full-screen X on a long touch at the top, and it allows sound before the first touch.
- **Windows, local build:** double-click `kiosk\start-kiosk.bat`. It starts the server in a minimized window, waits for it, then opens Chrome in kiosk mode with its own profile, so it works even if Chrome is already open.
- **Linux:** `sh kiosk/start-kiosk.sh`.

To quit kiosk Chrome, press Alt+F4. Then close the "Dream Pattern server" window.

## PC checklist (Windows)

- [ ] **Orientation:** leave the TV in *Landscape* in Settings → System → Display → Display orientation. The app turns the picture and touch itself (`display.rotateDeg` = 270 in `src/config/settings.ts`). If Windows drives the TV in portrait instead, set it to 0 and rebuild; the kiosk takes no URL options unless you add them to `start-kiosk.bat`.
- [ ] **Map touch input to the TV:** Control Panel → *Tablet PC Settings* → *Setup…* → touch the TV when asked. Re-do this after changing the rotation.
- [ ] **Edge swipes off:** Settings → Bluetooth & devices → Touch → turn off *Three- and four-finger touch gestures*. Disable *edge swipes* via Group Policy (Computer Configuration → Administrative Templates → Windows Components → Edge UI → *Allow edge swipe* = Disabled) or the registry (`HKLM\SOFTWARE\Policies\Microsoft\Windows\EdgeUI`, DWORD `AllowEdgeSwipe` = 0).
- [ ] **Press-and-hold right-click off:** Control Panel → Pen and Touch → Touch → *Press and hold* → Settings → untick *Enable press and hold for right-clicking*. The app also blocks the context menu.
- [ ] **Touch visual feedback off:** Settings → Accessibility → Mouse pointer and touch → *Touch indicator* off. In Control Panel → Pen and Touch → Touch, untick *Show visual feedback when touching the screen*.
- [ ] **No sleep or screensaver:** Settings → System → Power → Screen and sleep → *Never* (on mains power), and screen saver → *None*. The app also requests a Screen Wake Lock.
- [ ] **No update restarts during opening hours:** Settings → Windows Update → Advanced options → *Active hours* covering the opening hours. Also pause updates for the exhibition period.
- [ ] **Auto-start on login:** press Win+R, run `shell:startup`, and put a shortcut to `kiosk\start-kiosk-online.bat` (or `kiosk\start-kiosk.bat`) there. Set the PC to sign in automatically (`netplwiz`, or Settings → Accounts).
- [ ] **Volume:** set the system volume once with the real speakers. The app limits its own peaks (limiter at −6 dB, `audio.masterGain` = 0.7).

## Operator keys (keyboard only, invisible to visitors)

| Key | Action |
|---|---|
| `D` | debug overlay: state, strikes, timers, FPS, canvas and screen size in real pixels, render scale, and hit radii over the scene |
| `P` | switch to the plain debug primitives (Phase 1 look) and back |
| `T` | turn the picture and touch 90° clockwise, until the next reload; also a button in the `M` menu, and `?rotate=` in the URL |
| `Z` | depth (on by default): eyes at different distances, with orbiting particles and clouds passing between them; also in the `M` menu, and `?depth=0` in the URL turns it off |
| `B` | backdrop: the swirl video (default), the image or the other looping video; also in the `M` menu, and `?backdrop=image`, `?backdrop=loop` or `?backdrop=swirl` in the URL. The M menu's *Swirl quality* picks the swirl's size: 1080p (default), 2K or 4K, also `?swirl=2K` in the URL; bigger is sharper but heavier, and 2K/4K need internet the first time they play |
| `U` | mark the unused (decoy) eyes with a red ring and cross; also `?unused` in the URL |
| `E` | layout editor (drag points, change radii, record the sequence, export `pattern.json`) |
| `R` | back to the intro |
| `1`–`5` | jump to INTRO / GAME / REVEAL / IDLE / CREATIVE |

URL options: `?debug`, `?primitives`, `?rotate=90`, `?scale=0.4` (shader resolution, turns auto-scaling off), `?octaves=4`, `?depth=0`, `?backdrop=image|loop|swirl`, `?swirl=1080p|2K|4K`.

## Performance

The cloud and mist shader runs at `display.renderScale` (0.5) of the screen resolution with `display.noiseOctaves` (5). With `display.autoScale` on, the app lowers the render scale in 0.05 steps while the frame rate stays under 55 fps, never below `display.minRenderScale` (0.3). Press `D` to see the current FPS and scale. If it still stutters at 4K, try `?octaves=4` or `?octaves=3`. Once you've found good values, put them in `settings.ts` and rebuild.

## Updating

Run `npm run build` again and restart the kiosk. The service worker picks up the new version on the next load.
