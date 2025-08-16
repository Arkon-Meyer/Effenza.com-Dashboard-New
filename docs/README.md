# Effenza Dashboard

Admin Dashboard MVP (backend + minimal UI) for [effenza.com](https://effenza.com).  
Built with **Node.js (20.x)**, **Express**, and **SQLite (better-sqlite3)**.

---

## 🚀 Getting Started

~~~bash
# Clone repo & install deps
git clone https://github.com/effenza/effenza-dashboard.git
cd effenza-dashboard
npm ci

# Run DB migration + seed demo data
npm run migrate
npm run seed

# Start dev server (port 3000, auto-reload with nodemon)
npm start
~~~

---

## 📑 Project Documentation

- Dev quickstart and Codespaces workflow: [`docs/DEV_QUICKSTART.md`](docs/DEV_QUICKSTART.md)
- Security milestones: [`docs/security/SECURITY_COMPLIANCE_MILESTONES.md`](docs/security/SECURITY_COMPLIANCE_MILESTONES.md)
- Working checklist: [`docs/security/SECURITY_COMPLIANCE_TODO.md`](docs/security/SECURITY_COMPLIANCE_TODO.md)

**Principles:** zero-knowledge by default, data minimization, least privilege, defense in depth, full traceability.  
Evidence, policies, and procedures live under `docs/security/` and are version-controlled.

---

## 🔐 Security & Compliance Notes

- **Audit logging**
  - All access/mutations recorded in SQLite `audit_log`.
  - Default *detail* view masks PII (`actor_id`, IP, UA are omitted).
  - Full PII view requires admin **and** `reason=...`; this access is self-logged (`resource=audit_full`).

- **Data protection (GDPR / CPRA)**
  - Data minimization + org-scoped access by design.
  - Hooks in place to support data subject requests (export/delete per subject).

- **ISO/IEC 27001 alignment (selected)**
  - A.8.16 / A.8.15 – activity logging & monitoring.
  - A.5.15 – least-privilege RBAC enforced server-side.
  - A.8.23 – rate limiting to deter abuse.

- **German Workers Council**
  - Employee activity masked by default.
  - PII access requires explicit reason and is auditable.
  - Scoping limits managers to their org subtree.

---

## 🔄 Codespaces ↔ Repo Sync (repo-first)

We edit in GitHub (source of truth), then sync into Codespaces to run.

### Quick start in Codespaces

~~~bash
# load helper functions (gsync, app-restart, etc.)
source scripts/dev-helpers.sh

# hard reset workspace to GitHub main, reinstall deps, start nodemon
gsync
~~~

### Smoke tests

~~~bash
npm run smoke:audit --quiet
npm run smoke:audit:detail --quiet
~~~

---

## 🤝 Contributing

- Use PRs to merge into `main`.
- Reference a security/compliance checklist item in related changes.
- CI (lint/tests/security scans) must pass before merge.
