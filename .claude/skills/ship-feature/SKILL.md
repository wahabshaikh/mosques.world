---
name: ship-feature
description: Build a mosques.world feature end to end, from spec to draft PR, in the order that keeps production safe (migration, lib logic with tests, routes, UI, i18n, E2E, runbook). Use when implementing a new feature, a spec phase item, or any change that adds a screen, route or table.
---

# Ship a feature

Work in this order. Each step lists where the pattern already exists; copy it rather than inventing one.

1. **Read the spec.** Find the feature in `docs/spec/06-phases.md` (scope, analytics goals, acceptance)
   and the relevant parts of `04-sitemap-screens-flows.md` and `05-data-model.md`. If the ask conflicts
   with the spec, follow the ask and update the spec in the same PR.
2. **Slice it.** There are no feature flags: what merges to `main` is live. Plan slices that are each complete
   and safe to release; keep unfinished work on the branch (its Worker Preview shows it).
3. **Data.** If it needs storage, use the `d1-migration` skill (additive SQL + `lib/db/schema.ts`).
4. **Logic in `lib/`.** Pure functions where possible, with a `*.test.ts` beside them covering the happy
   path, edge cases, authZ and rate limits. Times in the place's timezone.
5. **Routes.** `app/api/v1/.../route.ts` following `app/api/v1/saved/route.ts` (auth → zod →
   rate limit → D1 → JSON). Public API changes also update `lib/openapi.ts`.
6. **UI.** Server component page under the right route group; client components in `components/mw/`.
   Strings via the i18n catalogs on localized pages; logical (RTL-safe) classes; `track()` for the
   spec's analytics goals.
7. **Async work.** Queue messages or cron work go through `worker/index.ts` with a type guard in `lib/`.
8. **E2E.** Add the acceptance scenarios to `e2e/phase-N/` using the helpers in `e2e/support/helpers.ts`
   (`newUser()` / `signIn()` via `POST /api/v1/test/session`, fixtures, `@smoke` for production-safe
   checks, axe). Check the screens with `pnpm shot <path> --as <email>`. See `docs/testing.md`.
9. **Docs.** Update `docs/runbooks/phase-N.md` (what is live, before-release steps, load limits,
   rollback) and the spec if behaviour changed. Update `/privacy` if data collection changed.
10. **Verify.** Run the `preflight` skill.
11. **PR.** Push the branch (Workers Builds then gives it a Preview URL on the shared preview database)
    and open a **draft** PR using `.github/pull_request_template.md`: fill in Rollout and "Not verified:".
    Try UI changes on the Preview URL once the build bot posts it.

Do not deploy, run remote/preview migrations yourself, or set secrets; list
those as Rollout steps in the PR for a human. Merging to `main` deploys and migrates production.
