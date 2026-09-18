# Backup and restore manual

Task Manager supports both built-in administrator backup & restore (via Web UI and API with Telegram group delivery) and low-level operator CLI commands.

## In-App Backup & Restore (Web UI & API)

Administrators (`ADMIN` role) can manage backups directly in the Task Manager UI under **Settings > Backup & Restore** (`/settings/backup`):

- **Download Backup**: Generates an archive (`.zip` containing `backup.json` and attachments, or standalone `.json` snapshot) and downloads it directly to your computer.
- **Download Backup**: Generates an archive (`.zip` containing `backup.json` and attachments, or standalone `.json` snapshot) and downloads it directly to your computer.
- **Send to Telegram Group / Channel**: Compresses system data and sends the backup document directly to the configured Telegram channel, group, or topic via the Telegram Bot API (`sendDocument`).
- **Automated Nightly Backup**: Automatically generates system backups every night at 12:00 midnight (`00:00`) and dispatches them to Telegram. Includes smart fallback: if attachments cause the file to exceed Telegram's 50 MB limit, it automatically delivers the database snapshot JSON so backups never fail.
- **Restore Backup**: Accepts an uploaded `.zip` archive or `.json` snapshot, validates contents, safely extracts attachments, and executes an atomic PostgreSQL transaction that restores tables in dependency order.

API Endpoints:

- `GET /api/v1/backup/status` - Backup metrics, Telegram readiness, and nightly schedule info
- `GET /api/v1/backup/download` - Stream backup download
- `POST /api/v1/backup/telegram` - Dispatch backup archive to Telegram on demand
- `POST /api/v1/backup/schedule/trigger` - Test the automated nightly backup pipeline on demand
- `POST /api/v1/backup/restore` - Restore system from multipart backup file upload

### Automated Nightly Backup Configuration

Configure in `.env`:

```dotenv
# Enable automated nightly backups
BACKUP_NIGHTLY_TELEGRAM_ENABLED=true

# Schedule time (default: 00:00 for 12:00 AM midnight)
BACKUP_NIGHTLY_TIME="00:00"

# Timezone (e.g. UTC, Asia/Tehran, Europe/London). Defaults to host server local time if blank
BACKUP_NIGHTLY_TIMEZONE=

# Whether to include attachments (default: true)
BACKUP_NIGHTLY_INCLUDE_ATTACHMENTS=true
```

To deliver to a Telegram channel:

1. Add your bot to the channel as an **Administrator** with permission to **Post Messages**.
2. Set `TELEGRAM_CHAT_ID` to the channel ID (e.g. `-100xxxxxxxxxx`) or public channel username (e.g. `@my_channel`).

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
