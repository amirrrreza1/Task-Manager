# API contract

The REST API is rooted at `/api/v1`. OpenAPI is served at `/api/docs` in the initial self-hosted
configuration. JSON uses camelCase and timestamps use ISO 8601 UTC strings.

## Conventions

- Success: `200`, create: `201`, delete: `204`.
- Validation: `400`; unauthenticated: `401`; unauthorized: `403`; missing: `404`.
- Stale revision/state conflict: `409`; invalid file/media: `415`; too large: `413`.
- Errors use `{ "code": "STABLE_MACHINE_CODE", "message": "Human text", "details": {} }`.
- Collection pagination uses `?limit=50&cursor=<opaque>` and returns
  `{ "items": [], "nextCursor": null }`.
- Mutation requests may include `Idempotency-Key`; file upload and sprint lifecycle endpoints require
  it once background retries are introduced.
- Resource identifiers are UUIDs. Clients must not derive meaning from them.

## Authentication

| Method | Path             | Purpose                                                                      |
| ------ | ---------------- | ---------------------------------------------------------------------------- |
| POST   | `/auth/login`    | Authenticate username/password; return short access token and refresh cookie |
| POST   | `/auth/refresh`  | Rotate refresh session and access token                                      |
| POST   | `/auth/logout`   | Revoke current refresh session                                               |
| GET    | `/auth/me`       | Return current user and permissions                                          |
| PUT    | `/auth/password` | Change current user's password and revoke other sessions                     |

Refresh cookies are `HttpOnly`, `Secure` in production, `SameSite=Lax`, and scoped to the refresh
path. Password fields never appear in response types.

## Users (administrator unless noted)

| Method | Path                           | Purpose                                                            |
| ------ | ------------------------------ | ------------------------------------------------------------------ |
| GET    | `/users`                       | List users; active members are readable by all authenticated users |
| POST   | `/users`                       | Create user and random avatar seed                                 |
| GET    | `/users/:id`                   | Read user profile                                                  |
| PATCH  | `/users/:id`                   | Edit username/display name/active status                           |
| PUT    | `/users/:id/password`          | Reset password and revoke sessions                                 |
| POST   | `/users/:id/avatar/regenerate` | Replace random avatar seed                                         |

## Board and settings

| Method | Path                                 | Purpose                                                            |
| ------ | ------------------------------------ | ------------------------------------------------------------------ |
| GET    | `/board`                             | Optimized board read model with columns/tasks and selected filters |
| GET    | `/settings`                          | Read estimate mode, sprint duration, and revision                  |
| PATCH  | `/settings`                          | Admin update using expected revision                               |
| GET    | `/board-columns`                     | List ordered columns                                               |
| POST   | `/board-columns`                     | Add a column                                                       |
| PATCH  | `/board-columns/:id`                 | Rename/recolor/change done designation                             |
| POST   | `/board-columns/reorder`             | Atomically set order                                               |
| DELETE | `/board-columns/:id?moveTasksTo=:id` | Delete, optionally moving contained tasks                          |

## Tasks and subtasks

| Method | Path                              | Purpose                                            |
| ------ | --------------------------------- | -------------------------------------------------- |
| GET    | `/tasks`                          | Paginated search/filter endpoint                   |
| POST   | `/tasks`                          | Create task with optional assignee IDs             |
| GET    | `/tasks/:id`                      | Full task detail                                   |
| PATCH  | `/tasks/:id`                      | Edit fields, sprint, or assignee set               |
| POST   | `/tasks/:id/move`                 | Move/reorder with destination column and neighbors |
| DELETE | `/tasks/:id`                      | Delete task and descendants                        |
| POST   | `/tasks/:taskId/subtasks`         | Create subtask                                     |
| PATCH  | `/tasks/:taskId/subtasks/:id`     | Edit/assign/complete subtask                       |
| POST   | `/tasks/:taskId/subtasks/reorder` | Reorder subtasks                                   |
| DELETE | `/tasks/:taskId/subtasks/:id`     | Delete subtask                                     |

An estimate payload is either absent/null or `{ "value": 90, "unit": "MINUTES" }` /
`{ "value": 5, "unit": "POINTS" }`. A subtask accepts `assigneeId: string | null`; a task accepts
the set `assigneeIds: string[]`.

## Attachments

| Method | Path                        | Purpose                           |
| ------ | --------------------------- | --------------------------------- |
| POST   | `/tasks/:id/attachments`    | Multipart upload to a task        |
| POST   | `/subtasks/:id/attachments` | Multipart upload to a subtask     |
| GET    | `/attachments/:id`          | Authorized download/stream        |
| DELETE | `/attachments/:id`          | Delete metadata and stored object |

Uploads stream to storage and calculate SHA-256; they are not buffered fully in application memory.

## Sprints

| Method | Path                               | Purpose                                            |
| ------ | ---------------------------------- | -------------------------------------------------- |
| GET    | `/sprints`                         | Filterable sprint history                          |
| POST   | `/sprints`                         | Create planned sprint                              |
| GET    | `/sprints/:id`                     | Sprint detail/results/comments                     |
| PATCH  | `/sprints/:id`                     | Edit allowed sprint metadata                       |
| POST   | `/sprints/:id/start`               | Admin transition planned → active                  |
| POST   | `/sprints/:id/finish`              | Admin transition active → completed                |
| POST   | `/sprints/:id/carry-over`          | Move selected unfinished tasks to a planned sprint |
| GET    | `/sprints/:id/comments`            | Paginated comments                                 |
| POST   | `/sprints/:id/comments`            | Add comment                                        |
| PATCH  | `/sprints/:id/comments/:commentId` | Edit own comment/admin correction                  |
| DELETE | `/sprints/:id/comments/:commentId` | Delete with authorization                          |

The implementation must generate this contract from controller annotations and run an API
compatibility check in CI once endpoints begin shipping.
