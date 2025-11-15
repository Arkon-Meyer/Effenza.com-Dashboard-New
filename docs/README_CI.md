Continuous Integration (CI) Overview

This document describes how Effenza Dashboard CI and CD workflows enforce code quality, security, and compliance.
It outlines the active GitHub Actions workflows, local testing options, and their alignment with ISO, SOC 2, and GDPR controls.

⸻

ACTIVE WORKFLOWS
	1.	.github/workflows/ci.yml
Purpose: Runs audits, linting, and smoke tests before merge
Triggers: push, pull_request
	2.	.github/workflows/secret-lint.yml
Purpose: Scans repository for exposed secrets or tokens
Triggers: push, pull_request
	3.	.github/workflows/audit-chain-verify.yml
Purpose: Verifies tamper-evident audit_log hash chain
Triggers: push, pull_request

⸻

WORKFLOW SUMMARY

MAIN CI WORKFLOW
	•	Ensures dependency integrity using “npm audit –omit=dev”
	•	Runs smoke tests on audit endpoints
scripts/smoke-audit.sh
scripts/smoke-audit-detail.sh
	•	Enforces compliance gates on protected branches
	•	Produces workflow summary and artifacts

SECRET SCAN WORKFLOW
	•	Uses pattern-based scanning to detect possible secrets
GitHub tokens
NPM or GHCR tokens
AWS, Google, Slack credentials
Private key headers
	•	Auto-fails on protected branches
	•	Uploads results as artifact
	•	Soft warnings on feature branches

AUDIT CHAIN VERIFICATION WORKFLOW
	•	Starts temporary PostgreSQL service in GitHub Actions
	•	Uses local tooling:
node scripts/db-wait.js
node scripts/migrate_audit_log.js
node scripts/verify_audit_chain.js
	•	Verifies hash and prev_hash fields for tamper detection
	•	Fails builds if audit chain validation fails
	•	Provides automated compliance evidence for Works Council, GDPR, ISO 27001 A.8.11

⸻

COMPLIANCE ALIGNMENT

ISO 27001 A.8.16 and A.8.28
Change control and vulnerability management

ISO 27001 A.8.9 and A.8.11
Event logging and log protection (tamper-evident audit_log + CI verification)

SOC 2 CC 7.x
Change management and logical access enforcement

GDPR Article 32
Regular review of technical measures including logging, access, and integrity controls

⸻

LOCAL TESTING

Run core dependency and audit checks locally:
npm audit –omit=dev
bash scripts/smoke-audit.sh
bash scripts/smoke-audit-detail.sh

Run secret-scan logic locally (approximation of CI rules):
Use grep to scan for private keys or tokens in the repository.

Run audit-chain verification locally:
Ensure PostgreSQL is running and environment variables match development setup, then run:
node scripts/migrate_audit_log.js
node scripts/verify_audit_chain.js

⸻

STATUS

Implemented as of version 1.0.3
	•	CI and secret scanning
	•	Smoke audit tests

Implemented as of version 1.1.0-rc1
	•	Audit log hash-chain verification workflow

Next milestone
	•	Code-signing verification for build artifacts

CI logs retained for 60 days and pruned automatically.

⸻

Maintainer: Effenza Engineering
dev@effenza.com
Last updated: 2025-11-15

