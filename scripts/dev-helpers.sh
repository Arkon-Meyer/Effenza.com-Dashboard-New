#!/usr/bin/env bash
# scripts/dev-helpers.sh

# Hard overwrite Codespaces with GitHub main (⚠️ discards local changes)
gsync() {
  echo "[gsync] syncing Codespaces to origin/main (local changes will be lost)…"
  git rebase --abort 2>/dev/null || true
  git merge  --abort 2>/dev/null || true
  git fetch origin main && git reset --hard origin/main && git clean -fd
  echo "[gsync] done."
}

# Rebase your local work on top of GitHub main (keeps local edits)
grebase() {
  echo "[grebase] pulling with rebase…"
  git fetch origin main && git pull --rebase origin main
  echo "[grebase] done."
}

# Fresh deps + rebuild sqlite + restart app (Codespaces)
app-restart() {
  echo "[app-restart] using Node 20, reinstalling deps, rebuilding better-sqlite3, restarting…"
  nvm use 20 >/dev/null
  rm -rf node_modules package-lock.json
  npm ci
  npm rebuild better-sqlite3
  npm start
}
