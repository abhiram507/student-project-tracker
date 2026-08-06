# Contributing

Thanks for taking a look. This is a small project, so the process is short.

## Getting set up

See [Running it locally](README.md#running-it-locally). You need Node 20+, Docker
for Postgres, and about two minutes.

## Before you open a pull request

Run the same four things CI runs:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

All four must pass. CI will run them again on your branch.

## What a good change looks like

- **Business rules go in `src/lib/services`, not in a route handler.** Route
  handlers parse input, call a service, and return a response. If a handler
  starts making decisions, the decision belongs one layer down.
- **Every permission check happens server-side.** Hiding a button is a courtesy
  to the user, never a security control. If a new endpoint can read or write
  someone's data, it needs an explicit check in the service and a test proving
  an unauthorised caller is refused.
- **New behaviour comes with a test.** Pure logic goes in `tests/unit`;
  anything touching the database goes in `tests/services` with a mocked
  `PrismaClient`. The suite needs no database and should stay that way.
- **Schema changes ship with a migration.** `npx prisma migrate dev --name
  what_changed`. Commit the generated SQL.

## Commit messages

Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.
Write the body to explain *why*, since the diff already shows *what*.

## Reporting bugs

Open an issue using the bug report template. A reproduction beats a description.
