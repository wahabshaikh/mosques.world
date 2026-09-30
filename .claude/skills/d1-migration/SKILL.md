---
name: d1-migration
description: Write, test and (only when explicitly asked) apply a Cloudflare D1 migration for mosques.world, keeping it additive, mirrored in the Drizzle schema, and protected by a Time Travel bookmark. Use when adding tables, columns, indexes or data backfills.
---

# D1 migration

## Write it

1. Next number: `ls migrations | tail -1` → `NNNN_short_name.sql` (four digits, snake_case name).
2. First line: `-- <Phase/feature>: <what it adds>. Additive only.`
3. Only additive statements, all idempotent where SQLite allows it:
   `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE t ADD COLUMN c … DEFAULT …`.
   No `DROP`, `RENAME`, or type changes on anything the deployed Worker reads.
4. Backfills must be safe to re-run (`UPDATE … WHERE new_col IS NULL`) and bounded; large backfills go
   through a queue job instead of the migration.
5. Mirror the change in `lib/db/schema.ts` (`integer(..., { mode: "timestamp_ms" })` for times).
6. If the table holds personal data, update the account export and delete routes (`app/api/v1/account/export`, `app/api/v1/account/delete`) and `/privacy`.

## Test it locally

```sh
pnpm db:migrate:local                                   # applies to Miniflare D1 under .wrangler/
pnpm exec wrangler d1 execute DB --local --command "PRAGMA table_info(<table>)"
pnpm test:coverage                                      # lib/testing/d1.ts runs the real migrations
```

Then run the E2E suite for the feature. To start from an empty local database, delete
`.wrangler/state/v3/d1` and re-apply.

## How it reaches preview and production

You don't apply remote migrations by hand. Workers Builds does it (see `docs/deployment.md`):

- **Push a branch** → `pnpm cf:preview` applies new migrations to the **shared** preview D1 used by every
  Preview. That's why migrations must be additive: other branches' Previews read the same database.
- **Merge to `main`** → `pnpm cf:deploy` prints a Time Travel bookmark, applies migrations to production
  D1, then deploys. The bookmark is in the build log.

So before pushing a migration, be sure of it: a pushed migration can't be taken back from the preview
database, and merging it changes production. In the PR's Rollout section list the migration file,
whether it changes existing data, and the restore command
`pnpm exec wrangler d1 time-travel restore DB --bookmark=<bookmark from the deploy log>`.

Run `pnpm db:migrate:preview` or `pnpm db:migrate:remote` yourself only when a human asked for that
exact step in this task. Deploy code that reads new columns only after (or with) the migration, never before.
