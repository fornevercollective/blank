#!/bin/bash
# Double-click: Terminal + blank server + one browser tab.
cd "$(dirname "$0")"
export BLANK_OPEN_BROWSER=1
exec ./start.sh
