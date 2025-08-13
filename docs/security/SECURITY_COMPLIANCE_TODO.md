# Security & Compliance TODO (ISO 27001 / GDPR Readiness)

> Living document to track our incremental hardening and compliance steps.

---

## 1. Identity, Access, and AuthZ
- [ ] Introduce user accounts and sessions (no “X-User-Id” header in prod).
- [ ] Role-based access control (viewer/editor/group-admin/dashboard-admin) enforced server-side.
- [ ] Least-privilege defaults; deny by default.
- [ ] Admin endpoints protected (authN + authZ).
- [ ] Session management: secure cookies, SameSite, rotation, logout, inactivity timeout.

## 2. Data Protection & Privacy
- [ ] Pseudonymize or minimize personal data (collect only what’s needed).
- [ ] Data classification policy (Public / Internal / Confidential / Restricted).
- [ ] Encryption in transit (TLS everywhere) and at rest (DB/file encryption; key mgmt).
- [ ] Data retention & deletion policy; implement delete workflows (users, exports, backups).
- [ ] Data subject rights (GDPR): export / rectify / delete / restrict processing.

## 3. Application Security
- [ ] Input validation & output encoding for all endpoints/UI (prevent injection/XSS).
- [ ] Parameterized SQL (already using better-sqlite3 prepared statements).
- [ ] Consistent error handling (no sensitive details in responses/logs).
- [ ] Rate limiting & basic abuse protection on write endpoints.
- [ ] CSRF protection for state-changing requests (if cookie-based auth).
- [ ] Dependency hygiene (automated updates/audits, lockfile review).

## 4. Logging, Monitoring, and Incident Response
- [ ] Structured, contextual logs (user id, request id, action, outcome).
- [ ] Centralized log storage with retention & tamper-resistance.
- [ ] Basic metrics (requests, errors, latency) and alerts.
- [ ] Security event logging (auth failures, privilege changes, deletion events).
- [ ] Incident response runbook (detect, analyze, contain, eradicate, recover, post-mortem).

## 5. Secure SDLC & Change Control
- [ ] Branch protection, PR reviews, and mandatory CI status checks.
- [ ] CI pipeline for lint, tests, SCA (vuln scan), and container image scan (if applicable).
- [ ] Secrets scanning (pre-commit & CI). No secrets in code or logs.
- [ ] Reproducible builds; versioned artifacts; deployment approvals.

## 6. Infrastructure & Backups
- [ ] Backup strategy (frequency, encryption, offsite, restoration drills).
- [ ] Hardening baseline (OS/containers), patched regularly.
- [ ] Environment separation (dev/test/stage/prod) with isolated credentials.
- [ ] Principle of least privilege for runtime identities/secrets.

## 7. Policies & Documentation
- [ ] Security policy (high-level commitments & responsibilities).
- [ ] Access control policy; password/session standards.
- [ ] Data protection & retention policy.
- [ ] Vendor management (if third parties used): DPAs, subprocessors list.

## 8. Risk & Audit
- [ ] Asset inventory (systems, data stores, third parties).
- [ ] Risk register (risks, owners, mitigation, review cadence).
- [ ] Periodic internal audits; track findings to closure.
- [ ] Pen test / external review before GA.

---

### Notes
- Keep this document updated as work progresses.
- Each checkbox should map to an issue/PR for traceability.
- Aim for “small, continuous improvements” rather than big-bang changes.
