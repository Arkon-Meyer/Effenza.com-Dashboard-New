#!/usr/bin/env bash
# .vscode/terminal-init.sh — never fail; only enhance the shell

# Be forgiving in interactive terminals
set +e

echo "[dev] init running at $(date +%H:%M:%S) in $(pwd)"

# Load helper functions if present, but NEVER fail the terminal
if [ -f scripts/dev-helpers.sh ]; then
  # shellcheck disable=SC1091
  source scripts/dev-helpers.sh || true
  echo "[dev] helpers loaded (gsync, app-restart, free-port, health)"
fi

echo "[dev] Terminal ready. Try: gsync, app-restart, health"

# MUST end success so VS Code keeps the terminal open
true
