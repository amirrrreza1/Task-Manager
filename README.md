# Task Manager

An open-source, self-hosted task and sprint manager for small teams. Tasks may have any number of
assignees; subtasks have at most one assignee. The workspace can use either time or story-point
estimates, and administrators can configure board columns and sprint duration.

The current **v0.4 release** adds the full sprint workflow: planned sprint creation, an
administrator-controlled lifecycle, final outcome snapshots, explicit carry-over, and team notes.

## Stack

- **Web:** Next.js 16, React 19, TypeScript
- **API:** NestJS 11, TypeScript, REST/OpenAPI
- **Database:** PostgreSQL 17 with Prisma 6
- **Files:** local Docker volume behind a storage adapter; S3-compatible storage can be added later
- **Runtime:** Docker Compose or Node.js 22+

## Quick start with Docker

1. Copy `.env.example` to `.env`.
2. Replace every placeholder secret, especially `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`, and
   `JWT_SECRET`.
3. Run `docker compose up --build`.
4. Open the web app at <http://localhost:3000>.
5. API health is at <http://localhost:4000/api/v1/health>; OpenAPI is at
   <http://localhost:4000/api/docs>.

The API container applies committed database migrations before starting. Named Docker volumes keep
the database and uploaded files between restarts.

To apply migrations from a local checkout (schema lives under `packages/database`):

```bash
npm run prisma:deploy
```

## Local development

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run dev
```

For local processes outside Docker, change the database host in `DATABASE_URL` from `database` to
`localhost` and expose PostgreSQL (or run only the database service with a local override).

## Documentation

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture and data model](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [Development and operations](docs/DEVELOPMENT.md)
- [Security model](docs/SECURITY.md)
- [Accessibility review (v0.4)](docs/ACCESSIBILITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## Available in v0.4

- Environment-backed bootstrap administrator
- Argon2id password hashing and rotating refresh sessions
- Member creation, activation/deactivation, password reset, and avatar regeneration
- Time/point estimate mode and default sprint-duration settings
- Configurable, ordered board columns with one completed-work designation
- Task creation, editing, deletion, ordering, filtering, multi-assignee support, and estimates
- Ordered single-assignee subtasks with independent completion and estimates
- Authenticated attachment upload/download/delete with opaque names, checksums, and uploader history
- Activity events for board, task, subtask, and attachment mutations
- Responsive administration, board, task-detail, and profile screens
- Planned, active, and completed sprints with one-active-sprint protection
- Outcome summaries that preserve final task state after carry-over
- Sprint comments with author/admin edit and delete permissions
- Dedicated backlog page with board exclusion of the backlog column
- Sprint task assignment while a sprint is planned or active

See [ROADMAP.md](docs/ROADMAP.md) for the release boundaries and later planned capabilities.

## License

[MIT](LICENSE)
