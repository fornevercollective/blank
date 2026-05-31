#!/bin/bash
# Double-click in Finder → Terminal opens here and starts **blank-??? habitat** (@cursor/sdk REPL).
# Same UX as Launch.command (Blank server).

cd "$(dirname "$0")"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Launch-Habitat.command is intended for macOS Terminal.app ; on Linux/WSL run:" >&2
  echo "  $(pwd)/support/cursor-habitat/launch-habitat-terminal.sh" >&2
  exec ./support/cursor-habitat/launch-habitat-terminal.sh "$@"
fi

exec ./support/cursor-habitat/launch-habitat-terminal.sh "$@"

