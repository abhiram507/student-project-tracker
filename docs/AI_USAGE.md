# AI usage

The brief asked for honest disclosure of AI tool usage. This is that
disclosure.

> **Before you submit: read this file and make it true.**
> It was drafted alongside the code and describes what was generated. The
> "verification" section makes claims on your behalf. Do not submit it until
> you have actually done those things and can defend any file in this
> repository line by line in a conversation. If something below did not happen,
> delete it. An overstated disclosure is worse than no disclosure.

---

## Tool used

Claude (Anthropic), used conversationally over a single extended session.

## What AI was used for

Substantially all of the initial implementation. Specifically:

- The Prisma schema, including the index choices and the cascade/restrict split
  on foreign keys.
- The auth stack: argon2id parameters, the `jose` session token module, the
  RBAC predicates, the in-memory rate limiter.
- The service layer and the REST route handlers.
- The Zod validation schemas.
- The React components and Tailwind token layer.
- The test suite.
- This documentation, including [DECISIONS.md](DECISIONS.md) and
  [SECURITY.md](../SECURITY.md).

Treating this as "AI wrote a bit of boilerplate" would be false. It wrote most
of the first draft.

## What was directed rather than generated

The decisions that shaped the code, rather than the typing:

- **Stack selection**, chosen against the evaluation criteria rather than by
  preference — in particular rejecting a BaaS because it would hide the API and
  database design work being assessed.
- **The security posture.** The enumeration-resistant 404-vs-403 behaviour, the
  login timing-oracle defence, and read/write permission asymmetry between
  mentors and owners came from deciding what this app's threat model actually
  is, not from a generic "add auth" instruction.
- **Scope discipline.** Features were held to the six the brief named, against
  the pull toward a more elaborate frontend, because the rubric weights
  functionality, code quality and tests at 60% and UI at 10%.
- **What to leave out**, and saying so in
  [SECURITY.md § Known limitations](../SECURITY.md#known-limitations) rather
  than shipping a CSP with `unsafe-inline` that would look like protection and
  not be.

## Verification performed

Some verification is already done and evidenced in
[VERIFICATION.md](VERIFICATION.md): the migration applied to a live PostgreSQL
16 database, every constraint and cascade behaved as the schema claims, both
composite indexes were confirmed in `EXPLAIN` output at 20,000 rows, and a
production build was served and probed over HTTP. That process found and fixed a
real bug — the login page was shipping HTML with no form in it.

The rest is on me:

<!-- EDIT THIS SECTION. Only keep lines that are true of what YOU did. -->

- [x ] Read every file in `src/` and `tests/` end to end.
- [x ] Ran the app locally against Postgres and exercised every feature by hand.
- [x  ] Signed in as two different students and confirmed neither can see the
      other's projects — including by calling the API directly with a copied
      project ID, not just by clicking around the UI.
- [x ] Confirmed a mentor can review but cannot edit a student's project.
- [x ] Confirmed `npm run lint`, `npm run typecheck`, `npm test` and
      `npm run build` all pass on a clean clone.
- [x ] Checked the hand-written migration matches the schema
      (`npx prisma migrate status` reports no drift).
- [x ] Reviewed the test suite for tests that assert nothing meaningful.

## Known gaps I can speak to

Things I know are missing, so that finding them in review is not a surprise:

- No automated tests against a real database, so a malformed Prisma query would
  not be caught by CI. The migration and index plans were checked by hand
  instead. Reasoning in
  [DECISIONS.md § 7](DECISIONS.md#7-prisma-mocked-in-tests-rather-than-a-test-database).
- The full user journey has not been driven through a browser against live
  Postgres. Route handlers and schema were verified separately, not together.
- CSRF rests on `SameSite=Lax` alone, with no synchroniser token.
- Sessions cannot be revoked before their 8-hour expiry.
- No end-to-end browser tests.

## The position I am taking

AI made the first draft cheap. It did not make the decisions, and it does not
carry the responsibility. Every claim in [SECURITY.md](../SECURITY.md) is one I
should be able to demonstrate on request, and every limitation listed there is
one I chose to accept rather than one I failed to notice. If any of that turns
out not to hold under questioning, the honest conclusion is that I did not
verify carefully enough — which is the failure mode the lecture was about.
