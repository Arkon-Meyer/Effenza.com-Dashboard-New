#!/usr/bin/env bash
set -euo pipefail

# Pull + hard reset local to origin/main (DANGER: discards local changes)
gsync() {
  git fetch origin main
  git reset --hard origin/main
  echo "[gsync] done."
}

# Rebase local changes on top of origin/main (safe)
grebase() {
  git fetch origin main
  git rebase origin/main
  echo "[grebase] done."
}

# Fresh deps + rebuild + restart app
app-restart() {
  echo "[app-restart] using Node 20, reinstalling deps, rebuilding better-sqlite3, restarting…"
  nvm use 20 >/dev/null

  rm -rf node_modules

  if [ -f package-lock.json ]; then
    npm ci || npm install
  else
    npm install
  fi

  # rebuild native module; don't fail the whole script if rebuild is a no-op
  npm rebuild better-sqlite3 || true

  # ensure nodemon exists
  if ! npx --yes nodemon -v >/dev/null 2>&1; then
    npm i -D nodemon
  fi

  echo "> starting dev server with nodemon…"
  npx nodemon server.js
}
