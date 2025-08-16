# Security & Compliance Notes

Quick evidence mapping repo features to **ISO/IEC 27001** controls, **GDPR/CPRA**, and **German Works Council** sensitivities.  
*Last updated: 2025-08-17*

---

## Summary

- **Audit endpoints**: `/audit?mode=aggregate` and `/audit?mode=detail`
- **PII guardrails**
  - Default `detail` masks `actor_id`, `ip`, `user_agent`
  - Full view requires `pii=true` **and** `reason=…` **and** admin role
  - PII access is **self-logged** as `read audit_full`
- **RBAC & scope**
  - Non-admins auto-scoped to their org subtree
  - Admins may request PII with reason (captured in audit trail)
- **Rate limiting**
  - API returns **HTTP 429** after a burst (~30 rapid calls)
- **Operational hygiene**
  - Idempotent migrations & seeds (unique constraints + upsert patterns)
  - CI: `actionlint` + smoke tests for `/audit`

---

## Standards mapping (selected)

| Area | Control / Rule | Evidence in repo |
|---|---|---|
| Logging | ISO 27001 A.8.15 / A.8.16 | `utils/audit.js`, `routes/audit.js`, `audit_log` schema, smoke tests |
| Access control | ISO 27001 A.5.15 | `utils/authz.js`, `roles`/`permissions`/`assignments` tables |
| Abuse protection | ISO 27001 A.8.23 | `/audit` rate-limit returning 429 after burst |
| GDPR/CPRA | Transparency & minimization | Default masked detail; explicit reason for PII access |
| German Works Council | Employee monitoring sensitivity | Masked by default; reason-required PII and self-logging |

---

## Evidence (local smoke)

Paste recent outputs from:
- `npm run smoke:audit --quiet`
- `npm run smoke:audit:detail --quiet`
- 429 burst check (HTTP codes showing 429s)
- A forbidden PII request as non-admin (HTTP 403)

_Example artifacts live in CI logs and can be pasted here for audits._

---

## Responsibilities & process

Changes that affect security/compliance must:
1. Update this file or link to a doc under `docs/security/`
2. Include notes in PR description
3. Pass CI (`actionlint` + smoke)

---

## Evidence (local smoke) — 2025-08-17

### Aggregate example (admin)

```json
{ /* paste your latest /audit?mode=aggregate JSON here */ }
```

### Detail (masked) example

```json
{ /* paste masked detail JSON here */ }
```

### Detail (PII) with reason + self-logging of `read audit_full`

```json
{ /* paste detail-with-PII JSON here */ }
```

### Rate limiting burst (shows 429s)

```
# paste your HTTP 200/429 sequence here
```

### Forbidden PII access as non-admin

```json
{ "error": "Forbidden" }
```
