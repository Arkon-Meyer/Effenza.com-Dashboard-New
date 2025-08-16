# Security & Compliance Notes

This document tracks quick evidence snippets that map repo features to controls
(ISO/IEC 27001), GDPR/CPRA principles, and Works Council sensitivities.

_Last updated: 2025-08-16_

## Summary

- **Audit endpoints**: `/audit?mode=aggregate|detail`
- **PII guardrails**:
  - Default `detail` view omits `actor_id`, `ip`, `user_agent`.
  - PII view requires `pii=true` + `reason=...` and **admin** role.
  - PII access is **self-logged** as `read audit_full`.
- **Rate limiting**: burst requests receive HTTP **429** after ~30 requests.
- **RBAC scoping**: non-admins are restricted to their org subtree.

## Evidence (Quick)

- **PII protection (403 for non-admins)**  
  Command:  
  ```bash
  curl -s -H "X-User-Id: 5" \
    "http://localhost:3000/audit?mode=detail&pii=true&limit=1&reason=test" | jq .
