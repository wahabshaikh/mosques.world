"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { REWARD } from "@/lib/hasanat";
import { minutesUntil, untilLabel, type NextRow } from "./prayer-table";
import { useText } from "./text";

/**
 * Sticky bottom bar on phones (spec 3.5 MobileActionBar): next jamā'ah + countdown · "I'm here". A masjid
 * with no jamā'ah times asks for them instead of showing the calculated adhan.
 */
export function MobileActionBar({ rows, initialNow, placeId, addHref }: { rows: NextRow[]; initialNow: string; placeId: string; addHref?: string }) {
  const [now, setNow] = useState(initialNow);
  const text = useText();
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const nowMs = new Date(now).getTime();
  const next = rows.find((row) => new Date(row.iqamahAt ?? row.adhanAt).getTime() > nowMs) ?? rows[0];
  const bar = "fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden";
  if (addHref) {
    return (
      <div className={bar}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-extrabold">{text("No jamā'ah times yet")}</span>
          <span className="truncate text-xs text-muted-foreground">{text("Add them and help the next person")}</span>
        </span>
        <Link
          href={addHref}
          onClick={() => track("update_opened", { from: "action_bar" })}
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-secondary px-5 font-semibold text-secondary-foreground"
        >
          {text("Add times")} <span className="text-xs font-bold text-gold-soft">+{REWARD.addTimes}</span>
        </Link>
      </div>
    );
  }
  return (
    <div className={bar}>
      {next ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="tabular truncate text-[15px] font-extrabold">
            {next.label} · {next.iqamah ?? next.adhan}
          </span>
          <span className="text-xs text-muted-foreground">
            {text(next.iqamah ? "Iqamah in {time}" : "Adhan in {time}", {
              time: untilLabel(minutesUntil(next.iqamahAt ?? next.adhanAt, now), {
                minutes: text("{n} min"),
                hours: text("{h}h"),
                hoursMinutes: text("{h}h {m}m"),
              }),
            })}
          </span>
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <Link
        href={`/verify?place=${placeId}`}
        onClick={() => track("im_here_tapped", { from: "action_bar" })}
        className="inline-flex h-12 shrink-0 items-center rounded-xl bg-primary px-6 font-bold text-primary-foreground"
      >
        {text("I'm here")}
      </Link>
    </div>
  );
}
