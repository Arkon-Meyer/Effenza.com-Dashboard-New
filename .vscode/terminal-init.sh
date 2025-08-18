#!/usr/bin/env bash
# Safe terminal init for Codespaces — never crash the terminal

# Be forgiving: never exit on error in this init
set +e

echo "[dev] init running at $(date +%H:%M:%S) in $(pwd)"

# Only load helpers if file exists *and* has no syntax errors
if [ -f scripts/dev-helpers.sh ]; then
  if bash -n scripts/dev-helpers.sh 2>/dev/null; then
    # shellcheck disable=SC1091
    source scripts/dev-helpers.sh || true
    echo "[dev] helpers loaded (gsync, app-restart, free-port, health)"
  else
    echo "[dev] WARN: scripts/dev-helpers.sh has syntax errors; skipping load."
  fi
else
  echo "[dev] (no helpers yet)"
fi

echo "[dev] Terminal ready. Try: gsync, app-restart, health"

# Keep interactive shell alive even if someone 'return's
return 0 2>/dev/null || true
