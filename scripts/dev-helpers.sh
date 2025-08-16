#!/usr/bin/env bash

health() (
  set -euo pipefail
  local url="http://localhost:3000" tries=12
  echo "[health] Checking API health at $url ..."
  for i in $(seq 1 "$tries"); do
    if curl -s -o /dev/null -w "%{http_code}" "$url/healthz" | grep -q '^200$'; then
      echo "[health] OK - /healthz responded with 200"; exit 0
    fi
    echo "[health] Waiting... ($i/$tries)"; sleep 1
  done
  echo "[health] ERROR - not healthy"; exit 1
)

free_port() (
  set -euo pipefail
  echo "[free-port] Killing processes on port 3000..."
  npx --yes kill-port 3000 >/dev/null 2>&1 || true
)

app_restart() (
  set -euo pipefail
  echo "[app-restart] Using Node 20..."
  command -v nvm >/dev/null 2>&1 && nvm use 20 >/dev/null || true

  echo "[app-restart] Removing node_modules & lockfile..."
  rm -rf node_modules package-lock.json

  echo "[app-restart] Installing dependencies (skip smoke)..."
  POSTINSTALL_SKIP_SMOKE=1 npm install

  echo "[app-restart] Rebuilding better-sqlite3..."
  npm rebuild better-sqlite3 || true

  free_port

  echo "[app-restart] Ensuring nodemon is installed..."
  npx --yes nodemon -v >/dev/null 2>&1 || npm i -D nodemon

  echo "[app-restart] Starting server with nodemon..."
  npx nodemon server.js > /tmp/nodemon.log 2>&1 &

  if ! health; then
    echo "[app-restart] ERROR - Health failed. Last 80 lines:"
    tail -n 80 /tmp/nodemon.log || true
    exit 1
  fi
  echo "[app-restart] Server healthy ✅"
)

gsync() (
  set -euo pipefail
  echo "[gsync] Hard resetting Codespaces to match remote main..."
  git fetch origin main
  git reset --hard origin/main
  git clean -fd
  echo "[gsync] Restarting app and waiting for health..."
  app_restart && echo "[gsync] ✅ Synced and healthy"
)

# Handy aliases
alias free-port='free_port'
alias app-restart='app_restart'
