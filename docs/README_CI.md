# Continuous Integration (CI) Overview

This document describes how Effenza Dashboard’s CI/CD workflows enforce code quality, security, and compliance.  
It outlines the active GitHub Actions workflows, local testing options, and their alignment with ISO, SOC 2, and GDPR controls.

---

## ⚙️ Active Workflows

| Workflow File | Purpose | Key Triggers |
|----------------|----------|--------------|
| `.github/workflows/ci.yml` | Runs audits, linting, and smoke tests before merge. | `push`, `pull_request` |
| `.github/workflows/secret-lint.yml` | Scans repository for exposed secrets or tokens. | `push`, `pull_request` |

---

## 🧩 Workflow Summary

### CI (Main Quality & Security Workflow)
- Ensures dependency integrity via `npm audit --omit=dev`
- Runs smoke tests on audit endpoints:
  - `bash scripts/smoke-audit.sh`
  - `bash scripts/smoke-audit-detail.sh`
- Enforces compliance gate on protected branches (`main`)
- Produces workflow summary and artifacts for each run

### Secret Scan Workflow
- Uses GitHub Actions + `git grep -P` to identify potential token or key leaks  
- Detects patterns for:
  - GitHub tokens (`ghp_…`, `GITHUB_TOKEN`)
  - NPM/GHCR tokens (`NPM_TOKEN`, `_authToken`, `GHCR_TOKEN`)
  - AWS / Google / Slack credentials
  - Private key headers (`-----BEGIN … PRIVATE KEY-----`)
- Auto-fails on protected branches (`main`, PRs targeting `main`)
- Uploads results as an artifact for review  
- Emits soft warnings on feature branches

---

## 🧮 Compliance Alignment

| Standard | Control Reference | Description |
|-----------|------------------|--------------|
| **ISO/IEC 27001:2022** | A.8.16, A.8.28 | Control of changes and technical vulnerability management |
| **SOC 2 CC 7.x** | Change Management, Logical Access | Automated testing and secure CI/CD pipeline controls |
| **EU GDPR Art. 32** | Security of Processing | Regular assessment and review of security measures |

---

## 🧪 Local Testing

Developers can emulate CI checks before pushing:

```bash
# Run core lint and audit locally
npm audit --omit=dev
bash scripts/smoke-audit.sh
bash scripts/smoke-audit-detail.sh

To dry-run the secret scan (for debugging only):
# Extracts and runs same scan logic locally
bash -c "$(grep 'run: \|' .github/workflows/secret-lint.yml | cut -d'|' -f2-)"

✅ Status
	•	✅ Implemented as of version 1.0.3
	•	🧩 Next milestone: integrate code-signing verification for build artifacts
	•	🔐 CI logs retained for 60 days and pruned automatically

⸻

Maintainer: Effenza Engineering dev@effenza.com
Last updated: 2025-10-05







