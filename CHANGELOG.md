# Changelog

All notable changes are recorded here. The project follows semantic versioning after 1.0.0.

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
- Administrator user creation, activation/deactivation, password reset, and avatar regeneration
- Deterministic locally rendered avatars generated from cryptographically random seeds
- Revision-checked estimate-mode and sprint-duration settings
- Responsive login, member administration, profile, settings, and authenticated board-preview screens
- Role authorization tests and a second identity-focused database migration

## 0.1.0 — 2026-07-22

### Added

- Next.js/NestJS/PostgreSQL project foundation
- Prisma domain schema and initial migration
- Docker Compose topology, documentation, CI, and open-source community files
