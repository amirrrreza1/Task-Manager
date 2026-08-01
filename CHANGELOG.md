# Changelog

All notable changes are recorded here. The project follows semantic versioning after 1.0.0.

## 0.4.0 — 2026-07-27

### Added

- Planned sprint creation and task assignment from board/task editing
- Administrator-only start and finish lifecycle with configurable target dates and one-active-sprint enforcement
- Immutable end-of-sprint task snapshots, outcome totals, and explicit carry-over to planned sprints
- Sprint history/detail screens, estimate totals by unit, and chronological team comments
- Comment author/admin edit and delete authorization with activity events for all sprint mutations
- Dedicated `/backlog` page for task creation; workflow board hides the backlog column
- Add tasks to planned or active sprints; backlog-only task creation enforced by the API
- Sprint planning and outcome invariants covered by unit tests; v0.4 accessibility review documented

## 0.3.0 — 2026-07-25

### Added

- Administrator-configurable board columns with ordering, colors, done designation, and safe deletion
- URL-backed task search, assignee, unassigned, and estimate filters
- Task CRUD, multi-assignee management, unit-preserving estimates, and conflict-aware movement
- Ordered subtasks with independent completion, optional single assignee, descriptions, and estimates
- Local attachment storage with opaque keys, authenticated streaming, SHA-256 checksums, and size limits
- Responsive board, task detail, workflow administration, and accessible movement controls
- Append-only activity events for every board, task, subtask, and attachment mutation

## 0.2.0 — 2026-07-22

### Added

- Environment-backed, non-deactivatable bootstrap administrator
- Argon2id password hashing and rate-limited local login
- Short-lived JWT access tokens and rotating, hashed refresh sessions with reuse detection
- Logout, current-user profile, and password change with session revocation
- Administrator user creation, activation/deactivation, password reset, and profile photo upload
- Revision-checked estimate-mode and sprint-duration settings
- Responsive login, member administration, profile, settings, and authenticated board-preview screens
- Role authorization tests and a second identity-focused database migration

## 0.1.0 — 2026-07-22

### Added

- Next.js/NestJS/PostgreSQL project foundation
- Prisma domain schema and initial migration
- Docker Compose topology, documentation, CI, and open-source community files
