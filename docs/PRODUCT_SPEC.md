# Product specification

**Document status:** Baseline for v1  
**Last updated:** 2026-07-25
**Product:** Task Manager

## 1. Product intent

Task Manager is a self-hosted collaborative board for teams that need tasks, small single-owner
subtasks, flexible estimates, and an explicit sprint lifecycle. It favors a clear workflow and a
small administration surface over project-management complexity.

### Goals

- Let a team organize tasks on an administrator-configurable board.
- Allow a task to be unassigned or assigned to one or many active users.
- Break a task into subtasks, each assigned to zero or one user.
- Estimate tasks and subtasks using one workspace-wide mode: time or points.
- Plan, start, finish, review, and comment on sprints without losing sprint history.
- Attach files to tasks and subtasks.
- Let the bootstrap administrator manage local users and credentials.
- Preserve the event data and extension boundaries needed by later reports, backups, email, and
  Telegram integrations.

### Non-goals for v1

- Multiple workspaces/tenants or projects inside one installation.
- Public registration, password recovery by email, SSO, or OAuth.
- Dependencies, epics, recurring tasks, time tracking, or billing.
- Real-time multi-user cursors or offline editing.
- The reporting, backup, Telegram, and email features listed for later releases.

## 2. Roles and permissions

### Administrator

The installation has at least one protected administrator bootstrapped from `ADMIN_USERNAME` and
`ADMIN_PASSWORD`. An administrator can:

- perform everything a member can;
- create, view, edit, activate, deactivate, and reset passwords for member accounts;
- edit the estimate mode, sprint duration, and board columns;
- reorder columns and designate which column represents completed work;
- start and finish sprints.

The environment-backed administrator cannot be deleted or demoted through the UI. On startup, the
application ensures the account exists and reconciles its username/password with the environment.
The environment value is never persisted or logged in plain text; only an Argon2id hash is stored.

### Member

A member can sign in, view active users, create and edit tasks/subtasks, change assignments, move
tasks, manage attachments, view sprint history, and add sprint comments. A member cannot manage
users or workspace settings.

### Account lifecycle

- There is no self-registration in v1.
- Usernames are unique, 3–64 characters, case-insensitively compared.
- Deactivation blocks new sessions and revokes existing refresh sessions without deleting history.
- Historical assignments and comments continue to show a deactivated user's display name/avatar.
- Password reset invalidates all of that user's sessions.

## 3. Core domain

### Task

Required: title, board column, creator.  
Optional: description, estimate, sprint, assignees, files.

Rules:

- Title is 1–240 characters after trimming.
- Description is plain text/Markdown with a server-enforced size limit of 50,000 characters.
- A task may have zero, one, or many distinct assignees.
- A task belongs to exactly one board column.
- A task belongs to zero or one sprint.
- Moving a task changes its column and ordered position atomically.
- Deleting a task is a confirmed destructive action and removes its subtasks/attachment metadata;
  file objects are removed through the storage service.

### Subtask

Required: parent task and title.  
Optional: description, estimate, one assignee, files.

Rules:

- A subtask belongs to exactly one task and cannot move between tasks in v1.
- It can be unassigned or assigned to exactly one active user.
- It has an independent completion checkbox; completing it does not automatically move its task.
- Subtasks have an explicit order within their parent task.

### Estimate

The workspace setting is either `TIME` or `POINTS`.

- Time is stored as whole minutes and displayed in human-friendly units (for example, `90m` or
  `1h 30m`). Valid range: 1 minute through 525,600 minutes.
- Points are stored as positive whole numbers. Valid range: 1–10,000. The UI should suggest
  `1, 2, 3, 5, 8, 13, 21` but must permit other whole values.
- An estimate is optional on both tasks and subtasks.
- Each saved estimate records its unit. Changing the workspace setting changes the input and default
  display for new/edited estimates; it does **not** silently convert historical values.
- While records in the old unit exist, the UI labels both units clearly and offers an administrator
  migration action in a later v1 increment. Sprint totals never add unlike units together.

This conservative rule prevents an arbitrary point-to-time conversion from corrupting historical
planning data.

### File attachment

- A file belongs to exactly one task or one subtask.
- Default maximum size is 25 MiB and is configurable by deployment environment.
- Store original filename, MIME type, size, SHA-256 checksum, owner, and opaque storage key.
- Stored filenames are generated; user-provided names never become filesystem paths.
- Downloads require authentication and authorization. Inline rendering is limited to an allowlist.
- The local Docker volume is the v1 default. A storage interface permits an S3-compatible driver
  without changing task code.

## 4. Board

- The board shows all configured columns from left to right and tasks ordered within each column.
- Initial columns: `Backlog`, `Ready`, `In progress`, `Review`, `Done`.
- Administrators can add, rename, recolor, reorder, and delete columns.
- Exactly one column must be designated as the done column.
- A non-empty column cannot be deleted until an administrator chooses a destination column; moving
  the tasks and deleting the column occur in one transaction.
- At least two columns must remain.
- Drag-and-drop is supplemented by accessible move controls and keyboard operations.
- Filters: sprint, assignee, unassigned, estimate presence, and text search. Filters are URL-backed
  so a board view can be bookmarked.

## 5. Sprints

### Configuration

The default sprint duration is an administrator setting, initially 14 days, valid from 1–90 days.
It proposes an end date when a sprint is started; the administrator can change the dates.

### Lifecycle

1. **Planned:** create a sprint with a name and optional goal; add/remove tasks.
2. **Active:** an administrator starts it, fixing its start and target end date.
3. **Completed:** an administrator finishes it, recording the actual completion time.

Only one sprint may be active at a time. A completed sprint is immutable except that comments may
still be added and administrators may correct its name/goal. Completed sprints cannot be restarted.
Tasks not in the done column when the sprint finishes remain in the historical sprint snapshot and
may be moved to a planned sprint through an explicit carry-over action. The carry-over creates an
activity event rather than rewriting history.

### History and comments

- The sprint list includes planned, active, and completed sprints, newest first.
- A sprint detail page shows goal, dates, status, task outcome counts, estimate totals per unit, and
  chronological comments.
- Comments record author and timestamps. Authors can edit their own comments; administrators can
  remove abusive/accidental content. Edits are represented in activity history.

## 6. User interface map

- `/login` — local username/password sign-in.
- `/board` — primary board, filters, task creation, and task movement.
- `/tasks/:id` — task detail, assignments, estimates, subtasks, and files.
- `/sprints` — sprint list and create action.
- `/sprints/:id` — sprint details, lifecycle controls, results, and comments.
- `/settings/general` — estimate mode and sprint duration (admin).
- `/settings/board` — column editor (admin).
- `/settings/users` — user and password management (admin).
- `/profile` — current user's display name/avatar and password change.

The first post-login route is `/board`. Desktop and mobile are supported; moving cards on touch
devices must not require precise drag gestures.

## 7. Avatar behavior

Creating a user generates a cryptographically random avatar seed. The UI derives a consistent,
local geometric avatar from that seed plus the display-name initials. This requires no third-party
service, avoids privacy leakage, is reproducible across devices, and gives every new user a random
visual identity. An administrator can regenerate the seed. Custom image uploads are outside v1.

## 8. Cross-cutting behavior

- All mutations are validated on the server and authorized independently of the UI.
- Optimistic updates must roll back visibly when the server rejects a change.
- Concurrent settings edits use a revision number and return `409 Conflict` on stale writes.
- API list endpoints use cursor pagination; board loading uses a board-specific aggregate endpoint.
- Timestamps are stored in UTC and rendered in the viewer's local timezone.
- User-facing dates follow the locale; machine/API dates use ISO 8601.
- Empty, loading, error, and permission-denied states are designed for every screen.

## 9. Acceptance criteria for v1

V1 is complete when a fresh Docker Compose installation can:

- bootstrap the administrator securely and sign in;
- create/deactivate members and reset their credentials with a random avatar for each new account;
- configure estimates, sprint duration, and board columns;
- create/edit/delete/move/filter tasks and manage multiple assignees;
- create/edit/complete/reorder subtasks with no more than one assignee;
- upload/download/delete authorized attachments;
- create, start, finish, browse, and comment on sprints while preserving history;
- restart without losing database records or uploaded files;
- pass automated unit/integration/end-to-end tests and the documented security checks.

## 10. Explicit assumptions to confirm

These decisions are safe defaults but can be changed before feature implementation:

1. One installation represents one workspace/team; there are no separate projects in v1.
2. Members can edit all tasks and subtasks; there is no per-task permission model.
3. Only administrators start/finish sprints and change settings.
4. Time estimates use minutes internally; points use positive integers.
5. Switching estimate mode preserves historical units instead of converting values.
6. Local file storage is the default for self-hosting, with an S3-compatible adapter planned.
