# Security model

## Supported reporting path

Do not open a public issue for a suspected vulnerability.

- Private contact: `security@taskmanager.local`
- Scope and release review: see [SECURITY_REVIEW_V1.md](SECURITY_REVIEW_V1.md)

Replace the placeholder mailbox with a monitored production inbox before public release.

## Credential rules

- `ADMIN_PASSWORD`, database passwords, JWT secrets, provider tokens, and encryption keys exist only
  in environment/secret storage.
- Startup fails when required secrets are absent or obviously weak.
- Passwords are hashed with Argon2id using parameters reviewed for the deployment's hardware.
- The bootstrap password is read only to reconcile the protected admin hash and is never returned,
  logged, included in activity payloads, or placed in an image.
- User password creation/reset uses write-only request fields and revokes refresh sessions.
- Login errors do not reveal whether a username exists.

## Session model

- Short-lived signed access tokens authorize API calls.
- Opaque rotating refresh tokens are held in `HttpOnly` cookies; only a token hash is stored.
- Token reuse revokes the affected session family.
- User deactivation/password reset revokes active refresh sessions.
- State-changing cookie-authenticated routes enforce allowed origins and CSRF protections.

## Authorization

Authentication guards are global by default with a small explicit public-route decorator. Role
checks are performed server-side. Object access is evaluated before disclosing whether a protected
resource exists. The v1 single-workspace model means authenticated members can access all task
content, but settings/user/sprint lifecycle actions remain admin-only.

## Input and content handling

- DTO allowlisting rejects unexpected input.
- Text size, numeric ranges, UUIDs, MIME types, and uploads are server validated.
- Markdown is rendered with raw HTML disabled or sanitized through an allowlist.
- SQL is parameterized through Prisma; raw SQL requires parameter binding and review.
- Output filenames use safe `Content-Disposition` encoding.
- API responses set security headers; production uses a restrictive Content Security Policy.

## Attachments

- Use generated opaque storage keys and never join user filenames to filesystem paths.
- Check upload size while streaming, not only the declared `Content-Length`.
- Calculate SHA-256 and optionally integrate malware scanning before public releases.
- Serve active content (HTML/SVG) as downloads unless a sanitizing preview pipeline is added.
- Prevent MIME sniffing with `X-Content-Type-Options: nosniff`.
- Deleting a database record must eventually delete the object; an orphan reconciliation job can
  repair partial failures.

## Abuse and availability

- Rate-limit login by IP and normalized username and apply escalating backoff.
- Rate-limit upload and mutation routes by authenticated user.
- Cap pagination, query complexity, description/comment length, and attachment count/size.
- Use structured logs with request IDs but redact authorization headers, cookies, passwords, file
  contents, and sensitive event payloads.

## Dependency and supply-chain baseline

- Commit the lockfile and use `pnpm install --frozen-lockfile` in containers/CI.
- Run dependency, container, license, and secret scans in CI.
- Pin base-image major versions and review automated updates.
- Publish checksums/signatures for official images when releases begin.
- Build releases from protected tags with least-privilege CI tokens.

## Backup security (future release)

Backups contain credentials hashes and all workspace data. Encrypt in transit and at rest, separate
backup credentials from application credentials, define retention, test restore, and record access.
Telegram/email notifications may link to backups but must never attach unencrypted database dumps or
include secrets.

## Pre-release security checklist

- Threat-model authentication, user administration, uploads, and sprint/comment authorization.
- Add database constraints described in the architecture document.
- Verify cookies/headers behind the actual TLS reverse proxy.
- Run authorization matrix and path traversal/upload tests.
- Confirm `.env`, uploads, dumps, and logs are absent from source and container layers.
- Replace the placeholder security contact (`security@taskmanager.local`) with a monitored inbox
  before public release.
