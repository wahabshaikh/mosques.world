import { CalendarCheck, ChevronRight, CircleAlert, Plus, ShieldCheck, Users } from "lucide-react";
import { REWARD } from "@/lib/hasanat";
import { formatDistance } from "@/lib/geo/distance";
import { cn } from "@/lib/utils";
import type { ExplorePlace } from "./explore-view";

/**
 * The inside of a place row (explore, city pages, saved): thumbnail, name and where, then the masjid's
 * next jamā'ah when someone has added it. A masjid without times says so and asks for them; the
 * calculated adhan never stands in for a masjid's own times.
 */
export function PlaceRowContent({ place, showDistance = true }: { place: ExplorePlace; showDistance?: boolean }) {
  const known = place.timeSource !== "calculated";
  return (
    <>
      <PlaceThumb place={place} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-bold">{place.name}</span>
          {place.verifiers > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
              <span className="sr-only">confirmed by</span>
              {place.verifiers}
            </span>
          ) : null}
        </span>
        <span className="truncate text-sm text-muted-foreground">
          {[place.locality, showDistance && place.distanceKm !== null ? formatDistance(place.distanceKm) : null, place.tag].filter(Boolean).join(" · ")}
        </span>
        {known ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-2">
            <span className="tabular text-[15px] font-extrabold">
              {place.nextLabel} <span className={cn(place.timeSource === "mosque" && "text-primary")}>{place.nextTime}</span>
            </span>
            <CardStatus place={place} />
          </span>
        ) : (
          <span className="mt-0.5 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">No jamā&apos;ah times yet</span>
            <CardStatus place={place} />
          </span>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
    </>
  );
}

/** "iqamah · fixed", "iqamah · 10 min after adhan", "adhan" for a timetable that has no iqamah. */
export function ruleText(place: Pick<ExplorePlace, "nextKind" | "iqamahRule">): string {
  if (place.nextKind === "adhan") return "adhan";
  if (typeof place.iqamahRule === "number") return place.iqamahRule === 0 ? "iqamah at adhan" : `iqamah ${place.iqamahRule} min after adhan`;
  return "iqamah";
}

/**
 * One chip beside the time saying whose time it is: the mosque's own timetable (solid), the
 * community's iqamah (outlined, amber when a change is reported), or an ask to add times.
 */
export function CardStatus({ place }: { place: ExplorePlace }) {
  if (place.timeSource === "mosque") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground" data-time-source="mosque">
        <CalendarCheck className="size-3 shrink-0" aria-hidden="true" /> {ruleText(place)} · mosque timetable
      </span>
    );
  }
  if (place.changeReported) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning" data-time-source="community">
        <CircleAlert className="size-3 shrink-0" aria-hidden="true" /> change reported
      </span>
    );
  }
  if (place.timeSource === "calculated") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-bold text-gold" data-time-source="calculated">
        <Plus className="size-3" aria-hidden="true" /> Add · +{REWARD.addTimes}
      </span>
    );
  }
  const verified = place.verification === "verified";
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] font-bold", verified ? "border-primary text-primary" : "border-border text-muted-foreground")}
      data-time-source="community"
    >
      <Users className="size-3 shrink-0" aria-hidden="true" /> {ruleText(place)}{verified ? " · verified" : ""}
    </span>
  );
}

/** What the three kinds of time look like, for the list and the map. */
export function TimeSourceLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground", className)} aria-label="What the times mean" data-testid="time-legend">
      <li className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" /> Mosque timetable
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full border-2 border-primary bg-background" aria-hidden="true" /> Community iqamah
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/40" aria-hidden="true" /> No times yet
      </li>
    </ul>
  );
}

export function PlaceThumb({ place }: { place: ExplorePlace }) {
  if (place.photo) {
    return <img src={place.photo} alt="" loading="lazy" className="size-16 shrink-0 rounded-2xl object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-16 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold text-foreground/70"
      style={{ background: place.tint }}
    >
      {place.monogram}
    </span>
  );
}

