# Dev Quickstart (Repo-first)

## Workflow
1. Edit files **in GitHub repo** (source of truth).
2. In Codespaces:
   ```bash
   gsync           # pulls repo, clean-reinstalls, restarts, waits for /healthz
   npm run ci:lint # optional: lint GitHub workflows locally
