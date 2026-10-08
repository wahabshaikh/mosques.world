import { CalendarCheck, CircleAlert, ShieldCheck, Users } from "lucide-react";
import { formatDistance } from "@/lib/geo/distance";
import { cn } from "@/lib/utils";
import type { ExplorePlace } from "./explore-view";

/** The inside of a place row (explore, city pages, saved): thumbnail, name and where, next time and how sure we are. */
export function PlaceRowContent({ place, showDistance = true }: { place: ExplorePlace; showDistance?: boolean }) {
  return (
    <>
      <PlaceThumb place={place} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-bold">{place.name}</span>
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
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-end">
        {/* Calculated adhan is the same for every place nearby, so it stays quiet and real jamā'ah times stand out. */}
        <span
          className={cn(
            "tabular text-base",
            place.timeSource === "calculated" ? "font-semibold text-muted-foreground" : "font-extrabold",
            place.timeSource === "mosque" && "text-primary",
          )}
        >
          {place.nextLabel} {place.nextTime}
        </span>
        <CardStatus place={place} />
      </span>
    </>
  );
}

/**
 * One chip under the time saying whose time it is, so the list reads at a glance: the mosque's own
 * timetable (solid), the community's iqamah (outlined), or the calculated adhan (quiet grey).
 */
export function CardStatus({ place }: { place: ExplorePlace }) {
  if (place.timeSource === "mosque") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground" data-time-source="mosque">
        <CalendarCheck className="size-3" aria-hidden="true" /> {place.nextKind === "iqamah" ? "iqamah" : "adhan"} · mosque timetable
      </span>
    );
  }
  if (place.changeReported) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning" data-time-source="community">
        <CircleAlert className="size-3" aria-hidden="true" /> iqamah · change reported
      </span>
    );
  }
  if (place.timeSource === "calculated") {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground" data-time-source="calculated">
        adhan · calculated
      </span>
    );
  }
  const verified = place.verification === "verified";
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold", verified ? "border-primary text-primary" : "border-border text-muted-foreground")}
      data-time-source="community"
    >
      <Users className="size-3" aria-hidden="true" /> iqamah · community{verified ? ", verified" : ""}
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
        <span className="size-2.5 rounded-full bg-muted-foreground/40" aria-hidden="true" /> Calculated adhan only
      </li>
    </ul>
  );
}

export function PlaceThumb({ place }: { place: ExplorePlace }) {
  if (place.photo) {
    return <img src={place.photo} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-14 shrink-0 items-center justify-center rounded-xl text-base font-extrabold text-foreground/70"
      style={{ background: place.tint }}
    >
      {place.monogram}
    </span>
  );
}

