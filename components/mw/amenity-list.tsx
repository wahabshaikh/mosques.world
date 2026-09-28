import type { AmenityRow } from "@/lib/places/amenities";
import { cn } from "@/lib/utils";
import { AmenityIcon } from "./amenity-icon";

export function AmenityList({ rows }: { rows: AmenityRow[] }) {
  return (
    <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2" aria-label="What this place offers">
      {rows.map((row) => (
        <li key={row.key} className="flex items-start gap-4" data-amenity={row.key} data-available={row.available}>
          <AmenityIcon amenity={row.key} className="mt-0.5 size-6 shrink-0" />
          <span className="flex flex-col gap-0.5">
            <span className={cn("text-base", !row.available && "text-muted-foreground line-through")}>
              {row.label}
              {!row.available ? <span className="sr-only"> (not available)</span> : null}
            </span>
            <span className="text-[13px] text-muted-foreground">
              {[row.note, row.fromOsm && row.confirms <= 1 ? "from OpenStreetMap" : `${row.confirms} confirm`].filter(Boolean).join(" · ")}
              {row.state === "stale" ? " · needs check" : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
