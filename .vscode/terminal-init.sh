#!/usr/bin/env bash
# .vscode/terminal-init.sh — safe init for Codespaces terminal

# Never fail this script
set +e

echo "[dev] init: $(date)"

# (Optional) load helpers if present, but never crash if missing
if [ -f scripts/dev-helpers.sh ]; then
  # shellcheck disable=SC1091
  source scripts/dev-helpers.sh || true
fi

echo "[dev] Terminal ready. Helpful cmds: gsync, app-restart, free-port, health"

# When invoked via --init-file this file is *executed* (not sourced).
# Ensure we always exit successfully:
return 0 2>/dev/null || exit 0
