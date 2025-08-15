#!/usr/bin/env bash
# Developer helpers for Codespaces & Repo sync
set -euo pipefail

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
  npx nodemon server.js
}

# Quick health check for API
health() {
  echo "[health] GET / and /healthz"
  curl -s http://localhost:3000/ | sed -e 's/^/[root] /'
  echo
  curl -s http://localhost:3000/healthz 2>/dev/null | sed -e 's/^/[healthz] /' || echo "[healthz] (endpoint not present)"
  echo
}
