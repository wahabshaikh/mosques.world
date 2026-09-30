## What changes for people using mosques.world

Before:

After:

## How

## Checks

- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass
- [ ] Migrations (if any) are additive: no `DROP`/`RENAME` of anything deployed code still reads
- [ ] New behaviour is behind its phase flag, or the PR says why not
- [ ] Tried on the PR's Preview URL
