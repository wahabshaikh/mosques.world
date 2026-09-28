"use client";

import { CircleAlert, LocateFixed, Navigation, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { formatDistance } from "@/lib/geo/distance";
import type { PlaceKindFilter } from "@/lib/places/view";
import type { ExploreSort } from "@/lib/places/present";
import { NEED_FILTERS, type NeedSlug } from "@/lib/places/needs";
import { FiltersDialog, NeedIcon } from "./filters-dialog";

const CATEGORY_NEEDS: NeedSlug[] = ["women_section", "wudhu", "step_free", "parking", "open_for_fajr", "classes"];
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
  nextKind: "iqamah" | "adhan";
  minutesUntil: number | null;
  verification: "none" | "partial" | "verified" | "needs_check";
  changeReported: boolean;
  verifiers: number;
  tag: string | null;
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
  turnstileSiteKey,
  sort = "distance",
  verifiedOnly = false,
  community = false,
  needs = [],
  amenities = false,
}: {
  places: ExplorePlace[];
  where: string;
  lat: number;
  lng: number;
  zoom: number;
  kind: PlaceKindFilter;
  subline: string;
  showGeoPrompt: boolean;
  turnstileSiteKey?: string;
  sort?: ExploreSort;
  verifiedOnly?: boolean;
  community?: boolean;
  needs?: NeedSlug[];
  amenities?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(where);
  const queryRef = useRef(where);
  const [suggestions, setSuggestions] = useState<Array<{ label: string; lat: number; lng: number }>>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState(false);
  const [searchAsMove, setSearchAsMove] = useState(true);
  const [challenge, setChallenge] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(where);
  }, [where]);

  const cards = useMemo(() => places, [places]);

  async function onType(value: string, token?: string) {
    queryRef.current = value;
    setQuery(value);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setChallenge(false);
      return;
    }
    const turnstile = token ? `&turnstile=${encodeURIComponent(token)}` : "";
    const response = await fetch(`/api/v1/geocode/autocomplete?q=${encodeURIComponent(value)}${turnstile}`);
    if (response.status === 403 && turnstileSiteKey) {
      const denied = (await response.json().catch(() => null)) as { challenge?: boolean } | null;
      if (denied?.challenge) {
        setChallenge(true);
        setSuggestions([]);
        return;
      }
    }
    if (!response.ok || queryRef.current !== value) return;
    const body = (await response.json()) as { suggestions: Array<{ label: string; lat: number; lng: number }> };
    if (queryRef.current !== value) return;
    setChallenge(false);
    setSuggestions(body.suggestions);
  }

  useEffect(() => {
    if (!challenge || !turnstileSiteKey || !widgetRef.current) return;
    const host = widgetRef.current;
    let widgetId = "";
    let cancelled = false;
    const turnstileWindow = window as Window & {
      turnstile?: {
        render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
        remove: (id: string) => void;
      };
    };
    const render = () => {
      if (cancelled || !turnstileWindow.turnstile) return;
      widgetId = turnstileWindow.turnstile.render(host, {
        sitekey: turnstileSiteKey,
        callback: (token) => {
          setChallenge(false);
          void onType(queryRef.current, token);
        },
      });
    };
    if (turnstileWindow.turnstile) {
      render();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.turnstile = "mosques";
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetId) turnstileWindow.turnstile?.remove(widgetId);
    };
  }, [challenge, turnstileSiteKey]);

  function withFilters(params: URLSearchParams, overrides: { sort?: ExploreSort; verified?: boolean; needs?: NeedSlug[] } = {}) {
    const nextSort = overrides.sort ?? sort;
    const nextVerified = overrides.verified ?? verifiedOnly;
    const nextNeeds = overrides.needs ?? needs;
    if (nextSort !== "distance") params.set("sort", nextSort);
    if (nextVerified) params.set("verified", "1");
    if (nextNeeds.length) params.set("needs", nextNeeds.join(","));
    return params;
  }

  function applyFilters(next: { kind: PlaceKindFilter; needs: NeedSlug[]; verified: boolean }) {
    const params = new URLSearchParams({ where, lat: String(lat), lng: String(lng), z: String(zoom) });
    if (next.kind !== "all") params.set("kind", next.kind);
    withFilters(params, { verified: next.verified, needs: next.needs });
    if (!next.verified) params.delete("verified");
    if (!next.needs.length) params.delete("needs");
    for (const need of next.needs.filter((item) => !needs.includes(item))) track("filter_applied", { amenity: need });
    track("search", { has_where: Boolean(where), filters: [next.kind, ...next.needs].join(",") });
    router.push(`/search?${params.toString()}`);
  }

  function toggleNeed(slug: NeedSlug) {
    applyFilters({ kind, verified: verifiedOnly, needs: needs.includes(slug) ? needs.filter((item) => item !== slug) : [...needs, slug] });
  }

  function currentParams() {
    const params = new URLSearchParams({ where, lat: String(lat), lng: String(lng), z: String(zoom) });
    if (kind !== "all") params.set("kind", kind);
    return params;
  }

  function goTo(next: { label: string; lat: number; lng: number }) {
    const params = new URLSearchParams({
      where: next.label,
      lat: String(next.lat),
      lng: String(next.lng),
      z: "12",
    });
    if (kind !== "all") params.set("kind", kind);
    withFilters(params);
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
    withFilters(params);
    track("search", { has_where: Boolean(where), filters: next });
    router.push(`/search?${params.toString()}`);
  }

  function setVerified(next: boolean) {
    const params = withFilters(currentParams(), { verified: next });
    if (!next) params.delete("verified");
    track("search", { has_where: Boolean(where), filters: next ? "verified" : kind });
    router.push(`/search?${params.toString()}`);
  }

  function setSort(next: ExploreSort) {
    const params = withFilters(currentParams(), { sort: next });
    if (next === "distance") params.delete("sort");
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
              {challenge ? (
                <div ref={widgetRef} className="px-3 pb-2" />
              ) : null}
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
            {community ? (
              <FilterChip active={verifiedOnly} onClick={() => setVerified(!verifiedOnly)} icon={<ShieldCheck className="size-4" />}>
                Has verified times
              </FilterChip>
            ) : null}
            {amenities
              ? CATEGORY_NEEDS.map((slug) => {
                  const filter = NEED_FILTERS.find((item) => item.slug === slug);
                  return filter ? (
                    <FilterChip key={slug} active={needs.includes(slug)} onClick={() => toggleNeed(slug)} icon={<NeedIcon slug={slug} />}>
                      {filter.label}
                    </FilterChip>
                  ) : null;
                })
              : null}
            {amenities ? (
              <FiltersDialog
                kind={kind}
                needs={needs}
                verified={verifiedOnly}
                community={community}
                bboxQuery={`lat=${lat}&lng=${lng}&z=${zoom}`}
                onApply={applyFilters}
              />
            ) : null}
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
            {community ? (
              <label className="flex items-center gap-2 text-sm font-semibold">
                <span className="sr-only sm:not-sr-only">Sort</span>
                <select
                  aria-label="Sort"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as ExploreSort)}
                  className="h-10 rounded-full border border-border bg-card px-3"
                >
                  <option value="iqamah">Soonest iqamah</option>
                  <option value="distance">Distance</option>
                  <option value="verified">Most verified</option>
                </select>
              </label>
            ) : (
              <p className="text-sm font-semibold">Distance</p>
            )}
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
              {amenities ? (
                <>
                  {" "}or{" "}
                  <Link href={`/add?lat=${lat}&lng=${lng}`} className="font-semibold text-primary">
                    add a place here
                  </Link>
                </>
              ) : null}
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
                      <CardChip place={place} />
                    </div>
                    <div className="space-y-1 p-3">
                      <h2 className="font-bold">
                        {place.name}
                        {place.verifiers > 0 ? (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-xs font-semibold text-muted-foreground">
                            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                            <span className="sr-only">confirmed by</span>
                            {place.verifiers}
                          </span>
                        ) : null}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {place.locality}
                        {place.distanceKm !== null ? ` · ${formatDistance(place.distanceKm)}` : ""}
                      </p>
                      <p className="text-sm">
                        <span className="tabular text-base font-extrabold">
                          {place.nextLabel} {place.nextTime}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {place.nextKind === "iqamah" ? "iqamah" : "· adhan"}
                          {place.tag ? ` · ${place.tag}` : ""}
                        </span>
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
              withFilters(params);
              router.replace(`/search?${params.toString()}`);
            }}
          />
        </aside>
      </div>
      {mapMode ? (
        <div
          className="fixed inset-x-0 bottom-0 z-20 rounded-t-3xl bg-background pt-2 pb-20 shadow-[0_-6px_24px_rgba(0,0,0,0.12)] lg:hidden"
          data-testid="map-sheet"
        >
          <span className="mx-auto block h-[5px] w-10 rounded-full bg-border" aria-hidden="true" />
          <p className="px-4 pt-2 text-sm font-bold">
            {cards.length} {cards.length === 1 ? "place" : "places"} on the map
          </p>
          <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-3 pb-1">
            {cards.slice(0, 30).map((place) => (
              <li key={place.id} className="w-64 shrink-0 snap-start">
                <Link href={`/m/${place.slug}`} className="flex items-center gap-3 rounded-2xl border border-input p-2.5">
                  <span className="size-12 shrink-0 rounded-xl" style={{ background: place.tint }} aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-bold">{place.name}</span>
                    <span className="tabular text-xs">
                      <strong>
                        {place.nextLabel} {place.nextTime}
                      </strong>{" "}
                      <span className="text-muted-foreground">{place.nextKind}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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

function CardChip({ place }: { place: ExplorePlace }) {
  if (place.changeReported) {
    return (
      <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-background/95 px-2 py-1 text-[11px] font-bold text-warning shadow-sm">
        <CircleAlert className="size-3.5" aria-hidden="true" /> Change reported
      </span>
    );
  }
  if (place.verification === "verified") {
    return (
      <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-background/95 px-2 py-1 text-[11px] font-bold text-primary shadow-sm">
        <ShieldCheck className="size-3.5" aria-hidden="true" /> Community verified
      </span>
    );
  }
  return (
    <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2 py-1 text-[11px] font-bold">
      {place.nextKind === "iqamah" ? "Iqamah" : "Adhan"}
    </span>
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
        "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold",
        active ? "border-foreground bg-foreground text-background" : "border-border bg-card",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
