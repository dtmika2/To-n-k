@echo off
rem Dream Pattern kiosk: start the local server, then Chrome full screen on it.
rem Put a shortcut to this file in shell:startup to launch on login.
setlocal
set PORT=4173
set APP=%~dp0..

rem 1) local static server for dist\ (minimized window)
start "Dream Pattern server" /min node "%~dp0serve.mjs" %PORT%

rem 2) wait until it answers (up to ~15 s)
set /a tries=0
:wait
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:%PORT%/ -TimeoutSec 1) | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 goto chrome
set /a tries+=1
if %tries% geq 15 goto chrome
timeout /t 1 /nobreak >nul
goto wait

:chrome
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" (
  echo Chrome not found. Install Google Chrome or edit CHROME in this file.
  pause
  exit /b 1
)

rem A separate profile, so the kiosk window opens even if Chrome is already running.
start "" "%CHROME%" --user-data-dir="%LocalAppData%\DreamPatternKiosk" ^
  --kiosk --app=http://localhost:%PORT% --autoplay-policy=no-user-gesture-required ^
  --disable-pinch --overscroll-history-navigation=0 --noerrdialogs ^
  --disable-session-crashed-bubble --disable-features=Translate --check-for-update-interval=31536000 ^
  --no-first-run --disable-infobars
endlocal
