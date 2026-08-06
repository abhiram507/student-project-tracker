# Architecture

## The shape of it

```
Browser
  │
  ├─ Server components ──────────────┐   initial render, no HTTP round trip
  │   src/app/**/page.tsx            │
  │                                  ▼
  └─ Client components ──► REST API ──► Services ──► Prisma ──► Postgres
      src/components/*      src/app/api   src/lib/services
                                 │
                                 ├─ Zod schemas      (what is valid)
                                 ├─ RBAC predicates  (who may do it)
                                 └─ AppError types   (what to say when they may not)
```

Both entry paths — a server component rendering a page and a browser calling the
API — land on the same service functions. That is deliberate: there is exactly
one implementation of every rule, so a permission cannot be enforced on one path
and forgotten on the other.

## Layers, and what belongs in each

| Layer | Path | Responsibility | Must not |
|---|---|---|---|
| Pages | `src/app/**/page.tsx` | Read the session, call services, render | Contain business rules |
| Components | `src/components` | Display and interaction | Decide permissions; the server does that |
| Route handlers | `src/app/api/**/route.ts` | Parse, delegate, respond | Make decisions or touch Prisma |
| Services | `src/lib/services` | Business rules, authorisation, transactions | Know about HTTP, cookies, or React |
| Domain | `src/lib/services/project-progress.ts` | Pure rules: progress, state transitions | Do I/O of any kind |
| Auth | `src/lib/auth` | Hashing, tokens, permission predicates, rate limiting | Import Next.js, except in `session-cookie.ts` |
| HTTP | `src/lib/http` | Error types, response envelopes, route wrappers | Contain feature logic |
| Validation | `src/lib/validation` | Zod schemas, one per input shape | Be bypassed by any endpoint |

A rule of thumb that keeps this honest: if a file imports both `next/server`
and `@prisma/client`, something is in the wrong layer.

## Request lifecycle

Take `POST /api/projects/:id/reviews`.

1. **Middleware** (`src/middleware.ts`) sees a session cookie is present and
   lets the request through. It checks presence only — never validity. It is a
   redirect convenience, not a security boundary.
2. **`authedRoute`** (`src/lib/http/handler.ts`) reads the cookie, verifies the
   JWT signature, issuer, audience and expiry, and produces an `Actor`
   (`{ id, role }`). No session, no request: `UnauthorizedError`.
3. **The handler** parses the body with `createReviewSchema`. Anything malformed
   becomes a 422 listing the offending fields. Unknown keys are stripped, which
   is why a smuggled `authorId` cannot take effect.
4. **`createReview`** loads the project, asks `canReviewProject(actor, project)`,
   and refuses with 403 or 404 depending on whether the caller could see the
   project at all.
5. **The write** happens in a transaction: the review row and the project's new
   review state either both land or neither does.
6. **The response** is `{ data: ... }` with 201. Any thrown `AppError` is
   translated by `errorResponse`; anything unrecognised is logged server-side
   and returned as a generic 500.

## Why authorisation is folded into the query

`buildProjectWhere()` puts the ownership constraint into the `WHERE` clause
rather than filtering results afterwards. A student's search therefore cannot
load another student's row into memory in the first place — there is no
post-filter to forget, and no accidental leak through a count or a pagination
total.

## Data model

```
User ──1:N──► Project ──1:N──► Task
  │              │
  └───1:N────────┴──► Review
```

- `Project.ownerId → User` cascades: deleting an account removes its projects.
- `Task.projectId → Project` cascades: deleting a project removes its tasks.
- `Review.authorId → User` **restricts**: a mentor's account cannot be deleted
  out from under the feedback they wrote. Ownership cascades, authorship does
  not.

Indexes exist for the two queries the app actually runs: a student's dashboard
(`ownerId, createdAt`) and the mentor queue (`reviewState, submittedAt`).

## Testing strategy

| Suite | What it proves | Speed |
|---|---|---|
| `tests/unit` | Pure logic: hashing, tokens, permissions, validation, progress, state transitions, error mapping | Milliseconds |
| `tests/services` | Business rules and authorisation against a mocked `PrismaClient` | Milliseconds |
| `tests/integration` | The real route handlers end to end: a real `Request` in, a real `Response` out, with the session cookie round-tripping through an in-memory jar | Milliseconds |
| `tests/components` | Rendered markup, labels, and accessible names | ~200ms |

188 tests, no database, roughly six seconds. Coverage on `src/lib` is 93% of
statements and 95% of branches, with thresholds enforced in `vitest.config.ts`
so it cannot silently rot.

What the automated suite does **not** cover: real SQL and index behaviour. Those
were verified manually against a live PostgreSQL 16 instance — see
[VERIFICATION.md](VERIFICATION.md).
