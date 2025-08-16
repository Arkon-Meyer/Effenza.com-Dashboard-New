#!/usr/bin/env bash
# Runs for every VS Code integrated terminal (Bash (init) profile).
# Must NEVER kill the interactive shell.

# Be forgiving here
set +e

# Nice prompt if PS1 was empty
export PS1="${PS1:-bash-$-:\\w\\$ }"

# Load dev helpers (non-fatal if missing or error)
HELPERS="${PWD}/scripts/dev-helpers.sh"
if [ -f "$HELPERS" ]; then
  # shellcheck disable=SC1090
  source "$HELPERS" || true
  echo "[init] dev helpers loaded: gsync, app_restart, free_port, health"
else
  echo "[init] helpers NOT found at: $HELPERS"
fi

# Optional health check (non-blocking, non-fatal)
if type health >/dev/null 2>&1; then
  ( health || echo "[init] health: not ready (non-fatal)" ) &
fi

# Absolutely never exit the terminal from here
return 0 2>/dev/null || true
