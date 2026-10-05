import { CircleAlert, ShieldCheck } from "lucide-react";
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
        {/* Calculated adhan is the same for every place nearby, so it stays quiet and community iqamah times stand out. */}
        <span className={cn("tabular text-base", place.nextKind === "iqamah" ? "font-extrabold" : "font-semibold text-muted-foreground")}>
          {place.nextLabel} {place.nextTime}
        </span>
        <CardStatus place={place} />
      </span>
    </>
  );
}

/** One trust word under the time, so the list reads at a glance: whose time it is and how sure we are. */
function CardStatus({ place }: { place: ExplorePlace }) {
  if (place.changeReported) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning">
        <CircleAlert className="size-3" aria-hidden="true" /> iqamah · change reported
      </span>
    );
  }
  if (place.nextKind === "adhan") {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">adhan · no iqamah yet</span>;
  }
  const verified = place.verification === "verified";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", verified ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground")}>
      iqamah · {verified ? "verified" : "unverified"}
    </span>
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

