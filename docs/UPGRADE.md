# Upgrade and migration guide

This guide covers upgrades from `0.4.x` to `1.0.0` for self-hosted deployments.

## Scope

- Database schema migrations
- Docker image updates
- Environment-variable checks
- Validation and rollback steps

## Before you start

1. Announce a short maintenance window.
2. Confirm a fresh backup exists for PostgreSQL and uploaded attachments.
3. Save your current image tags and commit SHA.
4. Pull the release notes and check for breaking changes.

## 1) Pull release artifacts

Use pinned tags for production:

```bash
docker pull ghcr.io/task-manager/api:1.0.0
docker pull ghcr.io/task-manager/web:1.0.0
```

If you mirror images internally, sync those first.

## 2) Validate configuration

Compare your production `.env` against `.env.example` from the target release and add missing keys.

At minimum verify:

- `JWT_SECRET` length and randomness
- `CORS_ORIGIN` matches the public web origin
- database connection values
- attachment storage settings

## 3) Apply database migrations

From the release checkout:

```bash
pnpm install --frozen-lockfile
pnpm run prisma:generate
pnpm run prisma:deploy
```

For Docker-first operations:

```bash
pnpm run prisma:deploy:docker
```

## 4) Deploy application images

Update `compose.yaml` image tags (or your equivalent deployment manifests), then:

```bash
docker compose up -d
```

## 5) Post-upgrade validation

Run the following checks:

1. `GET /api/v1/health` returns healthy.
2. Admin login succeeds.
3. Board and backlog load.
4. Task create/edit/move and sprint lifecycle actions work.
5. Attachment upload/download/delete still works.

## 6) Rollback strategy

If the app fails after migration:

1. Keep the system in maintenance mode.
2. Restore database and uploads from backup.
3. Re-deploy prior image tags.
4. Re-run smoke validation before opening access.

Do not apply reverse SQL to "undo" released migrations. Restore from backup instead.
