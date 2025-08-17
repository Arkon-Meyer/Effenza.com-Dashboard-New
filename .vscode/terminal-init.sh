#!/usr/bin/env bash
# .vscode/terminal-init.sh — safe init, never fail
set +e

# (Optional) load helpers if present, but never crash if missing
if [ -f scripts/dev-helpers.sh ]; then
  # shellcheck disable=SC1091
  source scripts/dev-helpers.sh || true
fi

echo "[dev] Terminal ready. Helpful cmds: gsync, app-restart, free-port, health"

# Always succeed so the VS Code terminal doesn't close
true
