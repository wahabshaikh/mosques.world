"use client";

import { CalendarPlus } from "lucide-react";
import { track } from "@/lib/analytics";

/** Subscribe link for an ICS feed: `webcal://` opens the calendar app; the https URL is the fallback. */
export function CalendarLink({ path, label, scope }: { path: string; label: string; scope: "place" | "saved" }) {
  return (
    <a
      href={path}
      onClick={(event) => {
        track("ics_subscribed", { scope });
        const url = new URL(path, window.location.origin);
        if (url.protocol === "https:") {
          event.preventDefault();
          window.location.href = `webcal://${url.host}${url.pathname}`;
        }
      }}
      className="inline-flex items-center gap-1.5 font-semibold text-foreground underline"
    >
      <CalendarPlus className="size-4" aria-hidden="true" /> {label}
    </a>
  );
}
