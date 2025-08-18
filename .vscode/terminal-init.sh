#!/usr/bin/env bash
# .vscode/terminal-init.sh — safe init, must never fail
set +e
if [ -f scripts/dev-helpers.sh ]; then
  . scripts/dev-helpers.sh || true
fi
printf "[dev] Terminal ready. Helpful cmds: gsync, app-restart, free-port, health\n" || true
:
