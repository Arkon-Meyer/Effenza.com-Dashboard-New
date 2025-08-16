# Dev Quickstart (Repo-first)

The GitHub repo is the source of truth. Edit in GitHub → pull/sync in Codespaces.

## Prerequisites (already satisfied in Codespaces)
- Node **20.x** (enforced by `engines`)
- Git / curl available in the shell

> Tip: The `.vscode` profile sources `scripts/dev-helpers.sh` so you get `gsync`, `app-restart`, `free-port`, and `health` in the terminal.

---

## One-time (first run)
```bash
gsync               # hard-sync to main, clean reinstall, start server
