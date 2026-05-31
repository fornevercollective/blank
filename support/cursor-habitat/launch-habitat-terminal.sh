#!/usr/bin/env bash
# macOS-first: same PATH bootstrap as Blank’s start.sh → cursor-habitat (npm ensure → REPL).
# Invoked by Launch-Habitat.command and support/Launch Habitat.applescript (.app builds).
#
# Optional pre-set keys (recommended in ~/.bashrc/.zprofile for Finder launches):
#   export CURSOR_API_KEY=cursor_…
# Agent workspace fallback (otherwise Blank repo itself):
#   export BLANK_HABITAT_CWD="$HOME/dev/mustream-desktop"
set -euo pipefail

HAB="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${HAB}/../.." && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh"
fi

# Default agent cwd: mustream-desktop if present, else this repo (good for hacking Blank itself).
if [[ -z "${BLANK_HABITAT_CWD:-}" ]]; then
  MD="$HOME/dev/mustream-desktop"
  if [[ -d "$MD" ]]; then
    export BLANK_HABITAT_CWD="$(cd "$MD" && pwd)"
  else
    export BLANK_HABITAT_CWD="$ROOT"
  fi
fi

cd "$HAB"

if [[ ! -d node_modules ]] || [[ ! -f node_modules/@cursor/sdk/package.json ]]; then
  echo "[habitat] installing npm deps …"
  npm install
fi

if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "[habitat] CURSOR_API_KEY not set → export CURSOR_API_KEY (Cursor Dashboard → Integrations)."
  echo "        blank repo: ${ROOT}"
  echo "        agent cwd:  ${BLANK_HABITAT_CWD}"
fi

exec npm run habitat -- "$@"

