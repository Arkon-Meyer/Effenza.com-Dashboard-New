#!/usr/bin/env bash
# Repo-first helpers. Safe to source multiple times.

# --- idempotent guard ---------------------------------------------------------
if type gsync >/dev/null 2>&1; then
  echo "[helpers] already loaded"
  return 0 2>/dev/null || exit 0
fi

# --- defaults (overridable by env) -------------------------------------------
PORT="${PORT:-3000}"
NODE_VERSION="${NODE_VERSION:-20}"
APP_ENTRY="${APP_ENTRY:-server.js}"
HEALTH_TRIES="${HEALTH_TRIES:-12}"
NODEMON_LOG="${NODEMON_LOG:-/tmp/nodemon.log}"

# keep strict in functions; avoid nounset at top-level since we’re sourced
set -o errexit -o pipefail

health() {
  ( set -euo pipefail
    local url="http://localhost:${PORT}"
    echo "[health] Checking API health at ${url} ..."
    for i in $(seq 1 "${HEALTH_TRIES}"); do
      if curl -s -o /dev/null -w "%{http_code}" "${url}/healthz" | grep -q '^200$'; then
        echo "[health] OK - /healthz responded with 200"
        exit 0
      fi
      echo "[health] Waiting... (${i}/${HEALTH_TRIES})"
      sleep 1
    done
    echo "[health] ERROR - not healthy"
    exit 1
  )
}

free_port() {
  echo "[free-port] Killing processes on port ${PORT}..."
  npx --yes kill-port "${PORT}" >/dev/null 2>&1 || true
}
alias free-port='free_port'  # legacy alias

app_restart() {
  ( set -euo pipefail
    echo "[app-restart] Using Node ${NODE_VERSION}..."
    nvm use "${NODE_VERSION}" >/dev/null 2>&1 || true

    echo "[app-restart] Removing node_modules & lockfile..."
    rm -rf node_modules package-lock.json

    echo "[app-restart] Installing dependencies (skip smoke)..."
    POSTINSTALL_SKIP_SMOKE=1 npm install

    echo "[app-restart] Rebuilding better-sqlite3..."
    npm rebuild better-sqlite3 || true

    free_port

    echo "[app-restart] Ensuring nodemon is installed..."
    npx --yes nodemon -v >/dev/null 2>&1 || npm i -D nodemon

    echo "[app-restart] Starting server with nodemon (${APP_ENTRY})..."
    npx nodemon "${APP_ENTRY}" > "${NODEMON_LOG}" 2>&1 &

    if ! health; then
      echo "[app-restart] ERROR - Server failed health check. Tail of ${NODEMON_LOG}:"
      tail -n 80 "${NODEMON_LOG}" || true
      exit 1
    fi

    echo "[app-restart] Server healthy ✅"
  )
}
alias app-restart='app_restart'  # legacy alias

gsync() {
  ( set -euo pipefail
    echo "[gsync] Hard resetting Codespaces to match remote main..."
    git fetch origin main
    git reset --hard origin/main
    git clean -fd

    echo "[gsync] Restarting app and waiting for health..."
    app_restart && echo "[gsync] ✅ Synced and healthy"
  )
}

echo "[helpers] loaded (gsync, app-restart, free-port, health)"
