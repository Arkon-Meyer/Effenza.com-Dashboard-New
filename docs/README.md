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

## 🔄 Codespaces ↔ Repo Sync Workflow

We work **repo-first** (edit in GitHub), then sync into Codespaces.  
This keeps Codespaces disposable and avoids “drift” from the repo.

See the full guide in [`docs/DEV_QUICKSTART.md`](docs/DEV_QUICKSTART.md).

### Quick start

Open a Codespaces terminal and run:

```bash
gsync   # pulls repo, reinstalls deps, starts nodemon
