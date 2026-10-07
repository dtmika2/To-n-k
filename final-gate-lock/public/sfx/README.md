# Sound files (supplied by the client)

Drop `.ogg` files here; they are picked up at the next load. A missing file makes that cue
silent, and the app keeps running. While testing, open the app with `?placeholderSfx` to hear
synthesised stand-ins for every missing file.

| Cue | Files | Loops | Plays when |
| --- | --- | --- | --- |
| mist_loop | `mist_loop.ogg` | yes | Shrouded + Playable ambience |
| reveal_whoosh | `reveal_whoosh.ogg` | | first tap |
| eye_open | `eye_open_1.ogg` … `eye_open_3.ogg` | | each eye opening in the intro |
| spin_ratchet | `spin_ratchet.ogg` | | intro wheel spin |
| detent_click | `detent_click_1.ogg` … `_3.ogg` | | wheel settles in a slot |
| arrow_tap | `arrow_tap_1.ogg`, `arrow_tap_2.ogg` | | arrow pressed |
| drag_tick | `drag_tick_1.ogg`, `drag_tick_2.ogg` | | slot boundary crossed while dragging |
| eye_blink | `eye_blink_1.ogg` … `_3.ogg` | | blink (low volume, max 1 per 2 s) |
| idle_whisper | `idle_whisper_1.ogg` … `_4.ogg` | | random, every 30–60 s while playing |
| success_stinger | `success_stinger.ogg` | | lock solved |
| lock_clunk | `lock_clunk.ogg` | | wheels sink and lock |
| plate_slide | `plate_slide.ogg` | | plate halves slide apart |
| dust_fall | `dust_fall.ogg` | | dust falls |
| core_hum | `core_hum.ogg` | yes | Open state |
| reset_wind | `reset_wind.ogg` | | mist rolls back |
| operator_beep | `operator_beep.ogg` | | operator menu actions |

**Direction:** heavy iron and stone. Low end, weight and grit; no light or bright ticks. The
mechanism moves slowly and lands hard (see `src/feel.ts` for the timings the sounds play against).

Loops should be seamless. Keep files short and normalised; the master volume is set in the
operator menu.
