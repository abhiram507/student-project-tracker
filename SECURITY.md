# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private
[security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
form on this repository, or email the maintainer directly.

Include what you did, what happened, and what you expected. A proof of concept
helps. I will acknowledge within a few days and tell you what I plan to do.

## Scope

This is a student project. It is not running anyone's production data. That
said, the controls below are real, tested, and meant to be held to.

## What is defended, and how

### Authentication

Every control below has a test, and the ones marked *verified* were additionally
checked against a live database or a running server — see
[docs/VERIFICATION.md](docs/VERIFICATION.md).

| Control | Implementation |
|---|---|
| Password storage | Argon2id, 19 MiB memory / 2 iterations / 1 parallelism, per the OWASP Password Storage Cheat Sheet. Salt is generated per hash. |
| Password policy | 10–200 characters. The upper bound exists because unbounded input into a memory-hard KDF is a denial-of-service vector, not because long passwords are bad. |
| Session | HS256-signed JWT in an `httpOnly`, `SameSite=Lax`, `Secure`-in-production cookie, 8 hour lifetime, with issuer and audience claims checked on every request. |
| Brute force | Fixed-window limiter, 10 login attempts per 15 minutes keyed on **IP + submitted email**, and 5 registrations per hour per IP. Keying on both means one attacker cannot lock a victim out by hammering their address from elsewhere. |
| User enumeration | Login spends the full argon2 verification cost against a decoy hash when the email does not exist, and returns an identical message for "no such user" and "wrong password". Tested in `tests/services/auth.service.test.ts`. |

### Authorisation

Every permission decision is a pure function in `src/lib/auth/rbac.ts`, called
from the service layer on every request. The UI hides controls a user cannot
use, but that is a courtesy — nothing is enforced in the browser or in
middleware.

Two decisions worth calling out:

- **Write access is narrower than read access.** A mentor can see and review any
  project but cannot edit one. Reviewing and rewriting are different powers, and
  collapsing them would let a mentor silently fix the thing they are grading.
- **The API answers 404, not 403, to a caller who cannot see the resource.**
  A 403 confirms the ID exists, which turns every endpoint into an ID
  enumeration oracle. Callers who legitimately know a resource exists — its
  owner, a mentor — still get a truthful 403.

Tasks have no permissions of their own; they inherit the parent project's, and
every task entry point resolves the project first. This is centralised in one
helper precisely because doing it per-route is how IDOR bugs get shipped.

### Injection

- All database access goes through Prisma with parameterised queries. Search
  terms are passed as `contains` filters, never concatenated into SQL. There is
  a test asserting a `'; DROP TABLE projects;--` search term arrives as data.
- Every request body and query string is parsed by a Zod schema before anything
  downstream sees it. Unknown fields are stripped, so a smuggled `ownerId` or
  `role: "ADMIN"` in a request body has no effect — also tested.
- User-supplied URLs must match `https?://`, which blocks `javascript:` and
  `data:` URIs from being rendered as links (stored XSS).
- React escapes interpolated content by default, and this codebase never calls
  `dangerouslySetInnerHTML`.

### Transport and headers

Set in `next.config.ts` for every response, and *verified* present on a running
production server:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` — no clickjacking of the review controls
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Powered-By` removed

### Error handling

Unrecognised exceptions are logged server-side and returned to the client as a
generic 500. There is a test asserting a connection string in an error message
does not reach the response body, and this path was *verified* in production
when a real database outage produced a clean generic 500.

## Known limitations

Stated plainly, because pretending otherwise would be worse:

1. **The rate limiter is in-process.** On one instance it is exact. Across
   several serverless instances each holds its own window, so the effective
   limit multiplies by the instance count. It raises the cost of online
   guessing; it is not a defence against a distributed attacker. Moving the
   store to Redis or Postgres is the fix, and it is a small change because the
   limiter is already behind an interface.
2. **CSRF protection is `SameSite=Lax` alone.** That covers cross-site form
   posts, which is the realistic threat for a cookie-authenticated app in a
   modern browser. There is no synchroniser token. Adding one is the right move
   before this handles anything that matters.
3. **No Content-Security-Policy.** Next.js needs a nonce-based CSP to work with
   its inline hydration script; I would rather ship no CSP than a
   `unsafe-inline` one that reads as protection and is not.
4. **Sessions cannot be revoked before expiry.** A stateless JWT is valid until
   it expires, so "sign out everywhere" is not possible. The 8 hour lifetime
   bounds the damage. Server-side session records are the fix if this ever
   needs real revocation.
5. **No audit log.** Review decisions and deletions are not recorded anywhere
   beyond the rows themselves.
6. **No email verification.** Anyone can register with an address they do not
   control.
7. **Search does not use an index.** The `ILIKE '%term%'` filter cannot use a
   b-tree index — confirmed with `EXPLAIN` in
   [docs/VERIFICATION.md](docs/VERIFICATION.md#3-the-indexes-are-used-by-the-queries-the-app-actually-runs).
   At these row counts it does not matter, and `perPage` is capped at 50 so a
   single request cannot scan unboundedly. The fix at scale is a `pg_trgm` GIN
   index.

## Threat model, briefly

| Actor | What they want | What stops them |
|---|---|---|
| Curious classmate | Read another student's projects and feedback | Ownership check in every service; 404 rather than 403 so they cannot even confirm an ID is real |
| Classmate who guessed a task ID | Edit or delete someone else's task | Task operations resolve the parent project and check its permissions before touching the task |
| Registered student | Grant themselves `MENTOR` and approve their own work | `role` is set server-side to `STUDENT` at registration and is never read from a request body; the review endpoint refuses self-review even for a real mentor |
| Anyone with a stolen session cookie | Act as the victim | `httpOnly` keeps it out of reach of injected scripts; `Secure` keeps it off plaintext transport; 8 hour expiry bounds the window. Not otherwise mitigated — see limitation 4. |
| Script kiddie with a password list | Credential-stuff the login endpoint | Argon2id makes each guess expensive; the rate limiter caps attempts per IP+email |
| Anyone probing for valid accounts | Enumerate registered emails | Constant-ish response time and an identical error message for both failure modes |
