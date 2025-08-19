#!/usr/bin/env bash
# Minimal, never-fail init for Codespaces
set +e
echo "[dev] init at $(date +%T) — $PWD"
# (do NOT `exit 1` here)
# --- GitHub CLI: prefer user token over Codespaces token ---
fix-gh() {
  unset GITHUB_TOKEN GH_TOKEN
  if ! gh auth status -h github.com >/dev/null 2>&1; then
    echo "[fix-gh] Not logged in. Running browser login…"
    gh auth login --hostname github.com --web
  fi
  if ! gh auth status -h github.com | grep -q "project"; then
    echo "[fix-gh] Adding scopes (project, repo, read:org)…"
    gh auth refresh -h github.com -s project -s repo -s read:org
  fi
  echo "[fix-gh] gh is ready."
}
