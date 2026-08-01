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
- [x] Profile photos with display-name initial fallback
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

- [x] Full browser end-to-end test suite in CI (Playwright or equivalent)
- [x] Upgrade/migration guide and release images
- [x] Production security review and private vulnerability contact
- [x] Backup/restore manual for operators (manual commands, before automated backups)
- [x] Browser/mobile compatibility and performance budgets
- [x] Contributor-facing issue templates (bug, feature, and security routing)

## v1.1 — Activity logs and reports (complete)

- [x] Admin-only paginated activity log with actor, entity-type, and date filters
- [x] Member subtask-completion and estimate report, filterable by sprint
- [x] Sprint breakdown report: tasks, subtasks, who did what, per-member contribution summary
- [x] Reports index page with direct links to member and sprint reports

## v1.x / v2 — Requested future capabilities

### Reports: extended analytics

- Versioned metrics definitions so historical reports remain explainable
- Privacy/retention controls and CSV export
- Personal workload, completion, estimate, and sprint trend charts

### Automated database and attachment backup

- Scheduled encrypted backups, configurable retention, verification, and restore drills
- Backup status/history and failure notifications
- Support for S3-compatible backup destinations

### Telegram and email

- Provider adapters and administrator configuration
- End-of-sprint reports generated from stable report read models
- Backup success/failure notifications and secure download links (never raw dumps)
- Per-user notification preferences, retries, delivery history, and rate limits
