# Security, Privacy & Compliance Milestones (MVP → GA)

**Goal:** Ship an MVP that is secure-by-design, GDPR-aligned, and ISO 27001–ready, using a zero-knowledge and data-minimal philosophy appropriate for B2B.

---

## Core Principles
- **Zero-knowledge:** Provider cannot view or edit tenant business data. Admin dashboards show *metadata only*.
- **Data minimization:** Collect and retain only what’s essential for the service.
- **Least privilege:** Deny-by-default access; elevate narrowly, temporarily, and auditable.
- **Defense in depth:** AuthN → RBAC → validation → logging → monitoring → backups → IR.
- **Traceability:** Every sensitive action is attributable (who, what, when, where).

---

## Phase 1 — Foundations (Weeks 1–2)
**Objectives**
- Establish controls that are cheapest to add now and expensive to retrofit later.

**Tasks**
- RBAC middleware enforcement (viewer/editor/group-admin/dashboard-admin).
- Secrets in env/Key Vault; no secrets in code or logs.
- Structured JSON logging (user id, action, resource id, outcome, request id).
- Basic audit table (append-only) for create/update/delete & role changes.
- HTTPS/TLS enforced in all environments; HSTS on public endpoints.
- Dependency hygiene: GitHub Dependabot + `npm audit` in CI.

**Acceptance**
- All write routes check role; attempts are logged with deny reasons.
- No plaintext secrets in repo; env example file documented.
- Logs visible locally and redact sensitive fields.

---

## Phase 2 — Data Protection & GDPR (Weeks 2–4)
**Objectives**
- Encrypt, minimize, and prepare for data-subject rights.

**Tasks**
- Encryption at rest: encrypt PII fields or full DB (keys in Azure Key Vault).
- Data deletion (Right to be Forgotten): delete/anonymize user data + related artifacts.
- Data export (Portability): JSON/CSV export for a single user.
- Retention: define & implement log/data retention windows.
- Privacy Policy (internal draft): zero-knowledge posture; who is data controller/processor.

**Acceptance**
- Test plan proves delete/export work and are auditable.
- Keys never leave Key Vault; rotation procedure exists.
- Privacy policy stored in `/docs/policies/`.

---

## Phase 3 — Authentication & Sessions (Weeks 3–5)
**Objectives**
- Replace temporary header auth with real identity.

**Tasks**
- Integrate Azure AD (OIDC); map AAD subject → internal user id.
- Short-lived sessions (secure cookies or JWT + refresh); SameSite/HttpOnly/Secure flags.
- MFA policy for admins (MVP optional, post-MVP required).
- CSRF protection if using cookies.

**Acceptance**
- `/me` returns AAD-backed identity.
- Admin routes require MFA-capable accounts (policy documented).

---

## Phase 4 — Auditing, Monitoring & IR (Weeks 4–6)
**Objectives**
- Prove we can detect, investigate, and recover.

**Tasks**
- Immutable/Write-Once logs copy (e.g., Azure Blob immutability).
- User-facing activity history (their own logins/changes).
- Provider admin dashboard (metadata only: counts/latency/errors).
- Alerting for auth failures, privilege changes, spikes in 4xx/5xx.
- Incident Response plan + single tabletop exercise (pre-MVP).

**Acceptance**
- Alerts reach a human; runbook shows steps for containment/recovery.
- Audit logs pass a simple tamper-test (hash/immutability).

---

## Phase 5 — Compliance Readiness (Parallel)
**Objectives**
- Start ISO 27001 artifacts early.

**Tasks**
- Asset inventory; Risk register; Policies (Security, Access Control, Data Protection).
- DPA template for customers; Subprocessor list.
- Threat model diagram (data flows, trust boundaries).
- Secure SDLC: PR reviews, branch protection, CI checks (SAST, dependency scan).

**Acceptance**
- Evidence docs live in `/docs/security/` and are version-controlled.
- Each checkbox links to an issue/PR for traceability.

---

## Deliverables
- Encrypted storage + RBAC enforced + AAD auth + audit logs + deletion/export endpoints.
- `/docs/security/` with policies, procedures, and milestone status.

## Success Metrics
- 100% of write routes covered by RBAC middleware and audit logs.
- 0 secrets in repo; CI secrets scan green.
- ≤ 24h key rotation achievable; ≤ 72h breach reporting playbook.
- Time-to-detect & time-to-recover tracked in a simple runbook log.

## Ownership & RACI (MVP)
- **Owner:** Product Security (you initially; later: internal team)
- **Implement:** Backend devs; Infra/DevOps for AAD/Key Vault/CI
- **Review:** Product Owner & Security Reviewer
- **Approve:** Founder/Exec sponsor

_Last updated: {{YYYY-MM-DD}}_
