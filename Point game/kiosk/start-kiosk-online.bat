@echo off
rem Dream Pattern kiosk, no install needed: opens the published game full screen in kiosk mode.
rem Needs internet on the first start only; after that the game is cached and runs offline.
rem Copy this one file to any Windows PC. Put a shortcut to it in shell:startup to launch on login.
rem To quit: Alt+F4 on a keyboard.
setlocal
rem For a sharper swirl, add ?swirl=2K (or ?swirl=4K) to the end of the URL; 1080p is the default.
set URL=https://dtmika2.github.io/To-n-k/point-game/

set BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%BROWSER%" set BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%BROWSER%" set BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe
if exist "%BROWSER%" goto start

rem No Chrome: fall back to Edge, which every Windows 10/11 PC has.
set EDGE_ONLY=--edge-kiosk-type=fullscreen
set BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%BROWSER%" set BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if not exist "%BROWSER%" (
  echo Neither Chrome nor Edge was found. Install Google Chrome.
  pause
  exit /b 1
)

:start
rem A separate profile, so the kiosk window opens even if the browser is already running.
rem Kiosk mode has no window frame and no exit-full-screen X; only Alt+F4 closes it.
start "" "%BROWSER%" --user-data-dir="%LocalAppData%\DreamPatternKioskOnline" ^
  --kiosk %EDGE_ONLY% --app=%URL% --autoplay-policy=no-user-gesture-required ^
  --disable-pinch --overscroll-history-navigation=0 --noerrdialogs ^
  --disable-session-crashed-bubble --disable-features=Translate --check-for-update-interval=31536000 ^
  --no-first-run --disable-infobars
endlocal
