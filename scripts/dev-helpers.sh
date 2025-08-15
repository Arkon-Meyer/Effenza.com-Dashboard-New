#!/usr/bin/env bash
set -euo pipefail

# Poll the API until it's healthy (tries /healthz, then /)
health() {
  local url="http://localhost:3000"
  local tries=12
  echo "[health] Checking $url ..."
  for i in $(seq 1 "$tries"); do
    if curl -s -o /dev/null -w "%{http_code}" "$url/healthz" | grep -q '^200$'; then
      echo "[health] OK (/healthz)"
      return 0
    elif curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q '^200$'; then
      echo "[health] OK (/)"
      return 0
    fi
    echo "[health] waiting... ($i/$tries)"
    sleep 1
  done
  echo "[health] ERROR – service did not become healthy"
  return 1
}

# Free the app port (harmless if nothing is listening)
free-port() {
  echo "[free-port] Killing processes on :3000 (if any)..."
  npx --yes kill-port 3000 >/dev/null 2>&1 || true
}

# Clean restart with background nodemon & health check
app-restart() {
  echo "[app-restart] Using Node 20 (if available)..."
  command -v nvm >/dev/null 2>&1 && nvm use 20 >/dev/null || true

  echo "[app-restart] Removing node_modules & lockfile..."
  rm -rf node_modules package-lock.json

  echo "[app-restart] Installing deps (skip smoke)..."
  POSTINSTALL_SKIP_SMOKE=1 npm install

  echo "[app-restart] Rebuilding better-sqlite3 (if needed)..."
  npm rebuild better-sqlite3 >/dev/null 2>&1 || true

  free-port

  echo "[app-restart] Ensuring nodemon is installed..."
  npx --yes nodemon -v >/dev/null 2>&1 || npm i -D nodemon

  echo "[app-restart] Stopping any existing nodemon..."
  pkill -f "nodemon server.js" >/dev/null 2>&1 || true

  echo "[app-restart] Starting nodemon in background..."
  npx nodemon server.js > /tmp/nodemon.log 2>&1 &

  if ! health; then
    echo "[app-restart] ❌ Health check failed. Last 80 lines of nodemon log:"
    tail -n 80 /tmp/nodemon.log || true
    return 1
  fi
  echo "[app-restart] ✅ Server healthy"
}

# Sync Codespaces to origin/main (⚠️ discards local changes) and restart
gsync() {
  echo "[gsync] Hard reset to origin/main..."
  git fetch origin main
  git reset --hard origin/main
  git clean -fd
  echo "[gsync] Restarting app..."
  app-restart
}
