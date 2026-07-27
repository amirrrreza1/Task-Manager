# Accessibility review — v0.4

This document records the manual accessibility review completed for the v0.4 sprint release scope.
Automated browser end-to-end tests remain planned for v1.0; v0.4 ships with keyboard-first checks and
unit coverage for sprint planning rules.

## Scope reviewed

- Login and authenticated shell navigation (Board, Backlog, Sprints, Profile, admin settings)
- Board drag-and-drop with keyboard sensors and move conflict handling
- Backlog task list and create-task dialog
- Sprint list, detail, start/finish controls, planner modal, comments, and carry-over form
- Task detail editing, subtask reorder, column change, and attachment actions

## Checklist (WCAG-oriented)

| Area | Expectation | v0.4 result |
| ---- | ----------- | ----------- |
| Focus order | Logical tab order in forms, modals, and navigation | Pass — modals trap focus via native controls; primary nav is a single landmark |
| Labels | Inputs tied to visible labels or `aria-label` | Pass — sprint comment textarea, board filters, and task forms use labels |
| Dialogs | `role="dialog"`, `aria-modal`, titled via `aria-labelledby` | Pass — create task, sprint planner, and board modals |
| Keyboard | Board/subtask DnD exposes keyboard coordinate getter | Pass — `@dnd-kit` keyboard sensor configured on board and subtasks |
| Motion | No essential information conveyed by motion alone | Pass — status markers duplicate color/state |
| Errors | Failures surfaced in `role="alert"` regions | Pass — inline alerts on board, backlog, sprints, and task pages |
| Touch | Primary actions reachable without precise drag | Pass — task detail column select and links supplement drag-only board moves |
| Color | Status uses text/marker in addition to color dots | Pass — done/open markers and column names |

## Known limitations (tracked for v1.0)

- Full automated axe/Playwright sweeps in CI are not yet wired.
- Live region announcements for async drag-and-drop success/failure are minimal; users rely on updated
  column counts and error alerts.
- Sprint planner checkbox list is long; virtualized scrolling is not implemented.

## Verification performed

- Keyboard-only walkthrough of login → backlog create → task detail column change → board filters.
- Screen reader spot-check (NVDA) on sprint planner and comment form labels.
- Zoom to 200% on board and sprint detail layouts without horizontal clipping on a 1280px viewport.

## Related automated tests

- `apps/api/test/sprint-work.test.mjs` — sprint assignment and outcome invariants.
- `apps/web/test/sprint-work.test.mjs` — planner selection locking parity with the API rules.
