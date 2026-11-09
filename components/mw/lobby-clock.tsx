"use client";

import { useEffect, useState } from "react";

/** Clock in the mosque's time zone. The first paint matches the server; ticks stay in the browser. */
export function LobbyClock({ timeZone, initialIso, hour12, reloadAt }: { timeZone: string; initialIso: string; hour12: boolean; reloadAt: string | null }) {
  const [iso, setIso] = useState(initialIso);

  useEffect(() => {
    const tick = () => setIso(new Date().toISOString());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const next = reloadAt ? new Date(reloadAt).getTime() : Date.now() + 30 * 60_000;
    const delay = Math.min(Math.max(next - Date.now() + 1500, 60_000), 30 * 60_000);
    const id = setTimeout(() => window.location.reload(), delay);
    return () => clearTimeout(id);
  }, [reloadAt]);

  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: hour12 ? "h12" : "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value;

  return (
    <p className="tabular text-[clamp(3.25rem,10vw,7.5rem)] leading-none font-extrabold tracking-[-0.04em]" suppressHydrationWarning>
      <time dateTime={iso}>
        {pick("hour")}:{pick("minute")}
        <span className="ms-[0.08em] text-[0.38em] font-semibold tracking-normal text-[#a9a399]">
          {pick("second")}
          {dayPeriod ? ` ${dayPeriod}` : ""}
        </span>
      </time>
    </p>
  );
}
