# Launch notes — Masjid Pro

Masjid Pro is the paid offer for a mosque committee: a lobby screen, a website widget, one notice, and a donation link that leaves mosques.world. The directory stays free. Sponsorships were not built. A sponsor beside a mosque would spend the trust the directory is for, and there is no advertiser base yet. Committees already pay for a screen in the entrance.

Checkout is **off** until the secrets below are set. Merging this branch does not charge anyone.

Product code on this branch is still commit `10a058f` (Add Masjid Pro lobby screen). The follow-up below was not started. This file is the only change after that commit.

## Done

Already on `10a058f`, and described in the sections under this one:

- `/for-mosques`, the lobby at `/m/:slug/display` (preview bar until the mosque subscribes), the widget at `/m/:slug/widget`, and `/m/:slug/pro` for an approved steward (notice and donation link only).
- Polar checkout and webhook, both inert until the secrets below are set. No Polar keys are in the repo.
- AI crawlers stay blocked (`lib/crawlers.ts`, `robots.txt`, 403). Search crawlers stay allowed.
- Migration `0014_masjid_pro.sql` is additive. No dependency was bumped.

Checks recorded on the pull request from the session that landed `10a058f`, and not re-run after this note:

- `pnpm verify` passed (lines 94.72%). `pnpm build` passed.
- `pnpm e2e e2e/masjid-pro --project=chromium` passed (3 tests).
- Not run then: the other E2E suites, Lighthouse, a sandbox Polar purchase, the Preview URL.

## Unfinished

Asked for on this branch, and not built. Do not treat the lobby as a television board or as a place a steward can set iqamah.

1. **Steward iqamah.** An approved steward still cannot set the times the lobby shows. There is no form for fixed clock times, offsets from adhan, Jumu'ah slots, or a seasonal schedule. Nothing new was saved through the trust engine. The board does not say "checked by steward" and a date. The screen still reads the same community iqamah the mosque page already shows. It does not keep a private timetable, which is the right rule, and the steward controls were never added on top of it.
2. **Television board.** The lobby is still the first screen: a table, a clock, and a preview bar. It is not laid out for 5 m, it has no 16:9 and portrait layouts, no next-prayer countdown, and no night dim. Layout shift was not addressed. Screenshots at 1920×1080 and 1080×1920 were not taken.
3. **Remaining proof.** The phase 1–8 E2E suites were not run. Lighthouse was not run on `/for-mosques` or the lobby.

## What Wahab must approve

Before this branch is treated as on sale, the checklist further down still stands (offer, price, Polar, secrets, copy, no private timetable, crawler blocks, and that merging applies the migration and deploys).

Also, before anyone expects the follow-up:

- [ ] This pull request does **not** include steward-set iqamah, Jumu'ah, a seasonal schedule, or "checked by steward &lt;date&gt;".
- [ ] This pull request does **not** include the television layout, the countdown, night dim, or the 1920×1080 and 1080×1920 shots.
- [ ] The other E2E suites and Lighthouse were not run in the follow-up session. The green checks above are only for `10a058f`.
- [ ] Do not merge expecting that follow-up. Finish it on this branch, or say the first lobby is enough to ship.

## What changed

- `/for-mosques` states the offer and the price.
- `/m/:slug/display` is the lobby screen. Without a subscription it shows today's times and a preview bar. With one, the bar goes and the committee's notice and donation link appear.
- `/m/:slug/widget` is the embed for the mosque's own website. Times render only while the subscription is in force. The route may be iframed. The lobby screen may not.
- `/m/:slug/pro` is where an approved steward subscribes and edits the notice and the link. The times on the screen are the times already on the mosque page. Masjid Pro does not keep a second timetable.
- Polar checkout (`POST /api/v1/places/:id/pro/checkout`) and the webhook (`POST /api/v1/webhooks/polar`). The webhook verifies a Standard Webhooks signature, ignores other products, and does not apply an older delivery over a newer one.
- `POST /api/v1/test/pro` grants a mosque without Polar on localhost and preview only. It 404s in production.
- AI crawlers (ClaudeBot, GPTBot, Google-Extended, and the rest of the list in `lib/crawlers.ts`) are disallowed in `robots.txt` and refused with 403. Search crawlers stay allowed. They were not blocked in the repo before this change.
- Account deletion no longer treats `%` and `_` in an email as SQL `LIKE` wildcards, and it detaches the person from a Masjid Pro row without turning the mosque's screen off.

## Proposed pricing

Per mosque, in US dollars, charged by Polar:

| Period | Price | Notes |
| --- | --- | --- |
| Month | $19 | Cancel any time. |
| Year | $180 | Two months less than paying monthly. |

A second mosque is a second subscription. The page states these numbers. Polar must be given the same prices or the page is wrong.

A canceled subscription keeps the screen until `current_period_end`. A failed payment (`past_due`) turns the notice, the link and the widget off until Polar marks it active again.

Donations are not a product. The committee pastes an https link they already use. We never receive that money.

## Environment variables

All optional. Unset means checkout is off. Do not commit values.

| Name | Purpose |
| --- | --- |
| `POLAR_ACCESS_TOKEN` | Organization access token. Required, with a product id, before checkout will start. |
| `POLAR_PRODUCT_MONTHLY_ID` | Polar product id for the $19 monthly price. |
| `POLAR_PRODUCT_YEARLY_ID` | Polar product id for the $180 yearly price. |
| `POLAR_WEBHOOK_SECRET` | Webhook signing secret, pasted as Polar shows it (`polar_whs_…` or `whsec_…`). The webhook route 404s while this is unset. |
| `POLAR_SERVER` | Set to the string `production` to call `api.polar.sh` and charge live cards. Any other value, including unset, calls `sandbox-api.polar.sh`. |

Set them with `wrangler secret put`, production and preview separately. See `docs/runbooks/masjid-pro.md`.

Local names are listed in `.dev.vars.example`. Copy them into `.dev.vars` if you want to try a sandbox checkout on `pnpm dev`.

## Migration

`migrations/0014_masjid_pro.sql` adds `masjid_pro` and `masjid_pro_event`. Additive. No existing rows change. Preview applies it on push. Production applies it on merge, after the deploy prints a Time Travel bookmark.

## What Wahab should approve before this is treated as on sale

- [ ] Masjid Pro is the offer, and sponsorships stay out.
- [ ] $19 a month and $180 a year, per mosque, in US dollars.
- [ ] Polar is the merchant of record (tax, receipts, card data). Not Whop, not Lemon Squeezy, not a donation account.
- [ ] Live charges stay off until a sandbox purchase has been watched end to end.
- [ ] The five `POLAR_*` secrets, the two Polar products at these prices, and the webhook URL `https://mosques.world/api/v1/webhooks/polar`.
- [ ] `POLAR_SERVER=production` only after that sandbox purchase.
- [ ] The public copy on `/for-mosques`, `/terms` and `/privacy`.
- [ ] A committee does not get a private timetable. They publish the directory's times, a notice, and a link.
- [ ] AI crawlers in `lib/crawlers.ts` stay blocked. Search crawlers stay allowed.
- [ ] Merging to `main` applies `0014_masjid_pro.sql` to production D1 and deploys the Worker. That still does not open checkout.

## Dependabot

No dependency was bumped in this branch. The open Dependabot PRs are left for their own review. The ones that would be safe to fold later, and were not, because this branch should stay about the product:

- #50 vite 8.3.2 → 8.3.3 (patch)
- #48 `@vitejs/plugin-rsc` 0.5.35 → 0.5.36 (patch)
- #46 `@sentry/cloudflare` 11.4.0 → 11.5.0 (minor; draft #31 is the browser SDK and is untouched)

Not folded, and not redundant:

- #54 next 16.3.8 → 16.4.0, #47 the Cloudflare group, #49 maplibre, #55 the lint-and-test group: minors that can move the Worker build.
- #52 lucide 0.544 → 1.52, #51 `@types/node` 22 → 26, #26 TypeScript 5.9 → 6: majors. The app is on Node 22.
- #17–#19 and #28–#29: major bumps of GitHub Actions.
- #31 Sentry browser, #27 the design board, #13 preview isolation: not Dependabot, and not this work.

## Checks

The session that landed `10a058f` recorded `pnpm verify`, `pnpm build`, and `pnpm e2e e2e/masjid-pro --project=chromium` on the pull request. The follow-up session changed only this file and did not re-run them. The other E2E suites and Lighthouse are still outstanding.
