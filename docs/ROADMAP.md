# Roadmap

The roadmap separates foundation work from shipped behavior so documentation never implies an
unfinished feature is available.

## v0.1 — Foundation (complete)

- [x] Product specification and acceptance criteria
- [x] Next.js and NestJS TypeScript application shells
- [x] PostgreSQL/Prisma domain schema
- [x] Docker Compose topology and persistent volumes
- [x] Health endpoint and OpenAPI foundation
- [x] Architecture, API, security, operations, and contribution documentation
- [x] Activity-event and transactional-outbox data foundations for later releases

## v0.2 — Identity and administration (complete)

- [x] Bootstrap protected admin from environment
- [x] Argon2id login, access/refresh token rotation, logout, and session revocation
- [x] User CRUD/deactivation/password reset
- [x] Random deterministic avatar generation
- [x] Admin settings shell and authorization test matrix

## v0.3 — Board, tasks, and files (complete)

- [x] Configurable columns and accessible board movement
- [x] Task CRUD, ordering, filtering, multi-assignee support, and estimates
- [x] Subtask CRUD/order/completion, single assignee, and estimates
- [x] Local storage adapter and secure attachment lifecycle
- [x] Activity events for every mutation

## v0.4 — Sprints (complete)

- [x] Sprint duration settings and planned sprint creation
- [x] One-active-sprint lifecycle with start/finish transactions
- [x] Sprint history, outcome summaries, and carry-over
- [x] Sprint comments and edit/delete permissions
- [x] Dedicated backlog page, board exclusion of backlog column, and mid-sprint task assignment
- [x] Sprint/backlog unit tests and documented v0.4 accessibility review ([ACCESSIBILITY.md](ACCESSIBILITY.md))

## v1.0 — Stable self-hosted release

- [ ] Full browser end-to-end test suite in CI (Playwright or equivalent)

- [ ] Upgrade/migration guide and release images
- [ ] Production security review and private vulnerability contact
- [ ] Backup/restore manual for operators (manual commands, before automated backups)
- [ ] Browser/mobile compatibility and performance budgets
- [ ] Contributor-facing issue templates and published demo media

## v1.x / v2 — Requested future capabilities

### Activity logs and personal reports/statistics

- Query/activity UI based on the events captured since v1
- Personal workload, completion, estimate, and sprint trend reports
- Versioned metrics definitions so historical reports remain explainable
- Privacy/retention controls and CSV export

### Automated database and attachment backup

- Scheduled encrypted backups, configurable retention, verification, and restore drills
- Backup status/history and failure notifications
- Support for S3-compatible backup destinations

### Telegram and email

- Provider adapters and administrator configuration
- End-of-sprint reports generated from stable report read models
- Backup success/failure notifications and secure download links (never raw dumps)
- Per-user notification preferences, retries, delivery history, and rate limits

## Backlog principles

Features join a release only with product behavior, permissions, schema/event implications,
operational impact, API contract, and test acceptance criteria. Future integrations consume the
outbox/API; they must not query tables ad hoc or embed provider logic in task/sprint modules.
