Effenza Dashboard – Logging, Auditing & Retention

This document describes how Effenza Dashboard records, stores, and manages log data across all operational layers.
It is designed to meet traceability, accountability, and auditability requirements under ISO/IEC 27001 (A.8.15 / A.8.16) and data-protection laws such as GDPR and CPRA.

⸻

1. Overview

Effenza Dashboard implements a multi-channel logging framework with separation of operational and audit data.

Log Type
Directory
Purpose
Retention
HTTP Access
logs/http
Records all HTTP requests, response codes, durations, and client IPs.
60 days
Application
logs/app
Captures internal events, errors, and server lifecycle info.
60 days
Audit Trail
logs/audit
Documents business-relevant actions (login, user updates, permission changes).

Retention duration is configurable via the .env variable LOG_RETENTION_DAYS.
Logs older than this value are automatically removed by the nightly cleanup task.

⸻

2. File Naming & Structure

Each log channel writes daily rotated files with ISO-date suffixes:

logs/http/access-YYYY-MM-DD.log
logs/app/app-YYYY-MM-DD.log
logs/audit/audit-YYYY-MM-DD.log

All logs use UTF-8 and append mode; no files are ever overwritten within a day.

⸻

3. Log Content Examples

3.1 HTTP Access Log Entry

Example line written by Morgan middleware:

127.0.0.1 – – [04/Oct/2025:22:09:56 +0000] “GET /users?limit=3 HTTP/1.1” 200 204 “-” “curl/8.5.0”

Includes timestamp, request path, HTTP method, response code, and latency.
These records provide traceability for inbound API traffic and support rate-limit forensics.

⸻

3.2 Application Log Entry

Stored as structured JSON for reliable parsing:

{“ts”:“2025-10-04T22:09:56.412Z”,“level”:“error”,“message”:“uncaughtException”,“stack”:“TypeError: … “}

The utils/logger.js module appends all server events to the active daily file.
Uncaught exceptions and unhandled rejections are also captured automatically.

⸻

3.3 Audit Log Entry

Each significant user or admin action writes a record similar to:

{“ts”:“2025-10-04T22:10:00Z”,“actor_id”:1,“action”:“login”,“resource”:“session”,“pii”:false,“ip”:“127.0.0.1”,“user_agent”:“curl/8.5.0”,“details”:{“email”:“admin@example.com”}}

Sensitive identifiers are masked in standard audit queries, and full PII views require explicit admin access with justification.
This supports GDPR Article 30 (Records of Processing Activities) and ISO 27001 A.8.16 (Monitoring Activities).

⸻

4. Retention & Automatic Pruning

A housekeeping script (scripts/prune-logs.js) removes log files older than the configured retention window.
Default value: LOG_RETENTION_DAYS=60.
Execution options:

• Automatic via PM2 scheduler (02:15 UTC daily):
pm2 start scripts/prune-logs.js –cron “15 2 * * *” –name prune-logs

• Manual execution anytime:
node scripts/prune-logs.js

Each prune run records its summary in logs/app/cron.log.

⸻

5. Security Controls
	•	Log directories are excluded from Git (.gitignore) to prevent data leakage.
	•	File permissions default to read/write for the application user only.
	•	PII fields are minimized or hashed wherever possible.
	•	All administrative reads of audit data are themselves audited.
	•	Log rotation and retention settings are reviewed during ISO 27001 control A.12.4 audits.

⸻

6. Monitoring Integration

The following health and monitoring endpoints expose system status:

Endpoint
Purpose
Example
/healthz
Liveness probe for container orchestration.
{“status”:“ok”,“uptime”:42.5}
/readyz
Readiness probe confirming DB connectivity.
{“status”:“ready”,“timestamp”:“2025-10-04T22:00:00Z”}
/version
Build metadata (version, commit, branch).
{“version”:“1.0.2”,“commit”:“3154c88”}

These endpoints are safe for continuous monitoring and do not expose sensitive data.

⸻

7. Administrative Notes
	•	Log retention is validated monthly as part of internal control A.12.4.1 (Event logging).
	•	All pruning operations are self-logged.
	•	Any manual deletion must be documented with a change record in the internal audit log.
	•	Adjustments to retention periods must be approved by the Data Protection Officer (DPO).

⸻

8. References

• ISO/IEC 27001:2022 – Controls A.8.15, A.8.16, A.12.4
• EU GDPR – Articles 5, 30, 32, 33
• NIST SP 800-92 – Guide to Computer Security Log Management

⸻

✅ Status: Implemented as of version 1.0.2
Next milestone: integrate audit event hashing for tamper detection and log-export endpoints for compliance review.

