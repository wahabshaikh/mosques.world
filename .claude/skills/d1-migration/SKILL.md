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

## Apply remotely (only when a human asked for it in this task)

Preview first, then production, each after a bookmark:

```sh
pnpm exec wrangler d1 time-travel info DB --env preview      # note the bookmark
pnpm exec wrangler d1 migrations apply DB --env preview --remote
pnpm exec wrangler d1 time-travel info DB                    # production bookmark
pnpm exec wrangler d1 migrations apply DB --remote
```

Record each bookmark (and the time) in the PR description or the phase runbook, next to the restore
command: `wrangler d1 time-travel restore DB --bookmark=<bookmark>`. Deploy the Worker only after the
migration is applied, since the code may read the new columns.
