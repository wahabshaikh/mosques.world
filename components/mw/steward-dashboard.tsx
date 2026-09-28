import { CircleAlert, Clock, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import type { StewardPlace } from "@/lib/stewards";
import { cn } from "@/lib/utils";
import { StewardConfirm } from "./steward-forms";

const KIND = {
  dispute: { icon: CircleAlert, label: "Disputed", tint: "bg-warning-soft text-warning" },
  held: { icon: UserRoundCheck, label: "Waiting for review", tint: "bg-muted text-foreground" },
  stale: { icon: Clock, label: "Needs a check", tint: "bg-muted text-foreground" },
} as const;

/** The steward dashboard (spec P6): each place's open disputes, held changes and stale values, one click each. */
export function StewardDashboard({ places }: { places: StewardPlace[] }) {
  return (
    <ul className="flex flex-col gap-8">
      {places.map((place) => (
        <li key={place.id} data-steward-place={place.slug}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold">
              <Link href={`/m/${place.slug}`} className="hover:underline">
                {place.name}
              </Link>
            </h2>
            <Link href={`/m/${place.slug}/update`} className="text-sm font-semibold underline">
              Update timings
            </Link>
          </div>
          {place.locality ? <p className="text-sm text-muted-foreground">{place.locality}</p> : null}
          {place.items.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-primary-soft p-4 text-sm font-semibold text-primary">Everything here is up to date. JazakAllahu khayran.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-border rounded-2xl border border-border">
              {place.items.map((item) => {
                const kind = KIND[item.kind];
                const Icon = kind.icon;
                return (
                  <li key={`${item.kind}-${item.confirmId}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-steward-item={item.kind}>
                    <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", kind.tint)}>
                      <Icon className="size-3.5" aria-hidden="true" /> {kind.label}
                    </span>
                    <span className="flex-1 text-sm">
                      <strong>{item.label}</strong> · {item.detail}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <StewardConfirm candidateId={item.confirmId} label={item.confirmLabel} factKey={item.key} />
                      {item.otherId && item.otherLabel ? <StewardConfirm candidateId={item.otherId} label={item.otherLabel} factKey={item.key} primary={false} /> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
