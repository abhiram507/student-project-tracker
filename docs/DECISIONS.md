# Decisions

Every choice here had an alternative. This file records what was chosen, what
was rejected, and why — so a reviewer does not have to guess whether something
was reasoned about or just fell out of a template.

---

## 1. Next.js App Router as one deployable, rather than a separate React SPA and Express API

**Chosen:** a single Next.js application. Route handlers under `src/app/api`
serve a REST API; server components render the initial page.

**Rejected:** Vite + React on one side, Express on the other.

**Why:** two deployables means two build pipelines, two hosting targets, and
CORS. The separation buys clearer boundaries — which is real — but that
boundary can be enforced inside one codebase with a service layer, and it is,
see decision 2. The deciding factor was risk: fewer moving parts is fewer ways
for the running demo to be broken when someone else opens it.

**Cost:** the app is coupled to Next.js. Moving to a different frontend would
mean rewriting the route handlers, though the services underneath would survive
untouched.

---

## 2. A service layer between route handlers and Prisma

**Chosen:** `src/lib/services/*` holds all business logic. Route handlers parse
input, call a service, and format the response. Services receive a
`PrismaClient` as an argument rather than importing the singleton.

**Rejected:** calling Prisma directly from route handlers, which is the common
Next.js pattern and is shorter.

**Why:** three things follow from the split.

1. **The tests need no database.** Injecting a mocked `PrismaClient` means the
   entire suite runs in about five seconds with no Docker, which is why there
   are 188 tests instead of a token handful.
2. **Server components and the REST API share one implementation.** The project
   page calls `getProject()` directly on the server; the browser calls
   `GET /api/projects/:id`, which calls the same function. There is exactly one
   place where the permission rules live.
3. **Permission checks are impossible to skip by accident.** They sit at the
   layer every path goes through, not scattered across route files where a new
   endpoint can quietly omit one.

**Cost:** one more file to open when tracing a request.

---

## 3. Hand-rolled session auth instead of Auth.js / NextAuth

This is the decision most likely to be questioned, so here is the full
reasoning.

**Chosen:** email + password, argon2id via `@node-rs/argon2`, session as an
HS256 JWT signed with `jose` and stored in an `httpOnly` cookie.

**Rejected:** Auth.js v5 with a credentials provider.

**Why:**

- **"Don't roll your own auth" is really "don't roll your own crypto."** No
  cryptographic primitive is implemented here. Argon2id and JOSE are both
  audited libraries doing the hard parts. What is written by hand is the
  wiring: look up a user, verify a hash, set a cookie. That is a few dozen
  lines and every one of them is tested.
- **The scope is genuinely small.** One credentials provider, no OAuth, no
  magic links, no account linking, no adapter. Auth.js earns its complexity
  when you need those; here it would be a dependency wrapping the same few
  dozen lines with a config surface I would then have to reason about anyway.
- **Testability was the deciding factor.** `createSessionToken` /
  `verifySessionToken` are pure functions with no framework imports, which is
  why there are tests for signature tampering, `alg: none`, expiry boundaries,
  and payload-shape drift. Those tests are the point. Behind Auth.js they would
  be testing someone else's library instead of my integration.

**Cost:** no OAuth, no session revocation before expiry, and the responsibility
is mine. Limitations are listed honestly in [SECURITY.md](../SECURITY.md).
If this app needed Google sign-in tomorrow, Auth.js would be the right call and
the swap would be contained to `src/lib/auth`.

---

## 4. Progress is derived, never stored

**Chosen:** `calculateProgress()` computes a percentage from task counts at read
time.

**Rejected:** a `progress` column updated whenever a task changes.

**Why:** a stored percentage is a denormalisation with no single writer. Delete
a task and it is wrong. Change a status through a path that forgot to
recalculate and it is wrong. It would be a cache, and it would need
invalidation, for a number that costs one pass over an already-loaded array.

The weighting — an in-progress task counts as half — is a judgement call, not a
fact. It makes the bar move when a student starts work, which is the point of a
tracker. It is documented at the function so nobody reads it as a rounding bug.

**Cost:** the list query loads each project's task statuses. At student-project
scale that is nothing; at ten thousand projects it becomes a grouped count
query.

---

## 5. Review state as an explicit state machine

**Chosen:** a `ReviewState` enum on `Project` plus a transition table in
`project-progress.ts`.

**Rejected:** boolean pairs like `isSubmitted` / `isApproved`.

**Why:** two booleans allow four states, and at least one of them —
submitted *and* approved and also not — is meaningless. An enum makes illegal
states unrepresentable, and the transition table turns "you cannot submit twice"
into a 409 with a readable message instead of a row in a state no screen knows
how to render.

Submitting is its own endpoint (`POST /projects/:id/submit`) rather than
`PATCH { reviewState }`, so a client cannot name the target state and mark its
own project approved.

---

## 6. 404 instead of 403 for resources the caller cannot see

**Chosen:** `notFoundOrForbidden()` returns 404 when the caller cannot see the
resource, 403 when they can see it but cannot perform the action.

**Rejected:** always returning 403 on a failed permission check, which is more
honest and easier.

**Why:** a 403 confirms the ID exists. That difference is enough to enumerate
every project ID in the system by iterating and watching the status code. A
mentor who is genuinely refused an edit still gets a truthful 403, because they
could already see the project.

**Cost:** slightly confusing during development, when a permission bug looks
like a missing record. Worth it.

---

## 7. Prisma mocked in tests rather than a test database

**Chosen:** `vitest-mock-extended` provides a `DeepMockProxy<PrismaClient>`.

**Rejected:** Testcontainers or a dedicated test Postgres.

**Why:** the suite runs anywhere, in about five seconds, with no Docker — which
means it actually gets run, and CI stays simple. The tests that matter here are
about *decisions*: is this caller allowed, does this transition hold, does the
error leak. None of those need a real query planner.

**Cost:** this suite would not catch a bad migration, a wrong index, or a
Prisma query that is malformed at runtime. That gap is partly closed two ways:
`tests/integration` runs the real route handlers, so routing, validation, status
codes and the cookie round trip are covered; and the migration, constraints and
index plans were checked directly against PostgreSQL 16 and recorded in
[VERIFICATION.md](VERIFICATION.md). What remains missing is an automated suite
running the whole stack against a throwaway Postgres, and `docker-compose.yml`
is already there for it.

---

## 8. Tailwind with a named token layer, not a component library

**Chosen:** Tailwind, with a small set of semantic colour tokens (`ink`,
`surface`, `accent`, `good`/`warn`/`bad`) and a handful of `@layer components`
classes for the shapes that repeat.

**Rejected:** shadcn/ui or MUI.

**Why:** the interface is about a dozen distinct elements. A component library
would add a dependency and a generated-`components/` directory larger than the
application itself. Naming the tokens rather than scattering `bg-blue-600`
means the palette is one file, and the class names say what a colour is *for*.

**Cost:** no free accessible primitives — dialogs, comboboxes, date pickers.
The one confirmation dialog uses the native `confirm()`, which is not pretty
but is keyboard-accessible and screen-reader-correct for free.

---

## 9. Status is always labelled, never colour alone

Every chip carries its text. The task ledger bar has an `aria-label` spelling
out the counts. A colour-blind reader gets the same information as anyone else,
and so does anyone reading a screenshot in greyscale.
