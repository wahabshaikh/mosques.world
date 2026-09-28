"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { OfflinePlace } from "@/lib/offline";

function localDate(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function weekday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, day ?? 1)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Today's times for every saved place, from a 7-day feed the service worker keeps for offline use
 * (spec P5). The day is picked on the device, so a copy fetched earlier in the week stays correct.
 */
export function SavedWeek() {
  const [places, setPlaces] = useState<OfflinePlace[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    void fetch("/api/v1/saved/offline")
      .then((response) => (response.ok ? (response.json() as Promise<{ places: OfflinePlace[] }>) : null))
      .then((body) => setPlaces(body?.places ?? []))
      .catch(() => setPlaces([]));
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!places || places.length === 0) return null;
  return (
    <section className="mt-12" aria-labelledby="saved-times">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="saved-times" className="text-xl font-bold">
          Times this week
        </h2>
        {offline ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground" role="status">
            <WifiOff className="size-4" aria-hidden="true" /> Offline — saved times
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Available offline</span>
        )}
      </div>
      <ul className="mt-4 flex flex-col gap-4">
        {places.map((place) => {
          const today = localDate(place.timezone);
          const days = place.days.filter((day) => day.date >= today);
          const current = days[0];
          if (!current) return null;
          return (
            <li key={place.id} className="rounded-2xl border border-input p-4" data-saved-times={place.slug}>
              <p className="font-bold">{place.name}</p>
              <p className="text-sm text-muted-foreground">{weekday(current.date)}</p>
              <dl className="mt-3 grid grid-cols-5 gap-2 text-center">
                {current.prayers.map((prayer) => (
                  <div key={prayer.key} className="flex flex-col-reverse gap-0.5 rounded-xl bg-muted px-1 py-2">
                    <dt className="text-xs text-muted-foreground">{prayer.label}</dt>
                    <dd className="tabular text-sm font-extrabold">{prayer.iqamah ?? prayer.adhan}</dd>
                  </div>
                ))}
              </dl>
              {days.length > 1 ? (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-semibold">Next {days.length - 1} days</summary>
                  <table className="mt-2 w-full text-start tabular">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="py-1 font-semibold">Day</th>
                        {current.prayers.map((prayer) => (
                          <th key={prayer.key} className="py-1 font-semibold">
                            {prayer.key === "dhuhr" ? "Dhuhr" : prayer.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {days.slice(1).map((day) => (
                        <tr key={day.date} className="border-t border-border">
                          <td className="py-1.5">{weekday(day.date)}</td>
                          {day.prayers.map((prayer) => (
                            <td key={prayer.key} className="py-1.5">
                              {prayer.iqamah ?? prayer.adhan}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Iqamah where the community has added it, otherwise the calculated adhan.</p>
    </section>
  );
}
