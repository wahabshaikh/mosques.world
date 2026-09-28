import { CircleAlert, ShieldCheck } from "lucide-react";
import type { JumuahCard, TrustTone } from "@/lib/places/mosque";
import { avatarColor, initials } from "@/lib/people";
import { describeValue, factLabel } from "@/lib/trust/facts";
import type { ActivityView } from "@/lib/trust/read";
import { relativeAge, shortAge } from "@/lib/trust/summary";
import { cn } from "@/lib/utils";

export function TrustSummary({
  title,
  tone,
  sentence,
  agreement,
  lastCheck,
}: {
  title: string;
  tone: TrustTone;
  sentence: string;
  agreement: number | null;
  lastCheck: number | null;
}) {
  const warning = tone === "needs_check";
  return (
    <section
      aria-label="Community trust"
      className="flex flex-col gap-4 rounded-2xl border border-input p-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6"
      data-trust={tone}
    >
      <div className="flex items-center gap-3 sm:w-48">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", warning ? "bg-warning-soft" : "bg-primary-soft")}>
          {warning ? (
            <CircleAlert className="size-5 text-warning" aria-hidden="true" />
          ) : (
            <ShieldCheck className={cn("size-5", tone === "none" ? "text-muted-foreground" : "text-primary")} strokeWidth={2.4} aria-hidden="true" />
          )}
        </span>
        <span className="text-[17px] leading-tight font-extrabold">{title}</span>
      </div>
      <p className="flex-1 text-sm leading-6">{sentence}</p>
      <div className="flex gap-5">
        <div className="flex flex-col items-center">
          <span className="text-xl font-extrabold">{agreement === null ? "—" : `${agreement}%`}</span>
          <span className="text-xs text-muted-foreground">agreement</span>
        </div>
        <span className="w-px bg-border" aria-hidden="true" />
        <div className="flex flex-col items-center">
          <span className="text-xl font-extrabold">{shortAge(lastCheck, Date.now())}</span>
          <span className="text-xs text-muted-foreground">last check</span>
        </div>
      </div>
    </section>
  );
}

export function JumuahCards({ cards }: { cards: JumuahCard[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <li key={card.qualifier} className="flex flex-col gap-2 rounded-[14px] border border-input p-4">
          <span className="text-xs font-bold tracking-wide text-muted-foreground">{card.overline}</span>
          <span className="tabular text-[22px] font-extrabold">{card.time}</span>
          {card.detail ? <span className="text-sm text-muted-foreground">{card.detail}</span> : null}
          <span className="text-xs text-muted-foreground">{card.status}</span>
        </li>
      ))}
    </ul>
  );
}

function activityText(item: ActivityView): string {
  const key = item.payload.key ?? "";
  const label = key ? factLabel(key, item.payload.qualifier) : "a time";
  const value = key ? describeValue(key, item.payload.value) : "";
  switch (item.type) {
    case "proposed":
      if (item.payload.held) return `suggested ${label} ${value} (awaiting review)`;
      return key.startsWith("iqamah.") || key.startsWith("jumuah.") ? `reported ${label} iqamah is ${value}` : `reported ${label}: ${value}`;
    case "confirmed":
      return `confirmed ${label} ${value}`;
    case "disputed":
      return `questioned ${label} ${value}`;
    case "promoted":
      return item.payload.replaced ? `updated ${label} to ${value} after community confirmation` : `added ${label} ${value}`;
    case "reverted":
      return `restored the previous ${label} time`;
    case "photo_added":
      return "added a photo";
    case "place_added":
      return "added this place";
    case "place_confirmed":
      return "confirmed this place exists";
    default:
      return "updated this place";
  }
}

export function ActivityFeed({ items, now }: { items: ActivityView[]; now: number }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No community activity yet. Be the first to add a time.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3">
          <span
            className="flex size-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: item.actorId ? avatarColor(item.actorId) : "#0B6E4F" }}
            aria-hidden="true"
          >
            {item.actorId ? initials(item.handle) : "MW"}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">
              <strong>{item.handle}</strong> {activityText(item)}
            </span>
            <span className="text-xs text-muted-foreground">{relativeAge(item.createdAt, now)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
