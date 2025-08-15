#!/usr/bin/env bash
# Developer helpers for Codespaces & Repo sync

# Enable strict mode ONLY when this file is executed directly (not when sourced by .bashrc)
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
fi

# Wait until API is healthy (checks /healthz first, then /), retries w/ backoff
health() {
  local url="http://localhost:3000"
  local retries=12
  local delay=1

  echo "[health] Checking API health at $url ..."
  for i in $(seq 1 $retries); do
    # Prefer /healthz (JSON), fallback to /
    if curl -s -o /dev/null -w "%{http_code}" "$url/healthz" | grep -q '^200$'; then
      echo "[health] OK - /healthz responded with 200"
      return 0
    elif curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q '^200$'; then
      echo "[health] OK - / responded with 200"
      return 0
    fi
    echo "[health] Waiting... ($i/$retries)"
    sleep $delay
  done

  echo "[health] ERROR - API not healthy after $retries attempts."
  return 1
}

# Kill anything on port 3000
free-port() {
  echo "[free-port] Killing processes on port 3000..."
  npx --yes kill-port 3000 >/dev/null 2>&1 || true
}

# Restart app cleanly and wait for health
app-restart() {
  echo "[app-restart] Using Node 20..."
  nvm use 20 >/dev/null

  echo "[app-restart] Removing node_modules & lockfile..."
  rm -rf node_modules package-lock.json

  echo "[app-restart] Installing dependencies (skip smoke)..."
  POSTINSTALL_SKIP_SMOKE=1 npm install

  echo "[app-restart] Rebuilding better-sqlite3..."
  npm rebuild better-sqlite3 || true

  free-port

  echo "[app-restart] Ensuring nodemon is installed..."
  npx --yes nodemon -v >/dev/null 2>&1 || npm i -D nodemon

  echo "[app-restart] Starting server with nodemon..."
  # Run nodemon in background so we can health-check synchronously
  npx nodemon server.js > /tmp/nodemon.log 2>&1 &

  # Wait for server to start and be healthy
  if ! health; then
    echo "[app-restart] ERROR - Server failed health check. Stopping nodemon."
    pkill -f "nodemon server.js" >/dev/null 2>&1 || true
    echo "[app-restart] Last 40 lines of nodemon log:"
    tail -n 40 /tmp/nodemon.log || true
    return 1
  fi

  echo "[app-restart] Server healthy ✅"
}

# Sync Codespaces from GitHub repo (⚠ deletes local changes) and restart server
gsync() {
  echo "[gsync] Hard resetting Codespaces to match remote main..."
  git fetch origin main
  git reset --hard origin/main
  git clean -fd

  echo "[gsync] Restarting app and waiting for health..."
  app-restart || { echo "[gsync] ❌ Failed to restart app"; return 1; }
  echo "[gsync] ✅ Synced and healthy"
}

# Rebase local changes on top of remote
grebase() {
  echo "[grebase] Rebasing local changes on top of remote main..."
  git fetch origin main
  git rebase origin/main
}
