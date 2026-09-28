"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { minutesUntil, untilLabel, type NextRow } from "./prayer-table";

/** Sticky bottom bar on phones (spec 3.5 MobileActionBar): next iqamah + countdown · "I'm here". */
export function MobileActionBar({ rows, initialNow, placeId }: { rows: NextRow[]; initialNow: string; placeId: string }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const nowMs = new Date(now).getTime();
  const next = rows.find((row) => new Date(row.iqamahAt ?? row.adhanAt).getTime() > nowMs) ?? rows[0];
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      {next ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="tabular truncate text-[15px] font-extrabold">
            {next.label} · {next.iqamah ?? next.adhan}
          </span>
          <span className="text-xs text-muted-foreground">
            {next.iqamah ? "Iqamah" : "Adhan"} in {untilLabel(minutesUntil(next.iqamahAt ?? next.adhanAt, now))}
          </span>
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <Link
        href={`/verify?place=${placeId}`}
        onClick={() => track("im_here_tapped", { from: "action_bar" })}
        className="inline-flex h-12 shrink-0 items-center rounded-[12px] bg-primary px-5 font-bold text-primary-foreground"
      >
        I&apos;m here
      </Link>
    </div>
  );
}
