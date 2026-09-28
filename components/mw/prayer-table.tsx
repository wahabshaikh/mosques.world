"use client";

import { Check, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PrayerDay, PrayerKey } from "@/lib/prayer/times";
import { prayerLabel } from "@/lib/prayer/times";
import { cn } from "@/lib/utils";
import { ConfirmButton } from "./place-actions";

export type IqamahCell = {
  candidateId: string;
  factKey: string;
  /** Offer one-tap confirmation (unverified or stale, no open change). */
  confirmable: boolean;
  label: string;
  /** Instant of today's iqamah (for "next" highlighting). */
  at: string;
  status: string;
  tone: "ok" | "muted" | "warning";
};

export type PrayerTableExtras = {
  iqamah: Partial<Record<PrayerKey, IqamahCell>>;
  /** Shown in the community column for rows without a value (e.g. an "Add" link). */
  addHref?: string;
  jumuahNote?: string;
};

function nextKeyAt(day: PrayerDay, nowIso: string, extras?: PrayerTableExtras): PrayerKey {
  const now = new Date(nowIso).getTime();
  const salah = day.rows.filter((row) => row.key !== "sunrise");
  return salah.find((row) => new Date(extras?.iqamah[row.key]?.at ?? row.at).getTime() > now)?.key ?? "fajr";
}

export function minutesUntil(atIso: string, nowIso: string): number {
  return Math.max(0, Math.round((new Date(atIso).getTime() - new Date(nowIso).getTime()) / 60000));
}

export function untilLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`;
}

export function PrayerTable({ day, initialNow, extras }: { day: PrayerDay; initialNow: string; extras?: PrayerTableExtras }) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const nextKey = nextKeyAt(day, now, extras);
  const community = Boolean(extras);

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Today&apos;s prayer times</caption>
      <thead>
        <tr className="bg-muted text-left text-xs tracking-wide text-muted-foreground uppercase">
          <th className="px-3 py-3 font-bold sm:px-5">Prayer</th>
          <th className="px-3 py-3 font-bold">Adhan</th>
          <th className="px-3 py-3 font-bold">Iqamah</th>
          {community ? <th className="hidden px-3 py-3 font-bold md:table-cell">Community check</th> : null}
        </tr>
      </thead>
      <tbody>
        {day.rows.map((row) => {
          const cell = extras?.iqamah[row.key];
          const next = row.key === nextKey;
          const target = cell?.at ?? row.at;
          return (
            <tr key={row.key} className={cn("border-t border-border", next && "bg-primary-soft")} data-prayer={row.key}>
              <th className="px-3 py-3 text-left font-semibold sm:px-5" scope="row">
                <span className="block text-base font-bold">{row.key === "dhuhr" ? prayerLabel("dhuhr", day.jumuah) : row.label}</span>
                {next ? (
                  <span className="block text-xs font-bold text-primary uppercase">
                    Next · in {untilLabel(minutesUntil(target, now))}
                  </span>
                ) : null}
              </th>
              <td className={cn("tabular px-3 py-3", community ? "text-base text-muted-foreground" : "text-lg font-extrabold")}>{row.adhan}</td>
              {cell ? (
                <td className="tabular px-3 py-3 text-base font-extrabold" data-iqamah={row.key}>
                  {cell.label}
                  <span className={cn("mt-0.5 block text-xs font-semibold md:hidden", toneClass(cell.tone))}>{cell.status}</span>
                  {cell.confirmable ? (
                    <span className="md:hidden">
                      <ConfirmButton candidateId={cell.candidateId} factKey={cell.factKey} label={cell.label} />
                    </span>
                  ) : null}
                </td>
              ) : (
                <td className="px-3 py-3 text-muted-foreground">{row.key === "sunrise" ? "—" : "Not yet added"}</td>
              )}
              {community ? (
                <td className="hidden px-3 py-3 md:table-cell">
                  {cell ? (
                    <span className="flex flex-col items-start gap-1">
                      <span className={cn("inline-flex items-center gap-2 text-[13px]", toneClass(cell.tone))}>
                        {cell.tone === "ok" ? <Check className="size-4 text-primary" strokeWidth={2.6} aria-hidden="true" /> : null}
                        {cell.tone === "warning" ? <CircleAlert className="size-4" aria-hidden="true" /> : null}
                        {cell.status}
                      </span>
                      {cell.confirmable ? <ConfirmButton candidateId={cell.candidateId} factKey={cell.factKey} label={cell.label} /> : null}
                    </span>
                  ) : row.key === "sunrise" ? (
                    <span className="text-[13px] text-muted-foreground">No jamā&apos;ah</span>
                  ) : row.key === "dhuhr" && day.jumuah && extras?.jumuahNote ? (
                    <span className="text-[13px] text-muted-foreground">{extras.jumuahNote}</span>
                  ) : extras?.addHref ? (
                    <Link href={extras.addHref} className="text-[13px] font-semibold underline">
                      Add
                    </Link>
                  ) : null}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function toneClass(tone: IqamahCell["tone"]): string {
  if (tone === "ok") return "text-primary";
  if (tone === "warning") return "text-warning";
  return "text-muted-foreground";
}

export type NextRow = {
  key: PrayerKey;
  label: string;
  adhan: string;
  adhanAt: string;
  iqamah?: string;
  iqamahAt?: string;
  meta?: string;
};

/** Sticky "next prayer" card; picks the next jamā'ah client-side so cached HTML stays correct. */
export function Countdown({ rows, initialNow }: { rows: NextRow[]; initialNow: string }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const nowMs = new Date(now).getTime();
  const next = rows.find((row) => new Date(row.iqamahAt ?? row.adhanAt).getTime() > nowMs) ?? rows[0];
  if (!next) return null;
  const minutes = minutesUntil(next.iqamahAt ?? next.adhanAt, now);
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Next prayer</p>
        <p className="tabular mt-1 text-2xl font-extrabold tracking-tight lg:text-3xl">
          {next.label} · {next.iqamah ?? next.adhan}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {next.iqamah ? `Adhan ${next.adhan} · ${next.meta ?? "iqamah"}` : "Adhan · calculated"}
        </p>
      </div>
      <span className="rounded-full bg-primary-soft px-3 py-1.5 text-[13px] font-extrabold whitespace-nowrap text-primary">
        in {untilLabel(minutes)}
      </span>
    </div>
  );
}
