# Student Project Tracker

A fullstack tracker where students plan projects, break them into tasks, and
send them to a mentor for review — and where mentors work a review queue and
leave feedback that moves a project's state.

Built as a submission for the *AI-Augmented Engineer* guest lecture challenge.

[![CI](https://github.com/YOUR_USERNAME/student-project-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/student-project-tracker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Live demo:** _add your deployment URL here_

## What it does

- **Accounts and sessions** — register, sign in, sign out. Passwords hashed with
  argon2id; sessions are signed JWTs in `httpOnly` cookies.
- **Projects** — create, edit, delete. Title, description, repository link, live
  demo link, status.
- **Tasks** — per project, with status (to do / in progress / done) and priority.
  Project progress is computed from them.
- **Search and filter** — debounced text search across titles and descriptions,
  status filter, paginated.
- **Mentor review** — a student submits a project; mentors see a queue of
  everything waiting, and can comment, request changes, or approve. Each
  decision moves the project's review state.
- **Roles** — `STUDENT`, `MENTOR`, `ADMIN`, enforced server-side on every
  request.

## Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript in `strict` mode |
| Database | PostgreSQL via Prisma 6 |
| Auth | argon2id (`@node-rs/argon2`) + JWT sessions (`jose`) |
| Validation | Zod at every API boundary |
| Styling | Tailwind CSS with a named token layer |
| Tests | Vitest — 188 tests across unit, service, route-integration and component tiers |
| CI | GitHub Actions: lint, typecheck, test with coverage, build |

## Running it locally

Requires **Node 20+** and **Docker** (for Postgres).

```bash
git clone https://github.com/YOUR_USERNAME/student-project-tracker.git
cd student-project-tracker
npm install

cp .env.example .env
# Generate a session secret and paste it into .env as SESSION_SECRET:
openssl rand -base64 48

docker compose up -d        # Postgres on :5432
npm run db:migrate          # apply the schema
npm run db:seed             # demo accounts and sample projects
npm run dev                 # http://localhost:3000
```

No Docker? Point `DATABASE_URL` at any Postgres 14+ instance — a free
[Neon](https://neon.tech) database works — and skip the `docker compose` step.

### Demo accounts

Created by `npm run db:seed`. Password for all three: `demo-password-2026`

| Email | Role | What it shows |
|---|---|---|
| `student@example.com` | Student | Owns two projects, one awaiting review |
| `mentor@example.com` | Mentor | Sees the review queue; can approve or request changes |
| `classmate@example.com` | Student | Proves one student cannot see another's work |

To see the authorisation actually working: sign in as `student@example.com`,
copy a project ID from the URL, sign out, sign in as `classmate@example.com`,
and open `/projects/<that-id>`. You get a 404 — not a 403, because a 403 would
confirm the ID is real.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm start` | Serve the production build |
| `npm test` | Run the test suite |
| `npm run test:coverage` | Tests with a coverage report and enforced thresholds |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Apply migrations in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Drop, re-migrate, re-seed |

## Tests

```bash
npm test
```

188 tests, about six seconds, **no database required** — every tier injects a
mocked `PrismaClient`. Coverage on `src/lib` is 93% of statements and 95% of
branches, with thresholds enforced in `vitest.config.ts` so it cannot silently
rot.

| Tier | Location | What it covers |
|---|---|---|
| Unit | `tests/unit` | Hashing, session tokens, permissions, validation, progress, state transitions, error mapping |
| Service | `tests/services` | Business rules and authorisation against a mocked Prisma client |
| Route integration | `tests/integration` | The real route handlers: Zod parsing of a real `Request`, the auth wrapper, status codes, and the session cookie round trip |
| Component | `tests/components` | Rendered markup and accessible names |

What is actually tested, beyond the happy paths:

- Session tokens: signature tampering, an `alg: none` forgery, expiry
  boundaries, and a payload shape the app no longer recognises.
- Passwords: argon2id round-trips, per-hash salting, unicode, and a corrupted
  hash reading as "wrong password" rather than throwing a 500.
- Login: an unknown email and a wrong password return the same message and cost
  the same time, so the endpoint is not an account-enumeration oracle.
- Authorisation: an unrelated student is refused on every read and write path,
  including via a guessed task ID; a mentor can review but not edit; a smuggled
  `ownerId` or `role: "ADMIN"` in a request body has no effect.
- Errors: a connection string in an unexpected exception does not reach the
  response body.
- A 404 for "not yours" and a 404 for "does not exist" return **byte-identical**
  response bodies.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for what was additionally
checked against a live PostgreSQL 16 instance and a running production server.

## Deploying

The app is one deployable. On [Vercel](https://vercel.com):

1. Import the repository.
2. Set `DATABASE_URL` (a [Neon](https://neon.tech) Postgres URL works) and
   `SESSION_SECRET` (`openssl rand -base64 48`).
3. Deploy, then run `npm run db:deploy` against the production database to
   apply migrations.
4. Check `/api/health` returns `{"data":{"status":"ok"}}`.

## Project layout

```
prisma/          schema, migration, seed
src/
  app/
    api/         REST route handlers — parse, delegate, respond
    **/page.tsx  server components
  components/    React UI
  lib/
    auth/        hashing, session tokens, RBAC predicates, rate limiting
    http/        error types, response envelopes, route wrappers
    services/    business rules and authorisation
    validation/  Zod schemas
tests/
  unit/          pure logic
  services/      business rules against a mocked Prisma client
docs/            architecture, API reference, decisions, AI usage
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — layers, request lifecycle, data model
- [API reference](docs/API.md) — every endpoint, with status codes
- [Decisions](docs/DECISIONS.md) — what was chosen, what was rejected, and why
- [Verification log](docs/VERIFICATION.md) — what was run against a live database and server, and what came back
- [Security](SECURITY.md) — controls, known limitations, threat model
- [AI usage](docs/AI_USAGE.md) — honest disclosure
- [Contributing](CONTRIBUTING.md)

## Known limitations

Listed properly in [SECURITY.md](SECURITY.md#known-limitations). The short
version: the rate limiter is per-instance, CSRF protection is `SameSite=Lax`
alone, sessions cannot be revoked before their 8-hour expiry, text search cannot
use an index, and there is no automated suite running against a real database.

## License

MIT — see [LICENSE](LICENSE).
