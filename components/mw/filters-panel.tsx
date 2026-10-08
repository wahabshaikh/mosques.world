"use client";

import { Accessibility, BookOpen, Clock, Droplet, HeartHandshake, Moon, SquareParking, Toilet, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NEED_FILTERS, type NeedSlug } from "@/lib/places/needs";
import type { PlaceKindFilter } from "@/lib/places/view";
import { cn } from "@/lib/utils";

const NEED_ICONS: Record<NeedSlug, React.ComponentType<{ className?: string }>> = {
  women_section: UserRound,
  wudhu: Droplet,
  step_free: Accessibility,
  parking: SquareParking,
  open_for_fajr: Moon,
  classes: BookOpen,
  toilets: Toilet,
  janazah: HeartHandshake,
  open_between_prayers: Clock,
};

function NeedIcon({ slug }: { slug: NeedSlug }) {
  const Icon = NEED_ICONS[slug];
  return <Icon className="size-4" />;
}

export type Selection = { kind: PlaceKindFilter; needs: NeedSlug[]; verified: boolean };

/** Filters dialog body (spec 3.5 FiltersDialog), loaded when the Filters button is first pressed. */
export default function FiltersPanel({
  kind,
  needs,
  verified,
  bboxQuery,
  onApply,
  open,
  setOpen,
}: Selection & { bboxQuery: string; onApply: (selection: Selection) => void; open: boolean; setOpen: (open: boolean) => void }) {
  const [draft, setDraft] = useState<Selection>({ kind, needs, verified });
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (open) setDraft({ kind, needs, verified });
  }, [open, kind, needs, verified]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams(bboxQuery);
    const lat = Number(params.get("lat"));
    const lng = Number(params.get("lng"));
    const zoom = Number(params.get("z"));
    const radius = zoom >= 13 ? 0.08 : zoom >= 11 ? 0.2 : 0.6;
    const query = new URLSearchParams({ bbox: `${lng - radius * 1.6},${lat - radius},${lng + radius * 1.6},${lat + radius}` });
    if (draft.kind !== "all") query.set("kind", draft.kind);
    if (draft.needs.length) query.set("needs", draft.needs.join(","));
    if (draft.verified) query.set("verified", "1");
    void fetch(`/api/v1/places?${query.toString()}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ features: unknown[] }>) : null))
      .then((body) => setCount(body ? body.features.length : null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [open, draft, bboxQuery]);

  const toggle = (slug: NeedSlug) =>
    setDraft((current) => ({ ...current, needs: current.needs.includes(slug) ? current.needs.filter((item) => item !== slug) : [...current.needs, slug] }));

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <div className="flex h-16 shrink-0 items-center justify-center border-b border-border">
            <DialogTitle className="text-base font-extrabold">Filters</DialogTitle>
          </div>
          <DialogDescription className="sr-only">Narrow the list by place type and facilities.</DialogDescription>
          <div className="flex flex-col gap-8 overflow-y-auto px-6 py-6">
            <fieldset>
              <legend className="mb-3 text-lg font-bold">Type of place</legend>
              <div className="grid grid-cols-3 overflow-hidden rounded-[12px] border border-border-strong">
                {(
                  [
                    ["all", "Any"],
                    ["mosque", "Mosques"],
                    ["prayer_room", "Prayer rooms"],
                  ] as const
                ).map(([value, label], index) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={draft.kind === value}
                    onClick={() => setDraft((current) => ({ ...current, kind: value }))}
                    className={cn("py-3 text-sm font-semibold", index > 0 && "border-s border-border-strong", draft.kind === value && "bg-secondary text-secondary-foreground")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-3 text-lg font-bold">Facilities</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {NEED_FILTERS.map((filter) => (
                  <label key={filter.slug} className="flex items-center gap-3 text-[15px]">
                    <input type="checkbox" className="size-5" checked={draft.needs.includes(filter.slug)} onChange={() => toggle(filter.slug)} />
                    <NeedIcon slug={filter.slug} />
                    {filter.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-3 text-[15px]">
              <input type="checkbox" className="size-5" checked={draft.verified} onChange={(event) => setDraft((current) => ({ ...current, verified: event.target.checked }))} />
              Has prayer times (mosque timetable or community-verified)
            </label>
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-4">
            <button type="button" className="text-[15px] font-bold underline" onClick={() => setDraft({ kind: "all", needs: [], verified: false })}>
              Clear all
            </button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                onApply(draft);
              }}
            >
              {count === null ? "Show places" : `Show ${count >= 500 ? "500+" : count} ${count === 1 ? "place" : "places"}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
