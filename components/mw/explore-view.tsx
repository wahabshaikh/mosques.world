"use client";

import { LocateFixed, Navigation, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { formatDistance } from "@/lib/geo/distance";
import type { PlaceKindFilter } from "@/lib/places/view";
import { cn } from "@/lib/utils";
import { PlaceMap } from "./place-map";

export type ExplorePlace = {
  id: string;
  slug: string;
  name: string;
  locality: string | null;
  kind: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
  nextLabel: string;
  nextTime: string;
  tint: string;
};

export function ExploreView({
  places,
  where,
  lat,
  lng,
  zoom,
  kind,
  subline,
  showGeoPrompt,
}: {
  places: ExplorePlace[];
  where: string;
  lat: number;
  lng: number;
  zoom: number;
  kind: PlaceKindFilter;
  subline: string;
  showGeoPrompt: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(where);
  const queryRef = useRef(where);
  const [suggestions, setSuggestions] = useState<Array<{ label: string; lat: number; lng: number }>>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState(false);
  const [searchAsMove, setSearchAsMove] = useState(true);

  useEffect(() => {
    setQuery(where);
  }, [where]);

  const cards = useMemo(() => places, [places]);

  async function onType(value: string) {
    queryRef.current = value;
    setQuery(value);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const response = await fetch(`/api/v1/geocode/autocomplete?q=${encodeURIComponent(value)}`);
    if (!response.ok || queryRef.current !== value) return;
    const body = (await response.json()) as { suggestions: Array<{ label: string; lat: number; lng: number }> };
    if (queryRef.current !== value) return;
    setSuggestions(body.suggestions);
  }

  function goTo(next: { label: string; lat: number; lng: number }) {
    const params = new URLSearchParams({
      where: next.label,
      lat: String(next.lat),
      lng: String(next.lng),
      z: "12",
    });
    if (kind !== "all") params.set("kind", kind);
    track("search", { has_where: true, filters: kind });
    router.push(`/search?${params.toString()}`);
    setSuggestions([]);
  }

  function setKind(next: PlaceKindFilter) {
    const params = new URLSearchParams({
      where,
      lat: String(lat),
      lng: String(lng),
      z: String(zoom),
    });
    if (next !== "all") params.set("kind", next);
    track("search", { has_where: Boolean(where), filters: next });
    router.push(`/search?${params.toString()}`);
  }

  return (
    <div>
      <div className="border-b border-border bg-background">
        <div className="mx-auto max-w-[1440px] px-4 py-4 lg:px-6">
          <form
            className="mx-auto flex max-w-3xl items-center gap-2 rounded-full border border-border bg-card p-2 shadow-[0_3px_12px_rgba(31,29,26,.08)]"
            onSubmit={(event) => {
              event.preventDefault();
              const first = suggestions[0];
              if (first) goTo(first);
            }}
          >
            <label className="relative min-w-0 flex-1">
              <span className="px-3 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Where</span>
              <input
                aria-label="Where"
                value={query}
                onChange={(event) => void onType(event.target.value)}
                className="w-full bg-transparent px-3 pb-2 text-sm outline-none"
                placeholder="City or mosque"
                autoComplete="off"
              />
              {suggestions.length > 0 ? (
                <ul className="absolute top-full right-0 left-0 z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-lg">
                  {suggestions.map((item) => (
                    <li key={`${item.label}-${item.lat}`}>
                      <button
                        type="button"
                        className="block w-full px-4 py-3 text-left text-sm hover:bg-muted"
                        onClick={() => goTo(item)}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
            <button
              type="submit"
              className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
              aria-label="Search"
            >
              <Search className="size-5" />
            </button>
          </form>
          <div className="mt-4 flex gap-2 overflow-x-auto">
            <FilterChip active={kind === "all"} onClick={() => setKind("all")} icon={<Navigation className="size-4" />}>
              Nearby
            </FilterChip>
            <FilterChip active={kind === "prayer_room"} onClick={() => setKind("prayer_room")}>
              Prayer rooms
            </FilterChip>
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(0,840px)_1fr]">
        <section className={cn("px-4 py-6 lg:px-6", mapMode && "hidden lg:block")}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {cards.length} {cards.length === 1 ? "place" : "mosques & prayer spaces"} nearby
              </h1>
              <p className="text-sm text-muted-foreground">{subline}</p>
            </div>
            <p className="text-sm font-semibold">Distance</p>
          </div>
          {showGeoPrompt ? (
            <button
              type="button"
              className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-primary-soft px-4 py-3 text-left text-sm"
              onClick={() => {
                navigator.geolocation.getCurrentPosition((position) => {
                  track("geolocation_granted", {});
                  goTo({
                    label: "Near you",
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                  });
                });
              }}
            >
              <LocateFixed className="size-4 text-primary" />
              Use your location for a closer list. We only use it to centre the map.
            </button>
          ) : null}
          {cards.length === 0 ? (
            <p className="rounded-2xl bg-muted p-6 text-sm">
              No places in this area yet. The directory is seeded from OpenStreetMap and grows city by city.{" "}
              <Link href="/search?where=London&lat=51.5074&lng=-0.1278&z=11" className="font-semibold text-primary">
                Browse London
              </Link>
            </p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((place) => (
                <li key={place.id}>
                  <Link
                    href={`/m/${place.slug}`}
                    data-place-card={place.id}
                    onMouseEnter={() => setActiveId(place.id)}
                    onMouseLeave={() => setActiveId(null)}
                    onFocus={() => setActiveId(place.id)}
                    className={cn(
                      "block overflow-hidden rounded-2xl border border-border bg-card",
                      activeId === place.id && "ring-2 ring-primary",
                    )}
                  >
                    <div className="relative aspect-[4/3.3]" style={{ background: place.tint }}>
                      <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2 py-1 text-[11px] font-bold">
                        Adhan
                      </span>
                    </div>
                    <div className="space-y-1 p-3">
                      <h2 className="font-bold">{place.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {place.locality}
                        {place.distanceKm !== null ? ` · ${formatDistance(place.distanceKm)}` : ""}
                      </p>
                      <p className="text-sm">
                        <span className="tabular text-base font-extrabold">
                          {place.nextLabel} {place.nextTime}
                        </span>{" "}
                        <span className="text-muted-foreground">· adhan</span>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className={cn("relative min-h-[70vh]", !mapMode && "hidden lg:block")}>
          <PlaceMap
            places={cards}
            lat={lat}
            lng={lng}
            zoom={zoom}
            activeId={activeId}
            searchAsMove={searchAsMove}
            onToggleSearchAsMove={() => setSearchAsMove((value) => !value)}
            onMove={(bbox) => {
              if (!searchAsMove) return;
              const nextLat = (bbox.south + bbox.north) / 2;
              const nextLng = (bbox.west + bbox.east) / 2;
              if (Math.abs(nextLat - lat) < 0.01 && Math.abs(nextLng - lng) < 0.01) return;
              track("map_moved", {});
              const params = new URLSearchParams({
                where: where || "Map area",
                lat: String(nextLat),
                lng: String(nextLng),
                z: String(zoom),
                bbox: `${bbox.west.toFixed(4)},${bbox.south.toFixed(4)},${bbox.east.toFixed(4)},${bbox.north.toFixed(4)}`,
              });
              if (kind !== "all") params.set("kind", kind);
              router.replace(`/search?${params.toString()}`);
            }}
          />
        </aside>
      </div>
      <button
        type="button"
        className="fixed right-4 bottom-4 z-30 rounded-full bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground shadow-lg lg:hidden"
        onClick={() => setMapMode((value) => !value)}
      >
        {mapMode ? "List" : "Map"}
      </button>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
        active ? "border-foreground bg-foreground text-background" : "border-border bg-card",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
