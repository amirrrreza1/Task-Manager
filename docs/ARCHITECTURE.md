# Architecture

## System overview

```text
Browser
  │ HTTPS / JSON
  ▼
Next.js web application (apps/web)
  │ REST / bearer access token + secure refresh cookie
  ▼
NestJS API (apps/api)
  ├── PostgreSQL via Prisma (structured state, history, outbox)
  └── Storage adapter (local Docker volume now; S3-compatible later)
```

The web and API are separate deployable processes. This keeps the API reusable by the future
Telegram bot and scheduled report workers and avoids hiding domain behavior inside Next.js route
handlers.

## Repository layout

```text
apps/
  api/                    NestJS HTTP API and application modules
  web/                    Next.js user interface
packages/
  database/prisma/        Prisma schema and committed migrations
docker/                   Container entrypoints and future deployment helpers
docs/                     Product and engineering documentation
compose.yaml              Local/self-hosted production composition
```

As implementation grows, API features should follow this shape:

```text
src/modules/tasks/
  domain/                 Entities, invariants, domain events
  application/            Use cases and ports/interfaces
  infrastructure/         Prisma repository, storage/event adapters
  http/                   Controllers, DTOs, response mapping
```

Do not create a generic abstraction for every NestJS service. Use these boundaries where they
protect domain rules or an external dependency.

## Technology decisions

### Next.js web

Next.js provides routing, server rendering, accessibility-friendly progressive enhancement, and a
large open-source contributor ecosystem. Browser code calls the documented API; server components
may proxy read operations where that improves initial rendering, but they do not own business
rules.

### NestJS API

NestJS is the selected TypeScript backend because its modules, dependency injection, validation,
OpenAPI support, and test utilities fit a domain that will later add background workers and external
channels. REST is used for v1. Versioning begins at `/api/v1`.

### PostgreSQL and Prisma

The product is relational: users, many-assignee tasks, ordered columns, sprint membership,
comments, and history need constraints and transactions. PostgreSQL supplies these properties;
Prisma supplies typed access and reviewable migrations.

### File storage

Bytes do not belong in PostgreSQL. `Attachment` stores metadata while a `FileStorage` port manages
objects. The initial `LocalFileStorage` uses a Docker volume. A future `S3FileStorage` can implement
the same methods: `put`, `open`, `delete`, and `exists`.

## Data model decisions

The canonical schema is `packages/database/prisma/schema.prisma`.

- `TaskAssignment` models the many-to-many task assignment explicitly and records assignment time.
- `Subtask.assigneeId` is a single nullable foreign key, structurally enforcing at most one owner.
- Each estimate stores both value and unit. Time values are minutes.
- Decimal task positions allow inserting/reordering cards without rewriting an entire column; a
  maintenance operation can normalize positions when gaps become too small.
- `ActivityEvent` begins collecting domain facts in v1 even though the activity UI/reporting ships
  later. Event payloads are additive, versioned JSON and must not contain passwords or file bytes.
- `OutboxMessage` is written in the same transaction as events that will later trigger Telegram or
  email. A worker can deliver it safely with retries.
- Users are deactivated instead of deleted, preserving referential and sprint history.

Database-level migrations should add constraints Prisma cannot express directly:

- case-insensitive unique usernames (for example, a `lower(username)` unique index);
- only one active sprint (partial unique index);
- exactly one owner foreign key for every attachment;
- estimate value and unit are either both null or both present, and value is positive;
- board position/sprint duration bounds where appropriate.

## Module boundaries

- **Auth:** login, token rotation, logout, bootstrap admin, password hashing/session revocation.
- **Users:** member lifecycle, profiles, avatar seeds.
- **Settings:** estimate mode, sprint duration, optimistic revision control.
- **Board:** column lifecycle/order and board read model.
- **Tasks:** task CRUD, ordering, assignments, estimates.
- **Subtasks:** nested lifecycle, single assignment, completion/order.
- **Attachments:** validation, metadata, storage lifecycle, authorized streaming.
- **Sprints:** planned/active/completed state machine, carry-over, comments/history.
- **Activity:** append-only domain event recording; query/report endpoints are later scope.
- **Outbox/notifications:** durable event publication; consumers are later scope.

Modules communicate through application services and domain events, not by importing each other's
controllers or Prisma queries.

## Important transactional operations

- Create task plus assignments and activity event.
- Move task plus ordered position and activity event.
- Delete non-empty board column plus move its tasks plus activity event.
- Start sprint plus ensure no active sprint plus activity event.
- Finish sprint plus outcome snapshot/carry-over intent plus activity event.
- Change password plus revoke refresh sessions.
- Store attachment metadata only after bytes are safely written; compensate by deleting bytes if the
  database write fails.
- Delete attachment metadata and enqueue object deletion so temporary storage failures can retry.

## Concurrency

- Settings use an integer revision supplied with updates.
- Sprint lifecycle updates use a transaction and status predicate.
- Card moves accept the last observed task `updatedAt`; conflicting changes return HTTP 409.
- Outbox consumers claim rows with PostgreSQL locking and are idempotent.

## Future-ready extension points

### Logs and personal reports

Every significant mutation emits a typed `ActivityEvent`, including actor, entity, timestamp, and a
minimal before/after payload. V2 can build read models and personal statistics without changing
write-side tables or attempting to infer history.

### Database backup

Backups remain operational infrastructure, not an API controller. A future worker runs `pg_dump`,
encrypts the artifact, writes it through backup storage, records metadata, and applies retention.
Restore is documented and tested independently.

### Telegram and email

Application events commit an `OutboxMessage`. Independent workers format and send end-of-sprint
reports or backup notifications. Provider credentials stay in environment/secrets, and retries do
not repeat domain transactions.

## Deployment topology

Docker Compose provides `web`, `api`, and `database`; named volumes persist PostgreSQL and uploads.
Production deployments should place a TLS reverse proxy in front, keep PostgreSQL/API private, pin
image digests, send logs to a collector, and back up both named volumes. The code remains portable
to Kubernetes or a managed database/object-store deployment.
