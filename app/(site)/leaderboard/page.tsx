import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { HASANAT_NOTE, HasanatCard, ReminderQuote } from "@/components/mw/hasanat";
import { appEnv } from "@/lib/db/client";
import { isNonProductionHost } from "@/lib/environment";
import { asPeriod, leaderboard, levelFor, periodStart, REWARD, userHasanat, type Period } from "@/lib/hasanat";
import { avatarColor, initials } from "@/lib/people";
import { readNow } from "@/lib/places/present";
import { reminderFor } from "@/lib/reminders";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hasanat leaderboard",
  description: "The people keeping mosque prayer times accurate for everyone. Add or confirm iqamah times to help the next person pray in jamā'ah.",
  alternates: { canonical: "/leaderboard" },
};

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

const WAYS = [
  { label: "Add a mosque's jamā'ah times", points: REWARD.addTimes },
  { label: "Confirm times are still right", points: REWARD.confirm },
  { label: "Report a time that changed", points: REWARD.report },
  { label: "Add a photo of the timetable board", points: REWARD.photo },
  { label: "Add a missing mosque", points: REWARD.addPlace },
];

/** Leaderboard of community helpers (hasanat), with your own tally and how to earn more. */
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).period;
  const period = asPeriod(Array.isArray(raw) ? raw[0] : raw);
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const now = readNow(headerList.get("x-mw-now"), isNonProductionHost(host)).getTime();
  const database = appEnv().DB;
  const [rows, viewer] = await Promise.all([leaderboard(database, { since: periodStart(period, now) }), currentUser()]);
  const mine = viewer ? await userHasanat(database, viewer.id, now) : null;
  const myRank = viewer ? rows.findIndex((row) => row.userId === viewer.id) : -1;

  return (
    <div className="mx-auto max-w-[720px] px-4 pt-6 pb-12 lg:px-6 lg:pt-10">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tight lg:text-4xl">Serving the ummah</h1>
      <p className="mt-2 text-muted-foreground">Every time you add or confirm a mosque&apos;s times, the next person knows when to pray in jamā&apos;ah.</p>
      <ReminderQuote reminder={reminderFor("share", "leaderboard")} className="mt-5" />

      {mine ? (
        <HasanatCard total={mine.total} week={mine.week} className="mt-6" />
      ) : (
        <section className="mt-6 rounded-3xl bg-muted p-5">
          <h2 className="text-lg font-bold">Start earning hasanat</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to keep a tally of the help you give and appear on the leaderboard.</p>
          <Link href="/sign-in?next=%2Fleaderboard" className="mt-4 inline-flex h-12 items-center rounded-xl bg-secondary px-5 font-semibold text-secondary-foreground">
            Sign in
          </Link>
        </section>
      )}

      <section className="mt-8" aria-labelledby="board">
        <div className="flex items-center justify-between gap-3">
          <h2 id="board" className="text-xl font-bold">
            Leaderboard
          </h2>
        </div>
        <nav className="no-scrollbar mt-3 flex gap-2 overflow-x-auto" aria-label="Period">
          {PERIODS.map((item) => (
            <Link
              key={item.value}
              href={item.value === "week" ? "/leaderboard" : `/leaderboard?period=${item.value}`}
              aria-current={item.value === period ? "page" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-semibold",
                item.value === period ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-input p-8 text-center">
            <p className="font-semibold">No one yet {period === "all" ? "" : PERIODS.find((item) => item.value === period)?.label.toLowerCase()}</p>
            <p className="mt-1 text-sm text-muted-foreground">Be the first: confirm the times at a mosque near you.</p>
            <Link href="/" className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground">
              Find a mosque
            </Link>
          </div>
        ) : (
          <ol className="mt-4 divide-y divide-border" data-testid="leaderboard">
            {rows.map((row, index) => (
              <li key={row.userId} className={cn("flex items-center gap-3 py-3", viewer?.id === row.userId && "-mx-3 rounded-2xl bg-primary-soft px-3")}>
                <span className={cn("tabular w-6 text-center text-sm font-extrabold", index < 3 ? "text-gold" : "text-muted-foreground")}>{index + 1}</span>
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: avatarColor(row.userId) }} aria-hidden="true">
                  {initials(row.name || row.username)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/@${row.username}`} className="truncate font-semibold hover:underline">
                    @{row.username}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {levelFor(row.hasanat).level.name} · {row.actions} {row.actions === 1 ? "good deed" : "good deeds"}
                  </span>
                </span>
                <span className="tabular text-end font-extrabold">{row.hasanat.toLocaleString("en")}</span>
              </li>
            ))}
          </ol>
        )}
        {viewer && myRank === -1 && mine ? <p className="mt-3 text-sm text-muted-foreground">You&apos;re not on this board yet. One confirmation puts you on it.</p> : null}
      </section>

      <section className="mt-10 border-t border-border pt-8" aria-labelledby="earn">
        <h2 id="earn" className="text-xl font-bold">
          How to earn hasanat
        </h2>
        <ul className="mt-4 divide-y divide-border">
          {WAYS.map((way) => (
            <li key={way.label} className="flex items-center justify-between gap-3 py-3 text-[15px]">
              <span>{way.label}</span>
              <span className="tabular shrink-0 font-bold text-gold">+{way.points}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">{HASANAT_NOTE} Private profiles still earn hasanat; they just aren&apos;t ranked in public.</p>
      </section>
    </div>
  );
}
