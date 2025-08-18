#!/usr/bin/env bash
# .vscode/terminal-init.sh — safe init, must never fail

set +e

# (Optional) load helpers if present, but never crash if missing
if [ -f scripts/dev-helpers.sh ]; then
  # shellcheck disable=SC1091
  . scripts/dev-helpers.sh || true
fi

printf "[dev] Terminal ready. Helpful cmds: gsync, app-restart, free-port, health\n" || true

# Never fail
:
