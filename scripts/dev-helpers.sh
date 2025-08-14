#!/usr/bin/env bash

# Dev helper commands for Codespaces & local environments

# Hard overwrite from GitHub (WARNING: deletes local changes)
gsync() {
  git fetch origin &&
  git reset --hard origin/main &&
  git clean -fd
}

# Safe pull that keeps local edits
grebase() {
  git fetch origin &&
  git stash -u -m "wip before sync" &&
  git pull --rebase origin main &&
  git stash drop || true
}

# Fresh dependencies + rebuild + restart app
app-restart() {
  nvm use 20 &&
  rm -rf node_modules package-lock.json &&
  npm ci &&
  npm rebuild better-sqlite3 &&
  pkill -f node || true &&
  npm start
}

echo "Loaded dev helpers: gsync, grebase, app-restart"
