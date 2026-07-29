# Contributing

Thank you for helping build Task Manager. The project is intentionally documented before feature
implementation so contributors can make compatible decisions.

## Before opening a change

- Read `docs/PRODUCT_SPEC.md` and the relevant architecture/API sections.
- Search existing issues before proposing a feature.
- For a behavior or schema change, open a design issue describing use cases, permissions,
  migrations, API impact, and compatibility.
- Keep pull requests focused. Do not combine dependency cleanup with unrelated features.

## Development

Follow `docs/DEVELOPMENT.md`. Before requesting review, run:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

## Code expectations

- Keep business rules in application/domain code and enforce critical invariants in PostgreSQL.
- Validate and authorize every mutation on the server.
- Add typed activity events for meaningful state changes, without secrets or oversized snapshots.
- Keep provider-specific email, Telegram, backup, and storage behavior behind adapters.
- Include a migration and rollback/forward-repair plan for database changes.
- Add tests at the lowest useful level; include an end-to-end test for critical user journeys.
- Update documentation in the same pull request when contracts or operations change.

## Commit and pull-request guidance

Use clear imperative commits (for example, `Add sprint start transaction`). A pull request should
state what changed, why, how it was verified, screenshots for UI changes, migration/operations
impact, and any follow-up work.

## Security

Do not publish suspected vulnerabilities in issues. Follow `docs/SECURITY.md`. Never include real
credentials, database dumps, uploaded files, or user information in tests or examples.

## Issue templates

Use the repository's bug and feature templates for triage-ready reports. Security issues must use
the private contact path defined in `docs/SECURITY.md`.

## License

By contributing, you agree that your contributions are licensed under the repository's MIT License.
