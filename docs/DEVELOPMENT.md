# Development and operations

## Prerequisites

- Node.js 22 or newer and npm 10 or newer
- Docker Engine with Docker Compose for the recommended workflow
- Git

## Environment setup

Copy `.env.example` to `.env` and replace all placeholder secrets. The committed example is the
source of truth for required variables; code changes that add a variable must update it in the same
pull request.

For a strong secret in PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Never commit `.env`. Production secrets belong in the deployment platform's secret manager.

`ADMIN_USERNAME` and `ADMIN_PASSWORD` own the protected bootstrap account. API startup creates the
account when needed and reconciles those credentials on later starts. Changing the environment
password revokes its refresh sessions. The account cannot be deactivated or have its password reset
through the administration UI.

## Commands

| Command                                   | Result                               |
| ----------------------------------------- | ------------------------------------ |
| `npm install`                             | Install all workspaces               |
| `npm run dev`                             | Run API and web in watch mode        |
| `npm run build`                           | Produce both production builds       |
| `npm test`                                | Run unit tests                       |
| `npm run typecheck`                       | Type-check all workspaces            |
| `npm run lint`                            | Run all linters                      |
| `npm run format:check`                    | Verify formatting                    |
| `npm run prisma:generate`                 | Generate the typed Prisma client     |
| `npm run prisma:migrate -- --name <name>` | Create/apply a development migration |
| `npm run prisma:deploy`                   | Apply committed migrations (run from repo root) |
| `npm run prisma:deploy:docker`            | Apply migrations via Docker when the DB runs in Compose |
| `npm run prisma:studio`                   | Inspect local data                   |

## Docker workflow

```bash
docker compose up --build
docker compose logs -f api web
docker compose down
```

`docker compose down` retains named volumes. `docker compose down -v` permanently removes the
database and uploads and should only be used for an intentionally disposable environment.

## Database change workflow

1. Edit `packages/database/prisma/schema.prisma`.
2. Create a named migration against a development database.
3. Inspect the SQL. Add database-only constraints or indexes where Prisma cannot express them.
4. Regenerate the client and run tests/build.
5. Commit the schema and migration together.

Never edit an already released migration. Add a new migration. Production startup uses
`prisma migrate deploy`, which applies committed migrations without interactive schema changes.

## Testing strategy

- **Unit:** domain invariants and application services without network/database.
- **Integration:** repositories and transactions against an isolated PostgreSQL database.
- **API:** NestJS HTTP behavior, validation, authorization, and OpenAPI snapshots.
- **Web component:** interaction/accessibility for forms, dialogs, filters, and keyboard moves.
- **End to end:** login, user creation, task/subtask/attachment flows, settings, and sprint lifecycle
  through a disposable Compose stack (automated suite planned for v1.0; see [ACCESSIBILITY.md](ACCESSIBILITY.md)
  for the v0.4 manual review).

Every bug fix should add the smallest test that would have caught it. Tests must not rely on order,
wall-clock timezone, external avatar services, Telegram, or email.

## Definition of done

- Behavior matches the product spec and API contract.
- Authorization and validation exist on the server.
- Database constraints/migrations and activity events are included where relevant.
- Empty/loading/error/mobile/keyboard behavior is handled in the UI.
- Tests, type checks, lint, formatting, and production builds pass.
- User-facing or operational documentation is updated.
- No secrets, generated uploads, or personal information are committed.

## Production operations baseline

- Terminate TLS at a reverse proxy and expose only the web surface/API routes that are needed.
- Restrict database access to the application network.
- Run containers as non-root users with read-only roots where deployment permits.
- Persist and back up both PostgreSQL and attachment storage.
- Test restore procedures, not only backup creation.
- Rotate bootstrap credentials and JWT secrets through a planned session invalidation procedure.
- Monitor API error rate, response latency, free disk, database connections, outbox backlog, and
  backup age once those features exist.

## Release/versioning policy

The project uses semantic versioning after `1.0.0`. During `0.x`, minor versions may contain
documented breaking changes. Database migrations remain forward-only. API breaking changes require
a new URL version or a stated pre-1.0 migration path.
