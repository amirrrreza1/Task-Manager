# Backup and restore manual

Task Manager supports both built-in administrator backup & restore (via Web UI and API with Telegram group delivery) and low-level operator CLI commands.

## In-App Backup & Restore (Web UI & API)

Administrators (`ADMIN` role) can manage backups directly in the Task Manager UI under **Settings > Backup & Restore** (`/settings/backup`):

- **Download Backup**: Generates an archive (`.zip` containing `backup.json` and attachments, or standalone `.json` snapshot) and downloads it directly to your computer.
- **Send to Telegram Group**: Compresses system data and sends the backup document directly to the team's configured Telegram group or topic via the Telegram Bot API (`sendDocument`).
- **Restore Backup**: Accepts an uploaded `.zip` archive or `.json` snapshot, validates contents, safely extracts attachments, and executes an atomic PostgreSQL transaction that restores tables in dependency order.

API Endpoints:

- `GET /api/v1/backup/status` - Backup metrics and Telegram readiness
- `GET /api/v1/backup/download` - Stream backup download
- `POST /api/v1/backup/telegram` - Dispatch backup archive to Telegram group
- `POST /api/v1/backup/restore` - Restore system from multipart backup file upload

## What must be backed up

- PostgreSQL data
- Attachment storage volume (`uploads`)
- Deployment configuration (`.env`, compose manifests, reverse-proxy config)

## Backup prerequisites

- Ensure available disk space on backup destination.
- Keep backup credentials separate from application credentials.
- Encrypt backups at rest and in transit.
- Test restore at least monthly in a disposable environment.

## Manual PostgreSQL backup

With Docker Compose:

```bash
docker compose exec -T database pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > backup-$(date +%F-%H%M)-db.dump
```

Alternative plain SQL export:

```bash
docker compose exec -T database pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup-$(date +%F-%H%M)-db.sql
```

## Manual attachments backup

Create a compressed archive from the uploads volume:

```bash
docker run --rm \
  -v task-manager_uploads:/from \
  -v "$PWD":/to \
  alpine sh -c 'cd /from && tar -czf /to/backup-$(date +%F-%H%M)-uploads.tar.gz .'
```

Replace `task-manager_uploads` if your Compose project name differs.

## Restore drill procedure

1. Stop API and web services.
2. Restore PostgreSQL dump.
3. Restore uploads archive.
4. Start services and validate health/login/board/attachments.

### Restore database dump

Custom-format dump:

```bash
cat backup-YYYY-MM-DD-HHMM-db.dump | docker compose exec -T database pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists
```

Plain SQL dump:

```bash
cat backup-YYYY-MM-DD-HHMM-db.sql | docker compose exec -T database psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

### Restore uploads archive

```bash
docker run --rm \
  -v task-manager_uploads:/to \
  -v "$PWD":/from \
  alpine sh -c 'cd /to && tar -xzf /from/backup-YYYY-MM-DD-HHMM-uploads.tar.gz'
```

## Suggested retention

- Daily backups for 14 days
- Weekly backups for 8 weeks
- Monthly backups for 12 months

Adjust retention based on compliance requirements and storage budget.
