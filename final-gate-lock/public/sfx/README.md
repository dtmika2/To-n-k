# Sound files (supplied by the client)

Drop `.mp3` files here (`.ogg` also works); they are picked up at the next load. A missing file makes that cue
silent, and the app keeps running. While testing, open the app with `?placeholderSfx` to hear
synthesised stand-ins for every missing file.

| Cue | Files | Loops | Plays when |
| --- | --- | --- | --- |
| mist_loop | `mist_loop.mp3` | yes | Shrouded + Playable ambience |
| reveal_whoosh | `reveal_whoosh.mp3` | | first tap |
| eye_open | `eye_open_1.mp3` … `eye_open_3.mp3` | | each eye opening in the intro |
| spin_ratchet | `spin_ratchet.mp3` | | intro wheel spin |
| detent_click | `detent_click_1.mp3` … `_3.mp3` | | wheel settles in a slot |
| arrow_tap | `arrow_tap_1.mp3`, `arrow_tap_2.mp3` | | arrow pressed |
| drag_tick | `drag_tick_1.mp3`, `drag_tick_2.mp3` | | slot boundary crossed while dragging |
| eye_blink | `eye_blink_1.mp3` … `_3.mp3` | | blink (low volume, max 1 per 2 s) |
| idle_whisper | `idle_whisper_1.mp3` … `_4.mp3` | | random, every 30–60 s while playing |
| success_stinger | `success_stinger.mp3` | | lock solved |
| lock_clunk | `lock_clunk_1.mp3`, `lock_clunk_2.mp3` | | wheels sink and lock |
| plate_slide | `plate_slide.mp3` | | plate halves slide apart |
| dust_fall | `dust_fall.mp3` | | dust falls |
| core_hum | `core_hum.mp3` | yes | Open state |
| reset_wind | `reset_wind.mp3` | | mist rolls back |
| operator_beep | `operator_beep.mp3` | | operator menu actions |

**Direction:** heavy iron and stone. Low end, weight and grit; no light or bright ticks. The
mechanism moves slowly and lands hard (see `src/feel.ts` for the timings the sounds play against).

Loops should be seamless. Keep files short and normalised; the master volume is set in the
operator menu.
