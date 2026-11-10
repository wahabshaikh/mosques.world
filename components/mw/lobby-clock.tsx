"use client";

import { useEffect, useState } from "react";
import { formatCountdown, reloadDelay } from "@/lib/masjid-pro";

/**
 * Clock and countdown in the mosque's time zone. The first paint matches the server.
 * The page reloads at the next congregation, and at least every 30 minutes.
 */
export function LobbyClock({
  timeZone,
  initialIso,
  hour12,
  reloadAt,
  countdownPrefix,
  nowLabel,
  mutedClass,
}: {
  timeZone: string;
  initialIso: string;
  hour12: boolean;
  reloadAt: string | null;
  countdownPrefix: string;
  nowLabel: string;
  mutedClass: string;
}) {
  const [iso, setIso] = useState(initialIso);

  useEffect(() => {
    const tick = () => setIso(new Date().toISOString());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const delay = reloadDelay(reloadAt ? new Date(reloadAt).getTime() : null, Date.now());
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
  const remaining = reloadAt ? new Date(reloadAt).getTime() - date.getTime() : null;

  return (
    <div className="text-end">
      {remaining === null ? null : (
        <p className={`text-[clamp(0.95rem,2.3vh,1.7rem)] leading-none font-bold ${mutedClass}`} data-testid="lobby-countdown">
          {remaining <= 0 ? nowLabel : `${countdownPrefix} ${formatCountdown(remaining)}`}
        </p>
      )}
      <p className="tabular mt-[0.4vh] text-[clamp(3rem,10vh,8rem)] leading-none font-extrabold tracking-[-0.04em]" suppressHydrationWarning data-testid="lobby-clock">
        <time dateTime={iso}>
          {pick("hour")}:{pick("minute")}
          <span className={`ms-[0.08em] text-[0.38em] font-semibold tracking-normal ${mutedClass}`}>
            {pick("second")}
            {dayPeriod ? ` ${dayPeriod}` : ""}
          </span>
        </time>
      </p>
    </div>
  );
}
