# Sound files (supplied by the client)

Drop `.mp3` files here (`.ogg` also works); they are picked up at the next load. A missing file makes that cue
silent, and the app keeps running. While testing, open the app with `?placeholderSfx` to hear
synthesised stand-ins for every missing file.

| Cue | Have | Files in this folder (length) | Files | Loops | Plays when |
| --- | --- | --- | --- | --- | --- |
| mist_loop | ✅ | `mist_loop.mp3` (2.6 s) | `mist_loop.mp3` | yes | while the mist covers the screen (Shrouded; fades out as the intro parts it, back in on reset) |
| eye_loop | ✅ | `eye_loop.mp3`, `_2` (6.5 s each) | `eye_loop_1.mp3`, `eye_loop_2.mp3` | yes | from the mist parting until the lock opens; one file repeats 3–8 times, fades out over 1 s, then the other starts; 25 % volume |
| reveal_whoosh | ✅ | `reveal_whoosh.mp3` (2.4 s) | `reveal_whoosh.mp3` | | first tap |
| eye_open | ✅ | `eye_open_1`, `_2`, `_3` (1.0 s each) | `eye_open_1.mp3` … `eye_open_3.mp3` | | each eye opening in the intro |
| spin_ratchet | ✅ | `spin_ratchet.mp3` (2.0 s) | `spin_ratchet.mp3` | | intro wheel spin |
| detent_click | ✅ | `detent_click_1`, `_2`, `_3` (0.9 s each) | `detent_click_1.mp3` … `_3.mp3` | | wheel settles in a slot |
| arrow_tap | ◐ 1 of 2 | `arrow_tap.mp3` (0.9 s) | `arrow_tap_1.mp3`, `arrow_tap_2.mp3` | | arrow pressed |
| drag_tick | ✅ | `drag_tick.mp3`, `_2`, `_3` (0.6 s each) | `drag_tick_1.mp3` … `_3.mp3` | | while dragging: 3 ticks between two numbers (at 36°, 60°, 84° of the 120°); 2 during an arrow step (30°, 90°); quieter during the intro spin. Positions: `dragTicks` / `arrowTicks` in `src/feel.ts` |
| eye_blink | ✅ | `eye_blink.mp3`, `_2`, `_3` (0.6 s each) | `eye_blink_1.mp3` … `_3.mp3` | | every blink, at low volume |
| idle_whisper | ✅ | `idle_whisper_1` … `_4` (5.1 s each) | `idle_whisper_1.mp3` … `_4.mp3` | | random, every 30–60 s while playing |
| success_stinger | ❌ | — | `success_stinger.mp3` | | lock solved |
| eye_glowup | ✅ | `eye_glowup.mp3` (2.0 s) | `eye_glowup.mp3` | | lock solved: every eye opens wide and glows (with success_stinger) |
| lock_clunk | ✅ | `lock_clunk_1`, `_2` (1.5 s each) | `lock_clunk_1.mp3`, `lock_clunk_2.mp3` | | wheels sink and lock |
| plate_slide | ✅ | `plate_slide.mp3` (3.9 s) | `plate_slide.mp3` | | plate halves slide apart |
| dust_fall | ✅ | `dust_fall.mp3` (3.4 s) | `dust_fall.mp3` | | dust falls |
| core_hum | ✅ | `core_hum.mp3` (9.8 s) | `core_hum.mp3` | yes | Open state |
| reset_wind | ❌ | — | `reset_wind.mp3` | | mist rolls back |
| operator_beep | ❌ | — | `operator_beep.mp3` | | operator menu actions |

✅ every variant present · ◐ some variants present (only those play; a bare `name.mp3` counts as
variant 1) · ❌ no file, so the cue is silent (or a synthesised stand-in with `?placeholderSfx`).
Status checked 2026-10-13.

**Direction:** heavy iron and stone. Low end, weight and grit; no light or bright ticks. The
mechanism moves slowly and lands hard (see `src/feel.ts` for the timings the sounds play against).

Loops should be seamless. Keep files short and normalised; the master volume is set in the
operator menu.
