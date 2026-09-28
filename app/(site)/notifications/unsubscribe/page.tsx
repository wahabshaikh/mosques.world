import type { Metadata } from "next";
import { TOPIC_LABELS, type NotificationTopic } from "@/lib/notifications";
import { TrackView } from "@/components/mw/track-view";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/** Where the email's unsubscribe link lands: one button, no sign-in (link scanners never unsubscribe anyone). */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const done = typeof params.done === "string" && params.done in TOPIC_LABELS ? (params.done as NotificationTopic) : null;
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <div className="mx-auto max-w-[560px] px-4 py-16 lg:px-6">
      {done ? (
        <>
          <TrackView goal="unsubscribe" props={{ topic: done, from: "email" }} />
          <h1 className="text-3xl font-bold tracking-tight">You&apos;re unsubscribed</h1>
          <p className="mt-3 text-muted-foreground">
            We won&apos;t email you about “{TOPIC_LABELS[done].title}” any more. You can turn it back on in Settings → Notifications.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Stop these emails?</h1>
          <p className="mt-3 text-muted-foreground">One tap turns off this kind of email. Other notifications are not affected.</p>
          <form method="post" action={`/api/v1/notifications/unsubscribe`} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="inline-flex h-12 items-center rounded-[12px] bg-primary px-6 font-bold text-primary-foreground">
              Unsubscribe
            </button>
          </form>
        </>
      )}
    </div>
  );
}
