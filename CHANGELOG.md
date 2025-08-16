# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial CHANGELOG file following Keep a Changelog format.

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

[Unreleased]: https://github.com/your-org/effenza-dashboard/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/effenza-dashboard/releases/tag/v1.0.0
