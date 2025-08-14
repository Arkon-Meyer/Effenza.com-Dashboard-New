# Project Documentation

## Security & Compliance

- **Milestones plan:**  
  [`docs/security/SECURITY_COMPLIANCE_MILESTONES.md`](security/SECURITY_COMPLIANCE_MILESTONES.md)

- **Working checklist:**  
  [`docs/security/SECURITY_COMPLIANCE_TODO.md`](security/SECURITY_COMPLIANCE_TODO.md)

**Principles:** zero-knowledge by default, data minimization, least privilege, defense in depth, and full traceability.  
Evidence, policies, and procedures will live under `docs/security/` and be version-controlled.

## Contributing

- Use PRs to merge into `main`.  
- Each security/compliance change should reference a checklist item.  
- CI must pass (lint/tests/security scans) before merge.

---

## 🔄 Codespaces ↔ Repo Sync Workflow

We edit **in the GitHub repo first**, then sync into Codespaces.

### Setup (one-time in Codespaces)

```bash
chmod +x scripts/dev-helpers.sh
source scripts/dev-helpers.sh
