Security & Compliance Notes
Quick evidence mapping repository features to ISO/IEC 27001, GDPR/CPRA, and German Works Council requirements.
Last updated: 2025-11-15 | Version Baseline: v1.1.0-rc1

⸻

Summary

Auth and Session Control
  • JWT-based access tokens with refresh lifecycle (Sprint 3)
  • Endpoints /login, /auth/refresh, /auth/logout, /users/me validated
  • Token revocation, refresh rotation, and cookie-based refresh-token storage implemented

Audit and Logging
  • Endpoints: /audit?mode=aggregate and /audit?mode=detail
  • Default detail view masks actor_id, IP, and user_agent
  • PII access requires pii=true and reason=… plus admin role
  • Self-view requests are logged as “read audit_full” events
  • PM2 log rotation and auto-pruning implemented (ISO 27001 A.8.16 evidence)
  • Hash-chained audit_log with prev_hash + hash for tamper detection
  • Verification tool scripts/verify_audit_chain.js included

RBAC and Scope
  • Non-admins scoped automatically to their org subtree
  • Admin PII requests require a reason and self-log entry
  • User-facing audit export (/users/:id/audit) enforces self or admin-only access

Rate Limiting
  • Returns HTTP 429 after approximately 30 rapid calls

Operational Hygiene
  • Idempotent database migrations and seed scripts
  • CI/CD includes actionlint, secret scan, and smoke tests for /audit, /healthz, /readyz
  • /version endpoint exposes build metadata
  • Planned: audit-chain-verification CI job

⸻

Standards Mapping (Selected)

Logging – ISO 27001 A.8.15 / A.8.16
Evidence: utils/audit.js, routes/audit.js, audit_log schema, PM2 rotation, hash-chain with prev_hash + hash

Access Control – ISO 27001 A.5.15
Evidence: utils/authz.js, roles, permissions, and assignments tables

Abuse Protection – ISO 27001 A.8.23
Evidence: Rate-limit middleware returning HTTP 429 after burst

Data Minimization and Transparency – GDPR Article 5, 13 / CPRA 1798.100 et seq.
Evidence: Masked PII by default; explicit reason required for PII access in /audit; user-facing exports from /users/:id/audit always pseudonymize IPs (IPv4 /24, IPv6 /64) and shorten user-agents.

Right to Access and Erasure – GDPR Articles 15–17 / CPRA 1798.105
Evidence: Implemented /users/:id/audit export endpoint (JSON + CSV) for user-level audit history, suitable for “Right of Access” responses and Works Council requests.

Tamper Detection – ISO 27001 A.8.9 / A.8.11
Evidence: Implemented audit-trail hash chain (audit_log.hash, audit_log.prev_hash) and verification tool scripts/verify_audit_chain.js.

Employee Data Sensitivity – German Works Council (BetrVG §87)
Evidence: Masked by default; reason-logged PII access; self-audit entries; pseudonymized IP and UA in user-facing audit exports.

Continuous Compliance – ISO 27001 A.9.4 / A.12.7
Evidence: GitHub Actions secret-scan workflow; CI artifacts archived under docs/security; planned audit-chain CI verification.

⸻

Evidence (Log Snippets and Smoke Tests)

Paste current outputs here to maintain audit evidence.
npm run smoke:audit –quiet
npm run smoke-audit-detail.sh –quiet

Also include:
  • 429 burst test (HTTP 200/429 sequence)
  • Forbidden PII access as non-admin (HTTP 403)
  • GET /healthz and /readyz show HTTP 200
  • CI artifact logs stored under actions history
  • Hash-chain verification output (scripts/verify_audit_chain.js)

⸻

Responsibilities and Change Process
  1. Any change affecting security or compliance must update this file or reference another document under docs/security.
  2. PR descriptions must list impacted controls, for example “A.8.16 – log retention.”
  3. CI must pass actionlint, secret scan, smoke tests, and (when enabled) audit-chain verification before merge.
  4. Release notes must include version tag and commit ID.

⸻

Evidence (2025-11-15)

Aggregate Example (Admin)
Insert latest /audit?mode=aggregate output here.

Detail (Masked)
Insert masked /audit?mode=detail output here.

Detail (PII plus Reason)
Insert detail-with-PII output showing self-logged “read audit_full” entry.

Rate-Limit Burst
Insert example sequence showing HTTP 200 200 200 followed by 429 429.

Forbidden PII Access (Non-Admin)
Insert example JSON showing { "error": "Forbidden" }.

Hash-Chain Verification
Insert output from: node scripts/verify_audit_chain.js

⸻

User Audit Export (GDPR / CPRA)

Effenza Dashboard provides a user-level audit export endpoint for GDPR/CPRA “Right of Access” requests and Works Council scenarios.

Endpoint
  • Path: GET /users/:id/audit
  • Auth:
      – Uses req.actor (legacy actor middleware via X-User-Id)
      – Allows admins with audit_full or the user exporting their own data
  • Formats: JSON (default) or CSV via ?format=csv

JSON Response Example
(Replace example as needed)

{
  "user_id": 15,
  "from": "2025-01-01T00:00:00.000Z",
  "to": "2025-12-31T23:59:59.999Z",
  "count": 5,
  "events": [
    {
      "id": "1",
      "event_ts": "2025-11-15T07:48:25.081Z",
      "user_id": 15,
      "session_id": null,
      "event_type": "auth.login.success",
      "ip": "127.0.0.0/24",
      "user_agent": "curl/8.5.0",
      "payload": {
        "email": "demo.user@example.com"
      }
    }
  ]
}

CSV Response Example
(Replace example as needed)

id,event_ts,user_id,session_id,event_type,ip,user_agent,payload_json
1,2025-11-15T07:48:25.081Z,15,,auth.login.success,127.0.0.0/24,curl/8.5.0,"{""email"":""demo.user@example.com""}"

IP / User-Agent Privacy
  • IP addresses in /users/:id/audit exports are always pseudonymized:
      – IPv4 → a.b.c.0/24
      – IPv6 → first four hextets + ::/64
  • User-Agent strings are reduced to one token, truncated to 40 chars.
  • Full raw IP/UA remain available only in internal audit_log for administrative access.

Integrity
  • Each audit_log row includes hash and prev_hash.
  • scripts/verify_audit_chain.js performs full-chain revalidation.
  • Non-zero exit code indicates tampering.

⸻

Planned Additions (Next Update → v1.1.0)
  • Refresh-token and logout evidence for /auth/refresh and /auth/logout
  • License gate mock responses for /license/status
  • CI integration for audit-chain hash verification
