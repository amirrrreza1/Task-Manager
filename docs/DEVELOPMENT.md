# Development and operations

## Prerequisites

- Node.js 22 or newer
- pnpm 9 or newer — enable via `corepack enable` (recommended, included with Node.js 22) or
  `npm install -g pnpm`
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

| Command                                    | Result                                                  |
| ------------------------------------------ | ------------------------------------------------------- |
| `pnpm install`                             | Install all workspaces                                  |
| `pnpm run dev`                             | Run API and web in watch mode                           |
| `pnpm run build`                           | Produce both production builds                          |
| `pnpm test`                                | Run unit tests                                          |
| `pnpm run typecheck`                       | Type-check all workspaces                               |
| `pnpm run lint`                            | Run all linters                                         |
| `pnpm run format:check`                    | Verify formatting                                       |
| `pnpm run prisma:generate`                 | Generate the typed Prisma client                        |
| `pnpm run prisma:migrate -- --name <name>` | Create/apply a development migration                    |
| `pnpm run prisma:deploy`                   | Apply committed migrations (run from repo root)         |
| `pnpm run prisma:deploy:docker`            | Apply migrations via Docker when the DB runs in Compose |
| `pnpm run prisma:studio`                   | Inspect local data                                      |
| `pnpm run test:e2e`                        | Run browser end-to-end tests against a running stack    |
| `pnpm run test:e2e:install`                | Download Playwright browser binaries                    |

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
  through a disposable Compose stack. Run `pnpm run test:e2e` after `docker compose up --build`.
  See [ACCESSIBILITY.md](ACCESSIBILITY.md) for the v0.4 manual review.

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

The project uses semantic versioning after `1.0.0`. Database migrations remain forward-only. API
breaking changes require a new URL version or a migration path stated in release notes.
