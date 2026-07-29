# Backup and restore manual

This manual defines operator-run commands until automated backups are added.

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
