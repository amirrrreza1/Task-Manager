# v1.0 production security review

This document captures the production-readiness security review for the v1 release.

## Review scope

- Authentication, refresh-token rotation, and session revocation
- Authorization boundaries across settings/users/sprints/tasks/comments
- Input validation and upload handling
- Secrets, dependency, and container baseline
- Backup handling requirements and data exposure risks

## Review method

- Source review of API and web auth flows
- Route-level authorization checks against documented matrix
- Validation and file-upload edge-case review
- Configuration review of Docker and environment contracts
- CI pipeline review for supply-chain baseline checks

## Findings summary

- No known critical auth bypasses identified in current scope.
- Token-refresh and session invalidation model aligns with the documented threat model.
- Upload handling enforces MIME and size constraints, with opaque file keys.
- Remaining high-priority hardening tasks:
  - Add dependency/container/secret scanning in CI.
  - Define and publish production security contact before public release.
  - Add automated authorization-regression API tests for admin-only routes.

## Private vulnerability reporting contact

Use a private reporting channel and do not open public issues:

- `security@taskmanager.local`

Replace this placeholder with the real production security address before shipping externally.
