# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Placeholder for upcoming changes.

---

## [1.0.0] - 2025-08-16
### Added
- MVP backend and UI for Effenza Dashboard.
- Express server with CORS, Helmet, and logging middleware.
- SQLite database integration via `better-sqlite3`.
- Migration and seed scripts with idempotent org tree and role assignments.
- REST routes:
  - `/users` for CRUD and `/users/me`.
  - `/groups` and `/memberships` with dashboard/group admin ACLs.
  - `/org-units` with scoped CRUD and audit logging.
  - `/assignments` for role assignments.
- Utilities:
  - `authz` and `acl` helpers for permissions.
  - `audit` logging with smoke test script.
- CI helpers:
  - GitHub Action linting via `actionlint`.
  - `smoke-audit.sh` health checks.
- Dev helpers (`dev-helpers.sh`) with `gsync`, `app-restart`, `free-port`, and `health`.

---

## [0.1.0] - 2025-08-16
Initial MVP release of Effenza Dashboard.

### Added
- **Audit log API (`/audit`)**
  - Two modes: `aggregate` (counts per action/resource) and `detail` (full rows).
  - Optional PII mode with `pii=true` + mandatory `reason` query param.
  - RBAC: non-admins are scoped to their org unit; detail+PII forbidden unless admin.
  - Rate limiting with HTTP `429` after abuse.
- **Audit log schema migration**
  - Creates new `audit_log` table if missing.
  - Detects legacy `audit_logs` and copies rows forward once.
  - Idempotent for multiple runs.
- **Seed + smoke scripts**
  - `scripts/seed-demo.js` for demo orgs, regions, and teams.
  - `scripts/smoke-audit.sh` + `scripts/smoke-audit-detail.sh` sanity checks.
- **CI workflow**
  - GitHub Actions with actionlint + smoke audit job.
  - Cancels duplicate runs on same ref.

### Security & Compliance
- PII access is self-logged (`read:audit_full`).
- Queries require `X-User-Id` header for actor attribution.
- Masking: by default `detail` omits `actor_id`, `ip`, and `user_agent`.

---

[Unreleased]: https://github.com/your-org/effenza-dashboard/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/effenza-dashboard/releases/tag/v1.0.0
[0.1.0]: https://github.com/your-org/effenza-dashboard/releases/tag/v0.1.0
