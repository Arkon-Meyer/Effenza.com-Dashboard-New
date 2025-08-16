# Effenza Dashboard

## 📑 Project Documentation

### Security & Compliance

- **Milestones plan:**  
  [`docs/security/SECURITY_COMPLIANCE_MILESTONES.md`](docs/security/SECURITY_COMPLIANCE_MILESTONES.md)

- **Working checklist:**  
  [`docs/security/SECURITY_COMPLIANCE_TODO.md`](docs/security/SECURITY_COMPLIANCE_TODO.md)

**Principles:** zero-knowledge by default, data minimization, least privilege, defense in depth, and full traceability.  
Evidence, policies, and procedures will live under `docs/security/` and be version-controlled.

---

## 🤝 Contributing

- Use PRs to merge into `main`.  
- Each security/compliance change should reference a checklist item.  
- CI must pass (lint/tests/security scans) before merge.

---

## Security & Compliance Notes

- **Audit logging**
  - All access and mutations are logged in SQLite `audit_log`.
  - Default `detail` view masks personal identifiers (no actor_id, IP, UA).
  - Full PII view requires admin role **and** a reason; PII access is self-logged.

- **Data protection (GDPR / CPRA)**
  - Data minimization by default; org-scoped access.
  - Supports responding to data subject requests (export/delete per subject).

- **ISO/IEC 27001 alignment (selected controls)**
  - A.8.16 / A.8.15: activity logging & monitoring.
  - A.5.15: least-privilege RBAC enforced server-side.
  - A.8.23: rate limiting to deter abuse.

- **German Workers Council**
  - Employee activity is masked by default.
  - Full PII requires explicit reason and is auditable.
  - Scoping limits managers to their org tree.

See [docs/DEV_QUICKSTART.md](docs/DEV_QUICKSTART.md) for setup and smoke tests.

## 🔄 Codespaces ↔ Repo Sync Workflow

We work **repo-first** (edit in GitHub), then sync into Codespaces.  
This keeps Codespaces disposable and avoids “drift” from the repo.

See the full guide in [`docs/DEV_QUICKSTART.md`](docs/DEV_QUICKSTART.md).

### Quick start

Open a Codespaces terminal and run:

```bash
gsync   # pulls repo, reinstalls deps, starts nodemon
