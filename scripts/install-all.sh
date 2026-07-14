#!/usr/bin/env bash
# Install blank fully for social link resolve (TikTok live, YouTube, Twitch…).
# Usage: ./scripts/install-all.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

echo "== blank install-all =="
echo "  root  $ROOT"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "  MISSING  $1  — $2"
    return 1
  fi
  echo "  ok      $1  $($1 --version 2>/dev/null | head -1 | cut -c1-60)"
  return 0
}

MISS=0
need node "install Node 20+ (brew install node)" || MISS=1
need npm "ships with node" || MISS=1
need yt-dlp "brew install yt-dlp  OR  uv tool install yt-dlp" || MISS=1
need ffmpeg "brew install ffmpeg" || MISS=1
need ffprobe "ships with ffmpeg" || MISS=1

if [[ "$MISS" -eq 1 ]]; then
  echo ""
  echo "Attempting auto-install of missing tools…"
  if command -v brew >/dev/null 2>&1; then
    command -v node >/dev/null || brew install node
    command -v yt-dlp >/dev/null || brew install yt-dlp
    command -v ffmpeg >/dev/null || brew install ffmpeg
  elif command -v uv >/dev/null 2>&1; then
    command -v yt-dlp >/dev/null || uv tool install yt-dlp
  fi
fi

# re-check critical
for c in node yt-dlp ffmpeg; do
  if ! command -v "$c" >/dev/null 2>&1; then
    echo "ERROR: $c still missing. Install and re-run."
    exit 1
  fi
done

# yt-dlp update (TikTok extractors change often)
echo ""
echo "== yt-dlp self-update (best effort) =="
yt-dlp -U 2>/dev/null || true
echo "  yt-dlp $(yt-dlp --version)"

# support npm (optional packages)
echo ""
echo "== support/ npm =="
cd "$ROOT/support"
if [[ -f package.json ]]; then
  # ensure package.json can hold optional deps without breaking zero-dep server
  npm install --no-fund --no-audit 2>/dev/null || true
fi
# playwright-core already present — install browser if playwright CLI available
if [[ -d node_modules/playwright-core ]]; then
  echo "  playwright-core present"
fi

# cursor-habitat (optional agent)
echo ""
echo "== cursor-habitat =="
if [[ -f cursor-habitat/package.json ]]; then
  (cd cursor-habitat && npm install --no-fund --no-audit)
  echo "  habitat deps ok"
else
  echo "  skip (no package.json)"
fi

# cookies hint for TikTok
echo ""
echo "== cookies (TikTok / age-gated) =="
COOKIES="${YTDLP_COOKIES:-$HOME/.config/yt-dlp/cookies.txt}"
if [[ -f "$COOKIES" ]]; then
  echo "  found  $COOKIES"
  echo "  export YTDLP_COOKIES=\"$COOKIES\""
else
  echo "  optional: export YTDLP_COOKIES=~/path/to/cookies.txt"
  echo "  (browser cookies help TikTok live when yt-dlp is blocked)"
fi

# .env from example
if [[ ! -f "$ROOT/.env" && -f "$ROOT/.env.example" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "  wrote .env from .env.example"
fi

# launcher perms
chmod +x "$ROOT/start.sh" "$ROOT/Launch.command" 2>/dev/null || true
chmod +x "$ROOT/scripts/install-all.sh" 2>/dev/null || true

# smoke: yt-dlp extractor list includes tiktok
echo ""
echo "== smoke =="
if yt-dlp --list-extractors 2>/dev/null | grep -qi tiktok; then
  echo "  tiktok extractor: yes"
else
  echo "  tiktok extractor: not listed (update yt-dlp)"
fi

# doctor file for gy
mkdir -p "$ROOT/support/.blank-install"
cat > "$ROOT/support/.blank-install/status.json" <<EOF
{
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "root": "$ROOT",
  "yt_dlp": "$(yt-dlp --version 2>/dev/null || echo missing)",
  "ffmpeg": "$(ffmpeg -version 2>/dev/null | head -1 || echo missing)",
  "node": "$(node -v 2>/dev/null || echo missing)",
  "port": 5173,
  "resolve": "POST /api/ingest/resolve",
  "social": ["tiktok", "youtube", "twitch", "kick", "instagram"]
}
EOF
echo "  wrote support/.blank-install/status.json"

echo ""
echo "== start blank =="
echo "  cd $ROOT && ./start.sh"
echo "  open http://127.0.0.1:5173/"
echo "  resolve: POST http://127.0.0.1:5173/api/ingest/resolve"
echo "           {\"url\":\"https://www.tiktok.com/@user/live\"}"
echo ""
echo "  gy side:  export GY_BLANK_URL=http://127.0.0.1:5173"
echo "            gy /social tiktok:handle   (uses blank when up)"
echo "done."
