#!/bin/bash
# Shared launcher: Terminal-friendly PATH, then server + optional browser.
set -euo pipefail
cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh"
fi

PORT="${PORT:-5173}"
export PORT

LISTEN_HOST="${BLANK_HOST:-127.0.0.1}"
echo "Starting blank static server…"
echo "  directory  $(pwd)"
echo "  url        http://${LISTEN_HOST}:${PORT}/"
echo "  versions   http://${LISTEN_HOST}:${PORT}/versions/"
echo "  staging    http://${LISTEN_HOST}:${PORT}/staging/"
echo ""

# Browser open is OPT-IN only (prevents StageForge loop from spawning infinite windows).
# Finder: Launch.command sets BLANK_OPEN_BROWSER=1
if [[ "${BLANK_OPEN_BROWSER:-}" == "1" && "${BLANK_NO_OPEN:-}" != "1" && "${STAGEFORGE:-}" != "1" ]]; then
  ( sleep 0.6 && open "http://${LISTEN_HOST}:${PORT}/" ) &
fi

exec node support/server.mjs
