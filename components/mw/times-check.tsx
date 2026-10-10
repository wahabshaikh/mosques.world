"use client";

import { Check, MessageCircle, PencilLine, Plus, Share2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { REWARD } from "@/lib/hasanat";
import { askForTimesMessage, shareTimesMessage, whatsappHref, type Reminder } from "@/lib/reminders";
import { useViewer } from "./place-actions";
import { shareLink } from "./place-header-actions";
import { useText } from "./text";

/** Replayed after sign-in so "Yes, still right" works in one tap from a signed-out start. */
const CONFIRM_INTENT = "confirm-all";

/**
 * The ask under a masjid's times. With times: "Still right?" (one tap confirms every shown time, the
 * easiest contribution there is) or "Something changed". Without: add them, or forward the ask to
 * someone who prays there. Both end on a thank-you that invites sharing, which brings the next helper.
 */
export function TimesCheck({
  mode,
  candidates,
  placeName,
  path,
  updateHref,
  reminder,
  helpers,
}: {
  mode: "confirm" | "add";
  candidates: Array<{ candidateId: string; factKey: string }>;
  placeName: string;
  path: string;
  updateHref: string;
  reminder: Reminder;
  /** People who have already helped at this place. */
  helpers: number;
}) {
  const text = useText();
  const { viewer, loaded, intent, signInHref } = useViewer();
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [earned, setEarned] = useState(0);
  const replayed = useRef(false);

  async function confirmAll() {
    if (loaded && !viewer) {
      window.location.assign(signInHref(CONFIRM_INTENT));
      return;
    }
    setState("pending");
    let confirmed = 0;
    for (const item of candidates) {
      const response = await fetch("/api/v1/votes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId: item.candidateId, polarity: 1, source: "observed" }),
      }).catch(() => null);
      if (response?.status === 401) {
        window.location.assign(signInHref(CONFIRM_INTENT));
        return;
      }
      if (response?.status === 403) {
        window.location.assign(`/onboarding?next=${encodeURIComponent(`${path}?intent=${CONFIRM_INTENT}`)}`);
        return;
      }
      if (response?.status === 429) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Slow down a little and try again.");
        break;
      }
      // Already confirmed by you is fine: the point is that the times are right.
      if (response?.ok) confirmed += 1;
    }
    track("vote_cast", { polarity: 1, fact_key: "confirm_all" });
    setEarned(confirmed * REWARD.confirm);
    setState("done");
  }

  useEffect(() => {
    if (replayed.current || intent !== CONFIRM_INTENT || mode !== "confirm") return;
    replayed.current = true;
    void confirmAll();
    // Runs once when the post-sign-in intent arrives.
  }, [intent, mode]);

  const url = () => new URL(path, window.location.origin).toString();
  const shareWhatsApp = (message: string, from: string) => {
    track("share_click", { surface: from });
    window.open(whatsappHref(message), "_blank", "noopener");
  };

  if (state === "done") {
    return (
      <section className="mt-4 rounded-3xl bg-primary-soft p-5" role="status" data-testid="times-thanks">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-6" strokeWidth={2.6} aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-extrabold">{text("JazakAllahu khayran!")}</p>
            <p className="text-sm text-muted-foreground">
              {earned > 0 ? text("+{n} hasanat. The next person can trust these times.", { n: earned }) : text("The next person can trust these times.")}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm font-semibold">{text("Know someone who prays here? Pass it on.")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-[#0b2e17]"
            onClick={() => shareWhatsApp(shareTimesMessage(placeName, url()), "times_confirmed")}
          >
            <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold"
            onClick={() => {
              track("share_click", { surface: "times_confirmed_link" });
              void shareLink({ title: placeName, url: url() });
            }}
          >
            <Share2 className="size-4" aria-hidden="true" /> {text("Share")}
          </button>
          <Link href="/leaderboard" className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold underline">
            {text("See the leaderboard")}
          </Link>
        </div>
      </section>
    );
  }

  if (mode === "add") {
    return (
      <section className="rounded-3xl border border-border p-5" aria-labelledby="add-times" data-testid="add-times">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <h3 id="add-times" className="mt-3 text-lg font-extrabold">
          {text("Jamā'ah times not yet added")}
        </h3>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {helpers > 0
            ? text("Pray here? Add the iqamah times from the board and the next person can join the jamā'ah.")
            : text("Be the first to help here. Add the iqamah times from the board and the next person can join the jamā'ah.")}
        </p>
        <figure className="mt-4 border-s-2 border-primary/60 ps-3">
          <blockquote className="text-sm italic">“{reminder.text}”</blockquote>
          <figcaption className="mt-0.5 text-xs font-semibold text-muted-foreground">{reminder.source}</figcaption>
        </figure>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href={updateHref}
            onClick={() => track("update_opened", { from: "add_times" })}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary px-5 font-semibold text-secondary-foreground"
          >
            <Plus className="size-4" aria-hidden="true" /> {text("Add times")}
            <span className="text-xs font-bold text-gold-soft">+{REWARD.addTimes}</span>
          </Link>
          <button
            type="button"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border px-5 text-sm font-semibold"
            onClick={() => shareWhatsApp(askForTimesMessage(placeName, url()), "ask_for_times")}
          >
            <MessageCircle className="size-4" aria-hidden="true" /> {text("Ask someone who prays here")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-3xl border border-border p-4" aria-labelledby="still-right" data-testid="times-check">
      <h3 id="still-right" className="font-bold">
        {text("Are these times still right?")}
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{text("Only confirm what you've seen at the masjid or on its board.")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={state === "pending" || candidates.length === 0}
          onClick={() => void confirmAll()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary px-3 text-sm font-semibold text-secondary-foreground disabled:opacity-60"
        >
          <Check className="size-4" aria-hidden="true" /> {state === "pending" ? text("Saving…") : text("Yes, still right")}
          <span className="text-xs font-bold text-gold-soft">+{REWARD.confirm}</span>
        </button>
        <Link
          href={updateHref}
          onClick={() => track("update_opened", { from: "something_changed" })}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-foreground px-3 text-sm font-semibold"
        >
          <PencilLine className="size-4" aria-hidden="true" /> {text("Something changed")}
        </Link>
      </div>
    </section>
  );
}
