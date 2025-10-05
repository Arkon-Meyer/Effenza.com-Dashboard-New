🧩 Continuous Integration (CI) Overview

This document summarizes the CI/CD automation for the Effenza Dashboard project.
All workflows run on GitHub Actions, optimized for security, traceability, and reproducibility.

⸻

🚦 Active Workflows
Workflow
Trigger
Purpose
Enforces / Validates
ci.yml
push, pull_request
Runs core checks (lint, smoke tests, dependency audit)
Code quality, supply-chain hygiene
secret-lint.yml
push, pull_request
Scans repo for accidentally committed secrets or tokens
ISO 27001 A.8.11, A.12.1, A.12.4 / GDPR Art. 32
(future) build-and-deploy.yml
workflow_dispatch, release
Build and optionally deploy to staging or production

🧰 Security Hardening
	•	Ephemeral runners — each job runs in a fresh GitHub-hosted VM; no persistent state
	•	Minimal permissions — workflows default to contents: read unless elevated
	•	No plaintext secrets — sensitive values injected only via repository secrets or OIDC
	•	Automatic secret scan — blocks merges to main if any leak pattern is detected
	•	Software Bill of Materials (SBOM) planned for future versions (npm audit + cyclonedx)

🧾 Compliance Alignment
Standard
Control Reference
Description
ISO/IEC 27001:2022
A.8.16, A.8.28
Continuous monitoring & change management
SOC 2 CC 7.x
Change Management, Logical Access
Automated enforcement of secure pipelines
EU GDPR Art. 32
Security of Processing
Regular vulnerability assessments and access contr

🧪 Local Testing

Developers can emulate CI checks before pushing:
# Run core lint and audit locally
npm audit --omit=dev
bash scripts/smoke-audit.sh
bash scripts/smoke-audit-detail.sh

To dry-run the secret scan:
bash -c "$(awk '/run: \|/,/^      - name/' .github/workflows/secret-lint.yml | sed 's/^ *run: //')"

(This extracts and executes the same scan logic locally — for debugging only.)

🧭 CI Maintenance Checklist
	•	Rotate GitHub Actions tokens quarterly
	•	Review repository secrets under Settings → Secrets and Variables → Actions
	•	Validate workflow permissions follow least-privilege principles
	•	Monitor failing or skipped jobs weekly
	•	Reference versioned Actions (e.g. @v4 instead of @main) for reproducibility

⸻

✅ Status

As of v1.0.3, CI covers:
	•	Source integrity verification
	•	Dependency and secret scanning
	•	Audit evidence logging to artifacts

Next milestone:
Integrate dependency SBOM generation and automated changelog export on release tagging.
