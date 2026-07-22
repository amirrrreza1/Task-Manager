# Task Manager

An open-source, self-hosted task and sprint manager for small teams. Tasks may have any number of
assignees; subtasks have at most one assignee. The workspace can use either time or story-point
estimates, and administrators can configure board columns and sprint duration.

This repository currently contains the **v0.1 project foundation**: the application shells,
database model, container setup, and the product/engineering documentation that governs the first
implementation.

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
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)

## Status

The foundation builds and documents the intended behavior. Feature implementation is organized in
the milestones in [ROADMAP.md](docs/ROADMAP.md); unfinished routes are not presented as working
features.

## License

[MIT](LICENSE)
