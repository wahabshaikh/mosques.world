"use client";

import { useState, type FormEvent } from "react";
import { track } from "@/lib/analytics";

type Interval = "month" | "year";

/**
 * Committee controls for one mosque: subscribe, then the notice, the donation link, and the embed.
 * Checkout does nothing until Polar is configured on the server.
 */
export function MasjidProPanel({
  placeId,
  intervals,
  prices,
  checkoutServer,
  entitled,
  notice,
  donationUrl,
  donationLabel,
  embed,
  checkoutReturn,
}: {
  placeId: string;
  intervals: Interval[];
  prices: Record<Interval, string>;
  checkoutServer: "sandbox" | "production" | null;
  entitled: boolean;
  notice: string | null;
  donationUrl: string | null;
  donationLabel: string | null;
  embed: string | null;
  checkoutReturn: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<Interval | "board" | null>(null);
  const [copied, setCopied] = useState(false);

  async function subscribe(interval: Interval) {
    setError(null);
    setPending(interval);
    track("pro_checkout_started", { interval });
    const response = await fetch(`/api/v1/places/${placeId}/pro/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    setPending(null);
    if (!response.ok || !body?.url) {
      setError(body?.error ?? "Masjid Pro checkout could not be started.");
      return;
    }
    window.location.assign(body.url);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending("board");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/v1/places/${placeId}/pro`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        notice: String(form.get("notice") ?? ""),
        donationUrl: String(form.get("donationUrl") ?? ""),
        donationLabel: String(form.get("donationLabel") ?? ""),
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(null);
    if (!response.ok) {
      setError(body?.error ?? "The notice could not be saved.");
      return;
    }
    track("pro_notice_saved");
    setSaved(true);
  }

  return (
    <div className="mt-8 flex flex-col gap-10">
      {checkoutReturn && !entitled ? (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm" role="status">
          If you just paid, Polar confirms it within a minute. Reload this page to publish the screen.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

      {entitled ? (
        <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
          <div>
            <label htmlFor="notice" className="text-sm font-bold">
              Notice on the screen
            </label>
            <textarea
              id="notice"
              name="notice"
              maxLength={180}
              rows={3}
              defaultValue={notice ?? ""}
              placeholder="Janazah after Asr. Sisters' entrance on the left."
              className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">180 characters. It shows on the lobby screen, the widget, and the mosque page.</p>
          </div>
          <div>
            <label htmlFor="donationUrl" className="text-sm font-bold">
              Donation link
            </label>
            <input
              id="donationUrl"
              name="donationUrl"
              type="url"
              inputMode="url"
              defaultValue={donationUrl ?? ""}
              placeholder="https://"
              className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">An https page the mosque already uses. The gift is paid there, not here.</p>
          </div>
          <div>
            <label htmlFor="donationLabel" className="text-sm font-bold">
              Link label
            </label>
            <input
              id="donationLabel"
              name="donationLabel"
              maxLength={32}
              defaultValue={donationLabel ?? ""}
              placeholder="Donate"
              className="mt-2 w-full max-w-xs rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="h-11 w-fit rounded-full bg-secondary px-5 text-sm font-bold text-secondary-foreground" disabled={pending === "board"}>
            {pending === "board" ? "Saving…" : "Save the board"}
          </button>
          {saved ? (
            <p className="text-sm font-semibold text-primary" role="status">
              Saved.
            </p>
          ) : null}
        </form>
      ) : (
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Subscribe this mosque</h2>
          {checkoutServer ? (
            <>
              <div className="mt-4 flex flex-wrap gap-3">
                {intervals.map((interval) => (
                  <button
                    key={interval}
                    type="button"
                    className="h-12 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
                    disabled={pending !== null}
                    onClick={() => void subscribe(interval)}
                  >
                    {pending === interval ? "Opening checkout…" : `Subscribe · ${prices[interval]}`}
                  </button>
                ))}
              </div>
              {checkoutServer === "sandbox" ? (
                <p className="mt-3 text-sm text-muted-foreground">Checkout is pointed at Polar's sandbox, so a real card is not charged.</p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Payment is taken by Polar. Card numbers are entered on their page, not here.</p>
              )}
            </>
          ) : (
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Checkout is not open on this site yet. The lobby preview works today. An approved steward can subscribe once the maintainer turns payment on.
            </p>
          )}
        </div>
      )}

      {embed ? (
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Website widget</h2>
          <p className="mt-2 text-sm text-muted-foreground">Paste this on the mosque's own site. It shows today's times and the notice.</p>
          <textarea readOnly value={embed} rows={4} className="mt-3 w-full rounded-xl border border-border bg-muted px-3 py-2 font-mono text-xs" aria-label="Embed code" />
          <button
            type="button"
            className="mt-3 h-10 rounded-full border border-foreground px-4 text-sm font-bold"
            onClick={() => {
              void navigator.clipboard.writeText(embed).then(() => {
                track("pro_embed_copied");
                setCopied(true);
              });
            }}
          >
            {copied ? "Copied" : "Copy embed code"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
