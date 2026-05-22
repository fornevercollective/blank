#!/bin/bash
# Shared launcher: Terminal-friendly PATH, then server + default browser.
set -euo pipefail
cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh"
fi

PORT="${PORT:-5173}"
export PORT

# Optional tuning when many localhost services run (see support/server.mjs):
#   export BLANK_MAX_CONNECTIONS=64
#   export BLANK_MAX_CONCURRENT=8
#   export BLANK_KEEP_ALIVE_MS=3000

LISTEN_HOST="${BLANK_HOST:-127.0.0.1}"
echo "Starting blank static server…"
echo "  directory  $(pwd)"
echo "  url        http://${LISTEN_HOST}:${PORT}/"
echo "  tuning     BLANK_MAX_CONNECTIONS BLANK_MAX_CONCURRENT BLANK_KEEP_ALIVE_MS (see support/README.md)"
echo ""

( sleep 0.6 && open "http://${LISTEN_HOST}:${PORT}/" ) &

exec node support/server.mjs
