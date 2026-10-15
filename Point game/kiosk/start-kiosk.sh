#!/usr/bin/env sh
# Dream Pattern kiosk for Linux: start the local server, then Chrome/Chromium full screen on it.
set -e
PORT=4173
DIR="$(cd "$(dirname "$0")" && pwd)"

node "$DIR/serve.mjs" "$PORT" &
for i in $(seq 1 15); do
  curl -fs "http://localhost:$PORT/" >/dev/null && break
  sleep 1
done

CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
exec "$CHROME" --user-data-dir="$HOME/.dream-pattern-kiosk" \
  --kiosk --app="http://localhost:$PORT" --autoplay-policy=no-user-gesture-required \
  --disable-pinch --overscroll-history-navigation=0 --noerrdialogs \
  --disable-session-crashed-bubble --disable-features=Translate --check-for-update-interval=31536000 \
  --no-first-run --disable-infobars
