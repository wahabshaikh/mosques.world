"use client";

import { LoaderCircle, LocateFixed, Navigation, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import type { PlaceKindFilter } from "@/lib/places/view";
import type { ExploreSort } from "@/lib/places/present";
import { NEED_FILTERS, type NeedSlug } from "@/lib/places/needs";
import { FiltersDialog, NeedIcon } from "./filters-dialog";

const CATEGORY_NEEDS: NeedSlug[] = ["women_section", "wudhu", "step_free", "parking", "open_for_fajr", "classes"];
import { cn } from "@/lib/utils";
import { PlaceMap } from "./place-map";
import { PlaceRowContent } from "./place-row";
import type { AreaTimes } from "@/lib/places/area-times";

type Suggestion = { label: string; lat: number | null; lng: number | null; placeId?: string; slug?: string };

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
  monogram: string;
  /** A free-licence photo (Wikimedia Commons) when the place has no community photo yet. */
  photo?: string | null;
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
  fillBbox = null,
  osm = false,
  areaTimes = null,
  nextPrayer = null,
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
  /** Set when this area has not been loaded from OpenStreetMap yet; the client asks the server to fill it. */
  fillBbox?: { west: number; south: number; east: number; north: number } | null;
  osm?: boolean;
  /** Calculated adhan for the area, shown while it has no places listed. */
  areaTimes?: AreaTimes | null;
  /** The next calculated adhan in this area, for the overline above the list. */
  nextPrayer?: { label: string; time: string } | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(where);
  const queryRef = useRef(where);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [filling, setFilling] = useState<"idle" | "loading" | "error">(fillBbox ? "loading" : "idle");
  const [geoProblem, setGeoProblem] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState(false);
  const [searchAsMove, setSearchAsMove] = useState(true);
  const [challenge, setChallenge] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(where);
  }, [where]);

  const cards = useMemo(() => places, [places]);

  const fillKey = fillBbox ? `${fillBbox.west},${fillBbox.south},${fillBbox.east},${fillBbox.north}` : "";
  useEffect(() => {
    if (!fillKey) {
      setFilling("idle");
      return;
    }
    let cancelled = false;
    const [west = 0, south = 0, east = 0, north = 0] = fillKey.split(",").map(Number);
    setFilling("loading");
    (async () => {
      // Nearest cells first; each call fills up to two and says how many are left. Cells another visitor
      // is filling count as busy: wait for them, then look again.
      for (let round = 0; round < 12 && !cancelled; round += 1) {
        const response = await fetch("/api/v1/places/fill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bbox: { west, south, east, north } }),
        }).catch(() => null);
        if (cancelled) return;
        const body = response?.ok ? ((await response.json().catch(() => null)) as { ok: boolean; inserted: number; remaining: number; busy?: boolean } | null) : null;
        if (!body) {
          setFilling("error");
          return;
        }
        if (body.inserted > 0) router.refresh();
        if (body.remaining === 0 && body.busy) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          continue;
        }
        if (body.remaining === 0) {
          if (!cancelled) {
            router.refresh();
            setFilling(body.ok ? "idle" : "error");
          }
          return;
        }
      }
      if (!cancelled) {
        router.refresh();
        setFilling("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fillKey, router]);

  function locate() {
    if (!("geolocation" in navigator)) {
      setGeoProblem("Your browser can't share its location. Search for your city instead.");
      return;
    }
    setGeoProblem(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        track("geolocation_granted", {});
        goTo({ label: "Near you", lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) =>
        setGeoProblem(
          error.code === error.PERMISSION_DENIED
            ? "Location is turned off for this site. Allow it in your browser settings, or search for your city."
            : "We couldn't find your location just now. Try again, or search for your city.",
        ),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  // Someone who already allowed location shouldn't be asked again on every visit: use it straight away.
  // Denied hides the prompt; "prompt" keeps it, because asking unprompted on page load is rude.
  const [geoPermission, setGeoPermission] = useState<"unknown" | "prompt" | "denied">("unknown");
  useEffect(() => {
    if (!showGeoPrompt || !navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled) return;
        if (status.state === "granted") locate();
        else setGeoPermission(status.state === "denied" ? "denied" : "prompt");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Once per page: locate() navigates, and the new URL carries coordinates so showGeoPrompt turns off.
  }, [showGeoPrompt]);

  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onInput(value: string) {
    queryRef.current = value;
    setQuery(value);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    // One lookup per pause in typing, not per keystroke (each counts toward the per-IP search budget).
    typingTimer.current = setTimeout(() => void onType(value), 250);
  }

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
    const body = (await response.json()) as { suggestions: Suggestion[] };
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

  async function choose(item: Suggestion) {
    setSuggestions([]);
    if (item.slug) {
      router.push(`/m/${item.slug}`);
      return;
    }
    if (item.lat != null && item.lng != null) {
      goTo({ label: item.label, lat: item.lat, lng: item.lng });
      return;
    }
    // Google suggestions carry only a place id; resolve it before moving the map.
    const query = item.placeId ? `placeId=${encodeURIComponent(item.placeId)}` : `q=${encodeURIComponent(item.label)}`;
    const details = (await fetch(`/api/v1/geocode/details?${query}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)) as { lat: number | null; lng: number | null } | null;
    if (details?.lat != null && details.lng != null) goTo({ label: item.label, lat: details.lat, lng: details.lng });
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
              if (first) void choose(first);
              else if (query.trim().length >= 2) router.push(`/search?where=${encodeURIComponent(query.trim())}`);
            }}
          >
            <label className="relative min-w-0 flex-1">
              <span className="px-3 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Where</span>
              <input
                aria-label="Where"
                value={query}
                onChange={(event) => onInput(event.target.value)}
                onFocus={(event) => {
                  // Deferred, or the click's mouseup drops the selection: typing then replaces "Near you".
                  const input = event.currentTarget;
                  requestAnimationFrame(() => input.select());
                }}
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
                    <li key={`${item.label}-${item.lat}-${item.slug ?? ""}`}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-sm hover:bg-muted"
                        onClick={() => void choose(item)}
                      >
                        <span>{item.label}</span>
                        {item.slug ? <span className="shrink-0 text-xs text-muted-foreground">Mosque</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
            <button
              type="button"
              onClick={locate}
              className="hidden h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-3.5 text-sm font-bold text-primary sm:inline-flex"
            >
              <Navigation className="size-4" aria-hidden="true" /> Near me
            </button>
            <button
              type="submit"
              className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
              aria-label="Search"
            >
              <Search className="size-5" />
            </button>
          </form>
          <div className="mt-4 flex gap-2 overflow-x-auto">
            <FilterChip active={kind === "prayer_room"} onClick={() => setKind(kind === "prayer_room" ? "all" : "prayer_room")}>
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
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(0,680px)_1fr]">
        <section className={cn("px-4 pt-6 pb-24 lg:px-6 lg:pb-6", mapMode && "hidden lg:block")}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              {nextPrayer ? (
                <p className="text-xs font-extrabold tracking-wide text-primary uppercase" data-testid="next-prayer">
                  Next prayer · {nextPrayer.label} adhan {nextPrayer.time}
                </p>
              ) : null}
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
          {showGeoPrompt && geoPermission !== "denied" ? (
            <button type="button" className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-primary-soft px-4 py-3 text-start text-sm" onClick={locate}>
              <LocateFixed className="size-4 text-primary" />
              Use your location for a closer list. We only use it to centre the map.
            </button>
          ) : null}
          {geoProblem ? (
            <p role="status" className="mb-4 rounded-2xl bg-muted px-4 py-3 text-sm">
              {geoProblem}
            </p>
          ) : null}
          {filling === "loading" && cards.length > 0 ? (
            <p role="status" className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Loading more mosques in this area…
            </p>
          ) : null}
          {cards.length === 0 && areaTimes ? (
            <section className="mb-4 rounded-2xl bg-muted p-4" aria-labelledby="area-times" data-testid="area-times">
              <h2 id="area-times" className="text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                Prayer times here today
              </h2>
              <ol className="mt-3 grid grid-cols-5 gap-1.5 text-center">
                {areaTimes.rows.map((row) => (
                  <li key={row.key} className={cn("rounded-xl px-1 py-2", row.next ? "bg-primary text-primary-foreground" : "bg-card")}>
                    <span className={cn("block text-xs", row.next ? "text-primary-foreground/80" : "text-muted-foreground")}>{row.label}</span>
                    <span className="tabular block text-xs font-extrabold whitespace-nowrap sm:text-sm">{row.time}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">Adhan, calculated ({areaTimes.method}). Each mosque&apos;s iqamah is on its page.</p>
            </section>
          ) : null}
          {cards.length === 0 && filling === "loading" ? (
            <div role="status" className="flex items-center gap-3 rounded-2xl bg-muted p-6 text-sm" data-testid="area-filling">
              <LoaderCircle className="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
              <span>Finding mosques and prayer spaces in this area. This takes a few seconds the first time anyone looks here.</span>
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-2xl bg-muted p-6 text-sm">
              <p>
                {filling === "error"
                  ? "We couldn't load this area just now."
                  : osm
                    ? "No mosques or prayer spaces are mapped here yet."
                    : "No places in this area yet."}{" "}
                {amenities ? (
                  <>
                    Know one?{" "}
                    <Link href={`/add?lat=${lat}&lng=${lng}`} className="font-semibold text-primary">
                      Add it to the map
                    </Link>{" "}
                    and the community can fill in its times.
                  </>
                ) : (
                  "Try zooming out or searching for a nearby city."
                )}
              </p>
              {filling === "error" ? (
                <button type="button" className="mt-3 font-semibold text-primary" onClick={() => router.refresh()}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {cards.map((place) => (
                <li key={place.id}>
                  <Link
                    href={`/m/${place.slug}`}
                    data-place-card={place.id}
                    onMouseEnter={() => setActiveId(place.id)}
                    onMouseLeave={() => setActiveId(null)}
                    onFocus={() => setActiveId(place.id)}
                    className={cn("flex items-center gap-4 rounded-2xl p-2.5 hover:bg-muted", activeId === place.id && "bg-muted ring-2 ring-primary")}
                  >
                    <PlaceRowContent place={place} />
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
        className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-secondary px-5 py-3 text-sm font-semibold text-secondary-foreground shadow-lg lg:hidden"
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
        "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold",
        active ? "border-foreground bg-foreground text-background" : "border-border bg-card",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
