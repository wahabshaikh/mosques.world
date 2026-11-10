# Masjid Pro

A subscription for one mosque's committee: a lobby screen, a website widget, one notice, and a donation link that leaves the site. The directory stays free. Checkout does nothing until the Polar secrets below are set.

## What is live

- `/for-mosques` explains the offer. The price on the page is $19 a month or $180 a year.
- `/m/:slug/display` is the lobby screen. It fills the viewport (no scroll), shows a clock and a countdown, and has `?theme=light` besides the default dark board. Without a subscription it shows the times and a preview bar. With one, the bar goes, and the notice and donation link appear.
- `/m/:slug/widget` renders times only while the subscription is in force. It may be iframed (`frame-ancestors *`). The lobby screen may not.
- `/m/:slug/pro` is for an approved steward of that mosque. Anyone else is told to ask to look after it.
- `/m/:slug/pro/times` is where that steward sets iqamah, fixed or as minutes after adhan, and Jumu'ah. It requires Masjid Pro in force. The write goes through the trust engine (`PUT /api/v1/places/:id/pro/times`). A stranger gets 403. An approved steward of a mosque that is not subscribed gets 402. Checkout stays off until the Polar secrets below are set.
- `POST /api/v1/webhooks/polar` accepts Polar deliveries. It 404s while `POLAR_WEBHOOK_SECRET` is unset.
- `POST /api/v1/test/pro` grants or revokes a mosque without Polar. It 404s wherever the email sink is off, including production.

Entitled means `active`, or `canceled` with `current_period_end` still in the future. `past_due` and `revoked` turn the notice, the link and the widget off. The preview bar comes back. The times on the mosque page are unchanged.

## Before turning checkout on

1. In Polar, create two products at the prices on `/for-mosques`: $19 a month and $180 a year. One mosque is one subscription. Do not add a donation or zakat product here.
2. Point Polar's webhook at `https://mosques.world/api/v1/webhooks/polar` (and the preview origin, if you want to try a sandbox delivery). Subscribe to `subscription.created`, `subscription.updated`, `subscription.active`, `subscription.canceled`, `subscription.uncanceled`, `subscription.revoked`, `subscription.past_due` and `checkout.updated`.
3. Set secrets (production and preview separately). Do not put them in the repo.

```sh
pnpm exec wrangler secret put POLAR_ACCESS_TOKEN
pnpm exec wrangler secret put POLAR_WEBHOOK_SECRET
pnpm exec wrangler secret put POLAR_PRODUCT_MONTHLY_ID
pnpm exec wrangler secret put POLAR_PRODUCT_YEARLY_ID
pnpm exec wrangler secret put POLAR_SERVER
```

`POLAR_SERVER` must be the string `production` for live charges. Leave it unset, or set `sandbox`, until a sandbox purchase has been seen end to end. A token alone uses the sandbox API.

4. Buy the sandbox product as an approved steward, confirm the webhook moves `masjid_pro.status` to `active`, and confirm the preview bar leaves `/m/:slug/display`.

## Migration

`migrations/0014_masjid_pro.sql` adds `masjid_pro` and `masjid_pro_event`. It does not change existing rows. Workers Builds applies it to the shared preview database on push, and to production on merge to `main` after printing a Time Travel bookmark.

Restore, if the new tables themselves are the problem: `pnpm exec wrangler d1 time-travel restore DB --bookmark=<bookmark from the deploy log>`.

Merging two mosques does not move a subscription. If a Pro mosque is merged, point the row at the surviving place by hand:

```sql
UPDATE masjid_pro SET place_id = '<surviving id>' WHERE place_id = '<merged id>';
```

Run that only when the surviving place has no `masjid_pro` row.

## Load and rollback

The lobby screen and the widget are anonymous `/m/…` pages, so they use the same edge cache as a mosque page (`s-maxage=60`). The clock ticks in the browser and reloads at the next congregation, at most every 30 minutes. Nothing on these pages calls Workers AI or a payment API.

Rollback of the code is the previous Worker version. The tables can stay. Clearing the five `POLAR_*` secrets turns checkout and the webhook off (the webhook 404s; the screens keep whatever status is already in D1).

## Abuse

Only an approved steward can start checkout, edit the board, or set iqamah and Jumu'ah, and the times route also requires Masjid Pro in force. The webhook signature is checked before any write, deliveries are stored once by `webhook-id`, and an older delivery cannot overwrite a newer one. A donation link has to be https on a public host. Account deletion nulls `activated_by` and leaves the mosque's screen in place.
