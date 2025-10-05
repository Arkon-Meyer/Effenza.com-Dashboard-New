Effenza Dashboard

Admin Dashboard MVP (backend + minimal UI) for effenza.com
Built with Node.js (20.x), Express, and PostgreSQL (pg).

⸻

🚀 Getting Started

Clone the repo, install dependencies, migrate and seed the demo database, then start the server (port 3000).

git clone https://github.com/effenza/effenza-dashboard.git
cd effenza-dashboard
npm ci
npm run migrate
npm run seed
npm start

⸻

📑 Project Documentation
	•	Dev quickstart and Codespaces workflow: docs/DEV_QUICKSTART.md
	•	Security milestones: docs/security/SECURITY_COMPLIANCE_MILESTONES.md
	•	Working checklist: docs/security/SECURITY_COMPLIANCE_TODO.md
	•	Logging & retention: docs/README_LOGGING.md

Principles: zero-knowledge by default, data minimization, least privilege, defense in depth, and full traceability.
Evidence, policies, and procedures live under docs/security/ and are version-controlled.

⸻

🔐 Security & Compliance Notes

• Audit logging
	•	All access and data mutations are automatically logged.
	•	Sensitive PII (actor_id, IP, UA) is masked in default views.
	•	Full-detail access requires admin rights and a justification, which itself is logged.

• Data protection (GDPR / CPRA)
	•	Org-scoped access and strict data minimization.
	•	Hooks exist for data subject requests (export/delete by user).

• ISO/IEC 27001 alignment (selected)
	•	A.8.16 / A.8.15 – activity logging and monitoring
	•	A.5.15 – least-privilege RBAC enforced server-side
	•	A.8.23 – rate limiting to deter abuse

• German Workers Council
	•	Employee activity masked by default.
	•	PII access requires explicit reason and is auditable.
	•	Scoping limits managers to their org subtree.

  🧾 Logging & Retention

Effenza Dashboard maintains three structured log channels:

• HTTP access logs → logs/http/access-YYYY-MM-DD.log
Records all API requests, status codes, and response times.

• Application logs → logs/app/app-YYYY-MM-DD.log
Captures runtime events, errors, and server state changes.

• Audit logs → logs/audit/audit-YYYY-MM-DD.log
Documents user actions and admin operations for compliance.

Logs rotate daily and are retained for 60 days (configurable via .env: LOG_RETENTION_DAYS=60).
A scheduled cleanup task runs automatically via PM2 each night at 02:15 UTC, ensuring log storage remains compact and compliant.
Manual cleanup is available anytime with: node scripts/prune-logs.js

For a full overview, see docs/README_LOGGING.md.

🩺 System Monitoring Endpoints

Endpoint
Description
Example Response
/healthz
Liveness probe showing uptime and operational status.
{“status”:“ok”,“uptime”:125.34}
/readyz
Readiness probe confirming app and DB availability.
{“status”:“ready”,“timestamp”:“2025-10-04T22:00:00Z”}
/version
Build metadata: version, commit, branch, build time.
{“version”:“1.0.2”,“commit”:“3154c88”}

These endpoints can be used for Docker, Kubernetes, or monitoring tools (Prometheus, Grafana, etc.) to check runtime status and build integrity.

⸻

🔄 Codespaces ↔ Repo Sync (repo-first)

We edit in GitHub (source of truth), then sync into Codespaces to run.

Quick start in Codespaces:

source scripts/dev-helpers.sh
gsync

Smoke tests:

npm run smoke:audit –quiet
npm run smoke:audit:detail –quiet

⸻

🤝 Contributing

• Use PRs to merge into main.
• Reference a security/compliance checklist item in related changes.
• CI (lint/tests/security scans) must pass before merge.

⸻

✅ Status summary:
Authentication (JWT) ✔
PostgreSQL migration ✔
Version endpoint ✔
Structured logging & retention ✔
System monitoring endpoints ✔
Audit compliance framework ✔

