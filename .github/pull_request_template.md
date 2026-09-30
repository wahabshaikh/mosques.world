## What changes

Before:

After:

## How

<!-- The approach in a few sentences, and anything a reviewer should look at first. -->

## Verification

<!-- One line per check you ran, and a list of what you did not verify and why. -->

- [ ] `pnpm lint` · `pnpm typecheck` · `pnpm test:coverage` · `pnpm build`
- [ ] E2E: `pnpm e2e e2e/phase-…`
- Not verified:

## Rollout

<!-- Delete what doesn't apply. Humans do these steps; agents only list them. -->

- Flag:
- Migration: `migrations/…` (additive) · Time Travel bookmark:
- New bindings / secrets:
- Runbook: `docs/runbooks/…`
