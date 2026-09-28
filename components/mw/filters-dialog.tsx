"use client";

import { Accessibility, BookOpen, Clock, Droplet, HeartHandshake, Moon, SlidersHorizontal, SquareParking, Toilet, UserRound } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import type { NeedSlug } from "@/lib/places/needs";
import type { Selection } from "./filters-panel";

const FiltersPanel = lazy(() => import("./filters-panel"));

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

export function NeedIcon({ slug }: { slug: NeedSlug }) {
  const Icon = NEED_ICONS[slug];
  return <Icon className="size-4" />;
}

/** Filters button with an active count; the dialog itself loads on first open. */
export function FiltersDialog(props: Selection & { community: boolean; bboxQuery: string; onApply: (selection: Selection) => void }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const active = props.needs.length + (props.verified ? 1 : 0) + (props.kind !== "all" ? 1 : 0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold"
      >
        <SlidersHorizontal className="size-4" /> Filters
        {active > 0 ? (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] text-background">{active}</span>
        ) : null}
      </button>
      {loaded ? (
        <Suspense fallback={null}>
          <FiltersPanel {...props} open={open} setOpen={setOpen} />
        </Suspense>
      ) : null}
    </>
  );
}
