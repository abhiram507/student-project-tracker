## What this changes

<!-- One or two sentences. What is different after this merges? -->

## Why

<!-- The problem being solved. Link the issue if there is one. -->

## How to check it

<!-- Steps a reviewer can follow to see it working. -->

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] New behaviour has tests
- [ ] Any new endpoint that touches user data has a permission check **and** a test proving an unauthorised caller is refused
- [ ] Schema changes include a migration
