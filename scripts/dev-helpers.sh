#!/usr/bin/env bash
set -euo pipefail

health() {
  local url="http://localhost:3000"
  for i in {1..12}; do
    curl -s -o /dev/null -w "%{http_code}" "$url/healthz" | grep -q '^200$' && {
      echo "[health] OK"; return 0; }
    sleep 1
  done
  echo "[health] ERROR"; return 1
}

free-port(){ npx --yes kill-port 3000 >/dev/null 2>&1 || true; }

app-restart() {
  nvm use 20 >/dev/null || true
  rm -rf node_modules package-lock.json
  POSTINSTALL_SKIP_SMOKE=1 npm install
  npm rebuild better-sqlite3 || true
  free-port
  npx --yes nodemon -v >/dev/null 2>&1 || npm i -D nodemon
  npx nodemon server.js > /tmp/nodemon.log 2>&1 &
  if ! health; then tail -n 80 /tmp/nodemon.log; return 1; fi
  echo "[app-restart] Server healthy ✅"
}

gsync() {
  echo "[gsync] Syncing to origin/main..."
  git fetch origin main
  git reset --hard origin/main
  git clean -fd
  echo "[gsync] Restarting app..."
  app-restart
}
