# API reference

Base URL: `/api`. Authentication is a session cookie, set by
`/api/auth/login` or `/api/auth/register` and sent automatically by the browser.

## Conventions

Success:

```json
{ "data": { } }
```

Failure:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "The submitted data is not valid.", "details": [ ] } }
```

| Status | Code | Meaning |
|---|---|---|
| 401 | `UNAUTHORIZED` | Not signed in, or the session expired |
| 403 | `FORBIDDEN` | Signed in, can see the resource, not allowed this action |
| 404 | `NOT_FOUND` | Does not exist — **or** exists but is not visible to you |
| 409 | `CONFLICT` | Duplicate email, or an illegal review-state transition |
| 422 | `VALIDATION_FAILED` | Input rejected; `details` lists the fields |
| 429 | `RATE_LIMITED` | Too many attempts; a `Retry-After` header is set |

A 404 is deliberately returned instead of 403 when the caller cannot see the
resource, so the API cannot be used to enumerate IDs.

## Auth

### `POST /api/auth/register`

```json
{ "name": "Ada Lovelace", "email": "ada@college.edu", "password": "at-least-ten-chars" }
```

`201` with the new user, and a session cookie. New accounts are always
`STUDENT`; the role cannot be requested. `409` if the email is taken.

### `POST /api/auth/login`

```json
{ "email": "ada@college.edu", "password": "at-least-ten-chars" }
```

`200` with the user, and a session cookie. `401` for a wrong password **and**
for an unknown email — identical message, comparable timing.

### `POST /api/auth/logout`

Clears the cookie. `200`.

### `GET /api/auth/me`

`200` with the current user, or `{ "data": null }` when signed out. Not a 401 —
"am I signed in?" is a question, not a failure.

## Projects

### `GET /api/projects`

| Query | Type | Default | Notes |
|---|---|---|---|
| `q` | string | — | Case-insensitive match on title and description |
| `status` | enum | — | `PLANNING` · `IN_PROGRESS` · `BLOCKED` · `COMPLETED` · `ARCHIVED` |
| `reviewState` | enum | — | `DRAFT` · `SUBMITTED` · `CHANGES_REQUESTED` · `APPROVED` |
| `scope` | `mine` \| `all` | `mine` | `all` is honoured only for mentors and admins; a student asking for `all` still gets their own |
| `page` | int ≥ 1 | 1 | |
| `perPage` | int 1–50 | 10 | Capped so a client cannot pull the whole table |

Returns `{ items, page, perPage, total, totalPages }`. Each item carries
`taskCounts` and a computed `progress`.

### `POST /api/projects`

```json
{ "title": "Student Project Tracker", "description": "", "githubUrl": "https://github.com/you/repo", "status": "PLANNING" }
```

`201`. Only `title` is required. URLs must be `http(s)`. The owner is taken
from the session; an `ownerId` in the body is ignored.

### `GET /api/projects/:id`

`200` for the owner or any mentor. `404` for anyone else.

### `PATCH /api/projects/:id`

Any subset of the create fields, but not `{}` — an empty patch is a `422`
rather than a silent no-op. Owner and admin only; a mentor gets `403`.

### `DELETE /api/projects/:id`

`204`. Cascades to tasks and reviews. Owner and admin only.

### `POST /api/projects/:id/submit`

Moves `DRAFT` or `CHANGES_REQUESTED` → `SUBMITTED` and stamps `submittedAt`.
Owner only. `409` if the project is already awaiting review.

This is a separate endpoint rather than `PATCH { reviewState }` so a client
cannot name the target state and approve its own work.

## Tasks

### `GET /api/projects/:id/tasks`

`200`. Visible to the owner and to mentors.

### `POST /api/projects/:id/tasks`

```json
{ "title": "Write the auth tests", "status": "TODO", "priority": "HIGH", "dueDate": "2026-08-06T00:00:00.000Z" }
```

`201`. Only `title` is required. Owner and admin only — a mentor reviewing the
project gets `403`, because reviewing is not editing.

### `PATCH /api/tasks/:id` · `DELETE /api/tasks/:id`

`200` / `204`. Both resolve the parent project and check *its* permissions
before touching the task, so knowing a task ID is not enough.

## Reviews

### `GET /api/projects/:id/reviews`

`200`, newest first. Owner and mentors.

### `POST /api/projects/:id/reviews`

```json
{ "body": "Good separation of concerns. Add a test for the 403 path.", "decision": "CHANGES_REQUESTED" }
```

`decision` is `COMMENT` (default, no state change), `CHANGES_REQUESTED`, or
`APPROVED`. The review and the resulting project state change happen in one
transaction.

Mentors and admins only, and never on your own project — a mentor reviewing
their own work gets `403`.

## Health

### `GET /api/health`

`200` with `{ status, time }` once the database answers. Useful for verifying a
deploy.
