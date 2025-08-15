#!/usr/bin/env bash
# Developer helpers for Codespaces & Repo sync

# Sync Codespaces from GitHub repo (⚠ deletes local changes)
gsync() {
  echo "[gsync] Hard resetting Codespaces to match remote main..."
  git fetch origin main
  git reset --hard origin/main
  git clean -fd
}

# Rebase local changes on top of remote
grebase() {
  echo "[grebase] Rebasing local changes on top of remote main..."
  git fetch origin main
  git rebase origin/main
}

# Kill anything on port 3000
free-port() {
  echo "[free-port] Killing processes on port 3000..."
  npx --yes kill-port 3000 >/dev/null 2>&1 || true
}

# Wait until API is healthy
health() {
  local url="http://localhost:3000"
  local retries=10
  local delay=1

  echo "[health] Checking API health at $url ..."
  for i in $(seq 1 $retries); do
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

# Restart app cleanly
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
  npx nodemon server.js &

  # Wait for server to start
  health || {
    echo "[app-restart] ERROR - Server failed health check. Exiting."
    kill %1 2>/dev/null || true
    return 1
  }
}
