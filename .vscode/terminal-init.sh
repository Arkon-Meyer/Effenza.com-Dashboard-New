#!/usr/bin/env bash
# Repo-scoped terminal init for VS Code. Runs for every integrated terminal.

# Never kill the interactive shell from here
set +e

HELPERS="${PWD}/scripts/dev-helpers.sh"
if [ -f "$HELPERS" ]; then
  # shellcheck disable=SC1090
  source "$HELPERS" || true
  echo "[init] dev helpers loaded: gsync, app_restart, free_port, health"
else
  echo "[init] helpers NOT found at: $HELPERS"
fi

# Optional: background health check (non-fatal)
if type health >/dev/null 2>&1; then
  ( health || echo "[init] health not ready (non-fatal)" ) &
fi

# Keep interactive no matter what
return 0 2>/dev/null || true
