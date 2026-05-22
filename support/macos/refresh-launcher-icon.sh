#!/bin/bash
# Build blank.icns from support/favicon.ico and apply to Launch Blank.app
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SUPPORT="$ROOT/support"
ICO="$SUPPORT/favicon.ico"
APP_ICNS="$ROOT/Launch Blank.app/Contents/Resources/applet.icns"
TMP="${TMPDIR:-/tmp}/blank-launcher-icon-$$"
mkdir -p "$TMP"

if [[ ! -f "$ICO" ]]; then
  echo "Missing $ICO — copy Desktop favicon first." >&2
  exit 1
fi

sips -s format png "$ICO" --out "$TMP/fav.png" >/dev/null
sips -z 1024 1024 "$TMP/fav.png" --out "$TMP/master.png" >/dev/null

ICSET="$TMP/Blank.iconset"
mkdir -p "$ICSET"
SRC="$TMP/master.png"
sips -z 16 16 "$SRC" --out "$ICSET/icon_16x16.png" >/dev/null
sips -z 32 32 "$SRC" --out "$ICSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$SRC" --out "$ICSET/icon_32x32.png" >/dev/null
sips -z 64 64 "$SRC" --out "$ICSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$SRC" --out "$ICSET/icon_128x128.png" >/dev/null
sips -z 256 256 "$SRC" --out "$ICSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SRC" --out "$ICSET/icon_256x256.png" >/dev/null
sips -z 512 512 "$SRC" --out "$ICSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SRC" --out "$ICSET/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$SRC" --out "$ICSET/icon_512x512@2x.png" >/dev/null

OUT="$SUPPORT/blank.icns"
iconutil -c icns "$ICSET" -o "$OUT"
cp "$OUT" "$APP_ICNS"

# Apple's bundled asset catalog can override applet.icns in Finder; keep one backup rename.
CAR="$ROOT/Launch Blank.app/Contents/Resources/Assets.car"
STOCK="$ROOT/Launch Blank.app/Contents/Resources/Assets.car.stock"
if [[ -f "$CAR" && ! -f "$STOCK" ]]; then
  mv "$CAR" "$STOCK"
  echo "Renamed Assets.car -> Assets.car.stock so your logo (applet.icns) shows in Finder/Dock."
fi

# Bump app so Finder refreshes the icon cache
touch "$ROOT/Launch Blank.app"
rm -rf "$TMP"
echo "Updated $OUT and $APP_ICNS"
