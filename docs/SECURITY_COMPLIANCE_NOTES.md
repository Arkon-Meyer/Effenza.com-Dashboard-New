Security & Compliance Notes
Quick evidence mapping repository features to ISO/IEC 27001, GDPR/CPRA, and German Works Council requirements.
Last updated: 2025-10-05 | Version Baseline: v1.0.3

⸻

Summary

Auth and Session Control
	•	JWT-based access tokens (refresh lifecycle in progress → Sprint 3)
	•	Endpoints /login, /users/me, and route-protection middleware verified
	•	Planned: /logout, token-revocation list, and refresh rotation

Audit and Logging
	•	Endpoints: /audit?mode=aggregate and /audit?mode=detail
	•	Default detail view masks actor_id, ip, and user_agent
	•	PII access requires pii=true and reason=… plus admin role
	•	Full-view reads self-log as “read audit_full”
	•	PM2 log rotation and auto-pruning implemented (ISO 27001 A.8.16 evidence)

RBAC and Scope
	•	Non-admins scoped automatically to their org subtree
	•	Admin PII requests require a reason and self-log entry

Rate Limiting
	•	Returns HTTP 429 after approximately 30 rapid calls

Operational Hygiene
	•	Idempotent database migrations and seed scripts
	•	CI/CD includes actionlint, secret scan, and smoke tests for /audit, /healthz, /readyz
	•	/version endpoint exposes build metadata

⸻

Standards Mapping (Selected)

Logging – ISO 27001 A.8.15 / A.8.16
Evidence: utils/audit.js, routes/audit.js, audit_log schema, PM2 rotation

Access Control – ISO 27001 A.5.15
Evidence: utils/authz.js, roles, permissions, and assignments tables

Abuse Protection – ISO 27001 A.8.23
Evidence: Rate-limit middleware returning HTTP 429 after burst

Data Minimization and Transparency – GDPR Article 5, 13 / CPRA 1798.100 et seq.
Evidence: Masked PII by default; explicit reason required for PII access

Right to Access and Erasure – GDPR Articles 15–17 / CPRA 1798.105
Evidence: Planned /users/:id/audit export endpoint (Sprint 3)

Tamper Detection – ISO 27001 A.8.9 / A.8.11
Evidence: Planned audit-trail hash chain (Sprint 3)

Employee Data Sensitivity – German Works Council (BetrVG §87)
Evidence: Masked by default; reason-logged PII access; self-audit entries

Continuous Compliance – ISO 27001 A.9.4 / A.12.7
Evidence: GitHub Actions secret-scan workflow; CI artifacts archived under docs/security

⸻

Evidence (Log Snippets and Smoke Tests)

Paste current outputs here to maintain audit evidence.
npm run smoke:audit –quiet
npm run smoke:audit:detail –quiet

Also include:
	•	429 burst test (HTTP 200/429 sequence)
	•	Forbidden PII access as non-admin (HTTP 403)
	•	GET /healthz and /readyz show HTTP 200
	•	CI artifact logs stored under actions history

⸻

Responsibilities and Change Process
	1.	Any change affecting security or compliance must update this file or reference another document under docs/security.
	2.	PR descriptions must list impacted controls, for example “A.8.16 – log retention.”
	3.	CI must pass actionlint, secret scan, and smoke tests before merge.
	4.	Release notes must include version tag and commit ID.

⸻

Evidence (2025-10-05)

Aggregate Example (Admin)
Insert latest /audit?mode=aggregate output here.

Detail (Masked)
Insert masked /audit?mode=detail output here.

Detail (PII plus Reason)
Insert detail-with-PII output showing self-logged “read audit_full” entry.

Rate-Limit Burst
Insert example sequence showing HTTP 200 200 200 followed by 429 429.

Forbidden PII Access (Non-Admin)
Insert example JSON showing { “error”: “Forbidden” }.

⸻

Planned Additions (Next Update → v1.1.0)
	•	Refresh-token and logout evidence for /auth/refresh and /auth/logout
	•	User audit export for /users/:id/audit
	•	License gate mock responses for /license/status
	•	Audit-trail hash-chain validation report
