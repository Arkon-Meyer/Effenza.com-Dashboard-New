# Dev Quickstart (Repo-first)

## Workflow

1. **Edit files in GitHub repo** → the repo is always the source of truth.  
2. **Sync and run in Codespaces:**

```bash
gsync             # pulls repo, clean-reinstalls, restarts, waits for /healthz
npm run ci:lint   # optional: lint GitHub workflows locally
