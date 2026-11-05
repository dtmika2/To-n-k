# Lock → TV signal

Sends "the lock was passed" from the tablet to the PC behind the TV. The tablet runs the installed app
and keeps working offline; the PC runs a small server and shows the TV page. If the link is down, the
lock still plays normally and the pass is sent when the link returns (within 10 minutes).

## Set up the PC

`Final-Gate-Lock-Server.exe` is one Windows program with everything inside it. The PC needs nothing
installed.

1. In the repo, run `npm run signal:exe`. This creates `release/Final-Gate-Lock-Server.exe` (about
   115 MB). It isn't in git, so copy it across by USB stick or similar. It only needs rebuilding when
   the server or the TV page changes, or for the Chrome test below when the lock changes.
2. Connect the PC to the same network as the tablet and double-click the program. If Windows warns about
   an unknown publisher, choose **More info → Run anyway**. If Windows Firewall asks, choose **Allow**,
   which may need an administrator on a managed PC.
3. The window shows the **PC address**, such as `192.168.2.51:8787`, and the TV page opens by itself.
   Move it to the TV and **click it once**. That goes fullscreen and turns on sound: browsers refuse to
   play sound on a page nobody has touched, so without the click the video plays muted. The TV page also
   shows the address until the tablet connects. Keep the window open: closing it stops the server.
4. If the picture is sideways, press **O** to rotate it. This is for a TV that's physically turned while
   Windows still sends a landscape picture, and it's remembered on that PC. Turning the display to
   portrait in Windows settings works too.
5. Make sure Windows sends sound to the TV: over HDMI it can stay on the PC's own speakers.

Turn off sleep on the PC, because a sleeping PC stops the server. If port 8787 is busy, the program
uses the next free port, so always read the address rather than assuming it.

## What the TV does

The screen shows the stone cover, with the video held on its first frame underneath. When the core
reaches the top edge of the tablet (9.7 s into the opening), the tablet signals the PC. The core rises in
from the bottom of the TV, healing the stone along its path and around it, so the colour of the frame
underneath seeps through. It slows to the centre of the video, swells slightly and collapses to nothing.
The rest of the stone fades over the last second, so it's gone as the flash comes and the video starts
with its sound, about 14 s after the solve. When the video ends, the stone comes back whole for the next
group.

Passes that arrive while the video is playing are ignored by the TV. If staff reset the lock before the
core has left, nothing is sent.

Timings, size and the target point are in `FX` at the top of the script in `scripts/signal-tv.html`.
Tablet timing is `coreLeftMs` in `src/feel.ts`.

**The content** is `PlaceholderVideo.mp4` and `PlaceholderStoneCover.png` in this folder, packed into the
program by `npm run signal:exe`. Use H.264 with AAC for the video, in the TV's own resolution. A larger
file can stutter on an older PC, which may not have hardware decoding for it. The cover must have the
same shape and composition as the video's first frame, or the two won't line up as it heals.

## Set up the tablet

1. Open the installed app, and hold the bottom-left corner for 1 second to open the operator menu.
2. Under **TV link**, enter the PC address and tap **Save**. It's remembered across restarts.
3. If Chrome asks to allow access to the local network, allow it. Do this before pinning the app.
4. The line below the field should change to `TV link OK · N ms`.

Players never see any of this: the status only appears in the operator menu. **Force open** in the menu
is a quick end-to-end test: it runs the whole opening and sends the signal about 10 s later, just as
solving the lock does.

**The PC address can change** when a PC reconnects to a network. The TV page then shows the new address
until the tablet connects, so enter that in the menu. To avoid this, reserve a fixed address for the PC
in the router.

## TV page keys

**P** passes by hand, which is the backup if the tablet can't connect. **R** returns to the stone cover.
**F** toggles fullscreen. **O** rotates 90°. **H** shows or hides the status panel.

The panel appears by itself only on the stone cover, and only when something needs doing: no click yet,
no tablet connected, or a problem with the server, the video or the cover. It hides as soon as the core
arrives, but it can show over the cover if the tablet drops out, so check it before players come in.

## Testing from the repo

`npm run signal` runs the same server from source, without packing it.

The server also hosts a copy of the lock for testing in Chrome, without the installed app. Open the
link it prints, adding `&skip-intro&solve` to start one move from solved, then touch the bottom-right
wheel and tap its ↻. This mode runs over plain HTTP, so it has no offline copy, and it shows a corner
label with the link status. It doesn't exercise the HTTPS rules that the installed app has to pass.

## What to check

| Test | Expected |
| --- | --- |
| Normal pass | The TV reacts straight away and the menu shows the round trip |
| Turn off Wi-Fi on the tablet, pass, turn it back on | The TV fires once when the link returns |
| Stop the server (Ctrl+C or close the window), pass, start it again | The same, within about 5 s of the server returning |
| Swipe the app away while a pass is waiting, and reopen it | The pass is still delivered, once |
| Turn on Airplane mode and restart the app | The lock still starts and plays; the menu shows DOWN |

## If the link stays DOWN

- **Check the address:** compare it with the program's window. If several are printed, try the others;
  some can belong to a VPN or virtual adapter.
- **Check the local network permission:** look in Chrome's site settings for the app.
- **Check the PC firewall:** from Chrome on the tablet, open `http://PC-ADDRESS/tv`. If that doesn't load,
  the firewall or the network is blocking the tablet. Guest, venue and some phone-hotspot networks stop
  devices from reaching each other.

The server has no authentication, so anyone on the same network can trigger the TV. Use a network you
control.
