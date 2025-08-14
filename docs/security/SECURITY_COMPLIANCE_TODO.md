# Security & Compliance TODO (ISO 27001 / GDPR Readiness)

> Living checklist. Each item should map to an Issue/PR.

## 1. Security & Privacy by Design
- [ ] TLS everywhere; HSTS on public endpoints
- [ ] Encrypt PII at rest; keys in Azure Key Vault; rotation doc
- [ ] Secrets management (env/Key Vault); no secrets in repo/logs
- [ ] Data minimization (review fields); data classification tags (PII/Confidential/Public)

## 2. Authentication & Authorization
- [ ] Replace temp header auth with Azure AD (OIDC)
- [ ] RBAC middleware on all write routes (viewer/editor/group-admin/dashboard-admin)
- [ ] Least privilege defaults; deny-by-default patterns
- [ ] Session security (short-lived cookies/JWT, SameSite/HttpOnly/Secure)
- [ ] MFA for admin roles (policy)

## 3. Audit & Logging
- [ ] Structured JSON logs with user id, action, resource id, outcome, request id
- [ ] Audit trail table for create/update/delete and privilege changes
- [ ] Immutable copy of logs (Azure Blob immutability or equivalent)
- [ ] User-facing activity history (their own actions)
- [ ] Provider admin dashboard: metadata only (zero-knowledge)

## 4. GDPR Compliance
- [ ] Privacy policy: zero-knowledge, controller/processor clarity
- [ ] Right to be forgotten (delete/anonymize) + test plan
- [ ] Data export (JSON/CSV) + test plan
- [ ] Retention schedule for logs & data; documented & enforced
- [ ] DPA template; subprocessor list

## 5. Secure SDLC & Ops
- [ ] Branch protection, PR reviews, CI status checks
- [ ] CI: SAST (code scanning), dependency scan (Dependabot/audit)
- [ ] Secrets scanning (pre-commit/CI)
- [ ] Threat model diagram; risk register; asset inventory
- [ ] Backups: encrypted, tested restore, documented RTO/RPO

## 6. Incident Response
- [ ] IR plan with severity levels and contacts
- [ ] Breach procedure (GDPR 72h); notification templates
- [ ] Run one tabletop exercise pre-MVP; log outcomes

_Keep this file updated per sprint._
