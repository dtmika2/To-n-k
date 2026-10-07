# Deploying the Final Gate Lock to the Galaxy Tab S11

The lock is a PWA. It is installed once from Chrome, then runs fully offline: every file, including
the font, config, sprites and sounds, is precached by the service worker. It makes no network calls
at runtime.

## 1. Build and host (once per update)

```bash
cd final-gate-lock
npm ci
npm run verify          # typecheck + unit tests + build → dist/
```

Serve `dist/` over **HTTPS** (a service worker and the screen wake lock need a secure context). Any
static host works. On the venue network, a laptop can do it during installation, for example
`npx vite preview --host --port 4173` behind HTTPS, or any static HTTPS host. Once installed, the
tablet no longer needs the server.

To change the puzzle, edit `public/config.json` (validated at boot; a mistake shows a red error
screen), rebuild and redeploy. Sound files go in `public/sfx/` (see the README there) and sprites in
`public/assets/` (see the README there).

## 2. Install on the tablet

1. Open the HTTPS URL in **Chrome** on the Tab S11.
2. Tap the lock once, so the intro plays and the service worker finishes installing.
3. Chrome menu ⋮ → **Add to Home screen → Install**. The icon is a brass eye.
4. Launch it from the home-screen icon. It opens fullscreen in landscape.
5. **Offline check:** turn on Airplane mode, close the app from Recents, launch it again. It must
   boot to the misty screen.

## 3. Android kiosk settings

| Setting | Where | Value |
| --- | --- | --- |
| Stay awake while charging | Settings → Developer options (tap *Build number* 7× to unlock) | **On** (backup to the app's own wake lock) |
| Screen pinning | Settings → Security and privacy → More security settings → Pin app | **On**, then open Recents → app icon → *Pin this app*. Unpinning needs a PIN. |
| Alternative to pinning | a kiosk browser/launcher (e.g. Fully Kiosk) pointing at the installed PWA URL | optional |
| Notifications / Do Not Disturb | Settings → Notifications → Do not disturb | **On**, no exceptions |
| Auto-rotate | Quick panel | **Off**, locked to landscape |
| Screen timeout | Settings → Display | longest value (the app also holds a wake lock) |
| Edge panels / gestures | Settings → Display → Edge panels; Navigation bar → Swipe gestures | **Off** (avoid accidental exits) |
| Battery | Settings → Battery → Background usage limits | exempt Chrome; Adaptive battery off |
| Auto updates | Play Store → Settings | off during opening hours (an update restarts Chrome) |
| Brightness | Quick panel | fixed level; adaptive brightness off |
| Volume | Media volume | set once; fine-tune with the operator menu |

The tablet is always charging. The app keeps the screen on (Screen Wake Lock, re-requested whenever
it comes back to the foreground), reloads itself if the GPU context is lost or the render loop
stalls, and lowers its render resolution automatically if frames are consistently slow.

## 4. Operator menu

Hold the **bottom-left corner** (about 2 × 2 cm) for **3 seconds**. A faint ring fills during the last
second. Enter the PIN (`operator.pin` in config.json; default `1907`).

- **Reset to Shrouded**: rolls the mist back and re-arms the lock.
- **Force open**: runs the success sequence (for staff or a stuck group).
- **Show solution**: shows the correct number under each wheel while the menu is open.
- **All wheels correct − 1**: every wheel one tap (↺) from its answer; useful for testing the opening.
- **Sound test**: plays every cue once.
- **Master volume**, **Visual mode** (procedural / sprites), **FPS meter**, and timings in seconds:
  reset after success, asleep after idle, settled → drowsy, operator hold.

Menu settings are saved on the tablet (localStorage) and survive restarts; `config.json` stays the
default. The menu closes itself after 60 s without input.

## 5. Daily routine

- Morning: unlock the screen pin if needed, launch the app, check it shows mist; run the operator
  **Sound test** once.
- Between groups: nothing. The lock resets itself 40 s after it opens (mist rolls back, wheels are
  reset unseen).
- If anything looks wrong: operator menu → **Reset to Shrouded**. As a last resort, swipe the app
  away and relaunch it; it boots offline in a few seconds.

## 6. Updating

Deploy the new `dist/` to the same URL. The next time the tablet is online and the app is opened,
the service worker fetches the new version in the background and activates it, so it is used from
the following launch. For an immediate update: connect the tablet to the network, open the app,
wait about 10 s, then close and relaunch it.
