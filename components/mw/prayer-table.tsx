"use client";

import { useEffect, useState } from "react";
import type { PrayerDay, PrayerKey } from "@/lib/prayer/times";
import { prayerLabel } from "@/lib/prayer/times";
import { cn } from "@/lib/utils";

export function PrayerTable({ day, initialNow }: { day: PrayerDay; initialNow: string }) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const nextKey = nextKeyAt(day, now);

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Today&apos;s prayer times</caption>
      <thead>
        <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
          <th className="px-3 py-2 font-bold">Prayer</th>
          <th className="px-3 py-2 font-bold">Adhan</th>
          <th className="px-3 py-2 font-bold">Iqamah</th>
        </tr>
      </thead>
      <tbody>
        {day.rows.map((row) => (
          <tr key={row.key} className={cn(row.key === nextKey && "bg-primary-soft")} data-prayer={row.key}>
            <th className="px-3 py-3 text-left font-semibold" scope="row">
              {row.key === "dhuhr" ? prayerLabel("dhuhr", day.jumuah) : row.label}
            </th>
            <td className="tabular px-3 py-3 text-lg font-extrabold">{row.adhan}</td>
            <td className="px-3 py-3 text-muted-foreground">Not yet added</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function nextKeyAt(day: PrayerDay, nowIso: string): PrayerKey {
  const now = new Date(nowIso).getTime();
  const salah = day.rows.filter((row) => row.key !== "sunrise");
  return salah.find((row) => new Date(row.at).getTime() > now)?.key ?? "fajr";
}

export function Countdown({ at, label }: { at: string; label: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const tick = () => {
      const delta = new Date(at).getTime() - Date.now();
      if (delta <= 0) {
        setText("now");
        return;
      }
      const minutes = Math.floor(delta / 60000);
      const hours = Math.floor(minutes / 60);
      setText(hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [at]);
  return (
    <p className="text-sm text-muted-foreground">
      <span className="text-xs font-extrabold tracking-wide uppercase">Next prayer</span>
      <span className="mt-1 block text-2xl font-extrabold text-foreground tabular">
        {label} · {text}
      </span>
    </p>
  );
}
