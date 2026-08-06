# Verification log

What was actually run, and what came back. Claims in the other documents point
here for evidence.

Environment: PostgreSQL 16.14 on Ubuntu 24.04, Node 22, Next.js 15 production
build (`next build` + `next start`).

---

## 1. The migration applies to a real database

`prisma/migrations/20260803120000_init/migration.sql` was applied with
`psql -v ON_ERROR_STOP=1` against an empty database.

Result: exit 0. Six enum types, four tables, nine indexes and four foreign keys
created with no errors.

## 2. Schema constraints behave as the schema claims

| Check | Expected | Result |
|---|---|---|
| Insert a duplicate email | Rejected | `duplicate key value violates unique constraint "users_email_key"` |
| Omit `role` on insert | Defaults to `STUDENT` | `STUDENT` |
| Omit project fields | `PLANNING` / `DRAFT` | `PLANNING` / `DRAFT` |
| Omit task fields | `TODO` / `MEDIUM` | `TODO` / `MEDIUM` |
| Omit review decision | `COMMENT` | `COMMENT` |
| Delete a user who authored a review | **Refused** — authorship restricts | `violates foreign key constraint "reviews_authorId_fkey"` |
| Delete a project's owner | **Cascades** — ownership cascades | Project, its tasks and its reviews all removed |
| Mentor account after that cascade | Survives | Survives |

The restrict/cascade split is the one that matters: a mentor's account cannot be
deleted out from under the feedback they wrote, but deleting a student removes
their work cleanly.

## 3. The indexes are used by the queries the app actually runs

Verified with `EXPLAIN` against 20,000 projects across 2,000 users, after
`ANALYZE`.

**Mentor queue** — `WHERE "reviewState" = 'SUBMITTED' ORDER BY "submittedAt" DESC LIMIT 10`

```
Limit
  ->  Index Scan Backward using "projects_reviewState_submittedAt_idx" on projects
        Index Cond: ("reviewState" = 'SUBMITTED')
```

No sort node — the composite index satisfies both the filter and the ordering.

**Student dashboard** — `WHERE "ownerId" = $1 ORDER BY "createdAt" DESC LIMIT 10`,
for an owner with 11,116 projects:

```
Limit
  ->  Index Scan Backward using "projects_ownerId_createdAt_idx" on projects
        Index Cond: ("ownerId" = 'usr1')
```

Also no sort node. For an owner with only ~10 projects the planner switches to a
bitmap scan plus a trivial sort, which is the correct choice at that size.

**Search** — `WHERE "ownerId" = $1 AND status = $2 AND title ILIKE '%term%'`

```
Bitmap Heap Scan on projects
  Recheck Cond: (status = 'BLOCKED')
  Filter: ((title ~~* '%Project 1%') AND ("ownerId" = 'usr1'))
    ->  Bitmap Index Scan on projects_status_idx
```

The status filter uses its index; the `ILIKE` cannot, because a leading-wildcard
pattern is not a b-tree prefix. **This is a real limitation**, now recorded in
[SECURITY.md](../SECURITY.md#known-limitations). At student-project row counts
it is irrelevant; the fix at scale is a `pg_trgm` GIN index on `title` and
`description`, or Postgres full-text search.

## 4. A running production server behaves correctly over HTTP

`next build` succeeded, `next start` served the app, and every route was checked
with `curl`.

| Request | Expected | Result |
|---|---|---|
| `GET /` (signed out) | Redirect to login | `307 → /login` |
| `GET /login`, `GET /register` | 200 | 200 |
| `GET /dashboard` (signed out) | Redirect, preserving destination | `307 → /login?next=%2Fdashboard` |
| `GET /projects/abc` (signed out) | Redirect, preserving destination | `307 → /login?next=%2Fprojects%2Fabc` |
| `GET /api/projects` (signed out) | 401 envelope | `{"error":{"code":"UNAUTHORIZED","message":"You must be signed in to do that."}}` |
| `GET /api/auth/me` (signed out) | `null`, not 401 | `{"data":null}` |
| `POST /api/auth/register` with `{"name":"A","email":"nope","password":"short"}` | 422 naming all three fields | 422, `details` listed `name`, `email` and `password` |
| `GET /nonexistent` | 404 | 404 |

**Response headers on every route:**

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`X-Powered-By` is absent, as configured.

## 5. An unplanned test of the error handler

During this run the database was deliberately left unreachable from the server
process. `GET /api/health` returned:

```
{"error":{"code":"INTERNAL_ERROR","message":"Something went wrong on our end."}}   [500]
```

The underlying exception was a multi-line Prisma initialisation error naming
internal file paths. None of it reached the client. This was an accidental but
genuine test of the failure path under a real infrastructure fault, and the
handler behaved as designed.

## 6. A bug this process found and fixed

The first `curl` of `/login` returned 5,345 bytes of HTML **containing no form**
— no email field, no password field, no submit button.

**Cause:** `AuthForm` read the post-login destination with `useSearchParams()`.
That hook opts its subtree into client-only rendering, and the `<Suspense>`
boundary around it had no fallback. The server therefore rendered nothing where
the form should be; it only appeared after hydration.

**Impact:** a blank login screen on slow connections, and a completely unusable
one if JavaScript failed to load.

**Fix:** the destination is now read from `searchParams` in the server component
and passed to the form as a prop. The hook is gone, and the form is in the
initial HTML.

**While fixing it:** the destination is now validated to be a same-origin
relative path, so `?next=https://evil.example` cannot turn the login page into
an open redirect. Confirmed — an absolute or protocol-relative URL is discarded,
while `?next=/dashboard` is passed through.

**Guarded by:** a rendering test in `tests/components/ui.test.tsx` that fails if
a client-only hook is reintroduced.

## What is still unverified

Stated plainly, because the point of this document is evidence, not comfort:

- **No full user journey has been driven through a browser.** Register → create
  project → add tasks → submit → mentor approves has been exercised at the route
  handler level with a mocked database, and the schema has been exercised
  directly with SQL, but the two have not been run together against live
  Postgres end to end. That is the first thing to do on a machine with a working
  Prisma engine binary.
- **No test asserts CSS renders correctly.** The stylesheet is served (15,965
  bytes, HTTP 200) but appearance was not visually checked at every breakpoint.
- **No load testing.**
