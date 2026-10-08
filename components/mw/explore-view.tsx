"use client";

import { List, LoaderCircle, LocateFixed, Map as MapIcon, Navigation, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { track } from "@/lib/analytics";
import type { Bbox } from "@/lib/geo/distance";
import { bboxParam } from "@/lib/places/map-view";
import type { PlaceKindFilter } from "@/lib/places/view";
import type { ExploreSort } from "@/lib/places/present";
import type { NeedSlug } from "@/lib/places/needs";
import { FiltersDialog } from "./filters-dialog";
import { cn } from "@/lib/utils";
import type { MapArea, UserPosition } from "./place-map";
import { PlaceRowContent, TimeSourceLegend } from "./place-row";
import type { AreaTimes } from "@/lib/places/area-times";

// MapLibre is heavy: it loads after the list, and on phones only once someone opens the map.
const PlaceMap = lazy(() => import("./place-map"));

type Suggestion = { label: string; lat: number | null; lng: number | null; placeId?: string; slug?: string; kind?: "city" | "mosque" | "place" };

/** Rows shown before "Show more"; the map pins every place loaded. */
const LIST_PAGE = 40;
/** The browser's own fix, kept for the tab so the blue dot survives navigation between searches. */
const POSITION_KEY = "mw:position";

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
  /** Whose time `next*` is: the mosque's own published timetable, the community's iqamah, or the calculated adhan. */
  timeSource: "mosque" | "community" | "calculated";
  /** The timetable provider ("Mawaqit") when timeSource is "mosque". */
  sourceLabel?: string | null;
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
  needs = [],
  fillBbox = null,
  areaTimes = null,
  nextPrayer = null,
  searchedBbox,
  mapArea = false,
  truncated = false,
  approxLocation = null,
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
  needs?: NeedSlug[];
  /** Set when this area has not been loaded from OpenStreetMap yet; the client asks the server to fill it. */
  fillBbox?: { west: number; south: number; east: number; north: number } | null;
  /** Calculated adhan for the area, shown while it has no places listed. */
  areaTimes?: AreaTimes | null;
  /** The next calculated adhan in this area, for the overline above the list. */
  nextPrayer?: { label: string; time: string } | null;
  /** The area the places were loaded for. */
  searchedBbox: Bbox;
  /** The searched area came from "Search this locality", so filter changes keep it. */
  mapArea?: boolean;
  /** More places matched than were loaded. */
  truncated?: boolean;
  /** Where the server thinks the visitor is (from their IP address), for the map's blue dot until the browser knows better. */
  approxLocation?: { lat: number; lng: number } | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(where);
  const queryRef = useRef(where);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [filling, setFilling] = useState<"idle" | "loading" | "error">(fillBbox ? "loading" : "idle");
  const [geoProblem, setGeoProblem] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState(false);
  const [shown, setShown] = useState(LIST_PAGE);
  const [searchingArea, startAreaSearch] = useTransition();
  const [fillAttempt, setFillAttempt] = useState(0);
  const [challenge, setChallenge] = useState(false);
  const [locating, setLocating] = useState(false);
  const [precise, setPrecise] = useState<UserPosition | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const desktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    setQuery(where);
    setShown(LIST_PAGE);
    setSelectedId(null);
  }, [where, lat, lng]);

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(POSITION_KEY) ?? "null") as (UserPosition & { at: number }) | null;
      if (stored && Date.now() - stored.at < 30 * 60_000) setPrecise({ lat: stored.lat, lng: stored.lng, precise: true });
    } catch {
      // Storage blocked: the dot falls back to the approximate location.
    }
  }, []);
  const user: UserPosition | null = precise ?? (approxLocation ? { ...approxLocation, precise: false } : null);

  const fillKey = fillBbox ? `${fillBbox.west},${fillBbox.south},${fillBbox.east},${fillBbox.north}` : "";
  useEffect(() => {
    if (!fillKey) {
      setFilling("idle");
      return;
    }
    const controller = new AbortController();
    const [west = 0, south = 0, east = 0, north = 0] = fillKey.split(",").map(Number);
    setFilling("loading");
    (async () => {
      // Nearest cells first; each call fills up to two and says how many are left. Cells another visitor
      // is filling count as busy: wait for them, then look again. The page re-renders only when a call
      // brought new places (or another visitor's fill may have), never for a call that changed nothing.
      let changed = false;
      let failed = false;
      for (let round = 0; round < 12; round += 1) {
        const response = await fetch("/api/v1/places/fill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bbox: { west, south, east, north } }),
          signal: controller.signal,
        }).catch(() => null);
        if (controller.signal.aborted) return;
        const body = response?.ok ? ((await response.json().catch(() => null)) as { ok: boolean; inserted: number; remaining: number; busy?: boolean } | null) : null;
        if (controller.signal.aborted) return;
        if (!body) {
          if (changed) router.refresh();
          setFilling("error");
          return;
        }
        failed ||= !body.ok;
        if (body.inserted > 0) {
          // Show the nearest mosques as soon as they land; later rounds add the rest.
          router.refresh();
          changed = false;
        }
        if (body.remaining > 0) continue;
        if (!body.busy) {
          if (changed) router.refresh();
          setFilling(failed ? "error" : "idle");
          return;
        }
        changed = true;
        await new Promise((resolve) => setTimeout(resolve, 2500));
        if (controller.signal.aborted) return;
      }
      if (changed) router.refresh();
      setFilling("idle");
    })();
    return () => controller.abort();
  }, [fillKey, fillAttempt, router]);

  /** Asks the browser where the visitor is; `search` also lists the mosques around them. */
  function locate(search = true) {
    if (!("geolocation" in navigator)) {
      setGeoProblem("Your browser can't share its location. Search for your area instead.");
      return;
    }
    setGeoProblem(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        track("geolocation_granted", {});
        const here = { lat: position.coords.latitude, lng: position.coords.longitude, precise: true };
        setPrecise(here);
        try {
          sessionStorage.setItem(POSITION_KEY, JSON.stringify({ ...here, at: Date.now() }));
        } catch {
          // Storage blocked: the dot just won't survive the next navigation.
        }
        if (search) goTo({ label: "Near you", lat: here.lat, lng: here.lng, zoom: 14 });
      },
      (error) => {
        setLocating(false);
        setGeoProblem(
          error.code === error.PERMISSION_DENIED
            ? "Location is turned off for this site. Allow it in your browser settings, or search for your area."
            : "We couldn't find your location just now. Try again, or search for your area.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  // The server already centred the page on the visitor's approximate location (from their IP address).
  // Someone who already allowed location gets their precise position straight away; "prompt" keeps the
  // banner, because asking unprompted on page load is rude; "denied" hides it.
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
    // The map's centre biases mosque results towards what the visitor is looking at.
    const near = `&lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}`;
    const response = await fetch(`/api/v1/geocode/autocomplete?q=${encodeURIComponent(value)}${near}${turnstile}`).catch(() => null);
    if (!response) return;
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

  /** The current view's params; a map-searched area keeps its bbox so filters apply to what's on the map. */
  function viewParams(nextKind: PlaceKindFilter = kind) {
    const params = new URLSearchParams({ where, lat: String(lat), lng: String(lng), z: String(zoom) });
    if (mapArea) params.set("bbox", bboxParam(searchedBbox));
    if (nextKind !== "all") params.set("kind", nextKind);
    return params;
  }

  function applyFilters(next: { kind: PlaceKindFilter; needs: NeedSlug[]; verified: boolean }) {
    const params = viewParams(next.kind);
    withFilters(params, { verified: next.verified, needs: next.needs });
    if (!next.verified) params.delete("verified");
    if (!next.needs.length) params.delete("needs");
    for (const need of next.needs.filter((item) => !needs.includes(item))) track("filter_applied", { amenity: need });
    track("search", { has_where: Boolean(where), filters: [next.kind, ...next.needs].join(",") });
    router.push(`/search?${params.toString()}`, { scroll: false });
  }

  async function choose(item: Suggestion) {
    setSuggestions([]);
    if (item.slug) {
      router.push(`/m/${item.slug}`);
      return;
    }
    // A mosque on OpenStreetMap we don't list yet: open the map right on it, which loads its area.
    const close = item.kind === "mosque" ? 16 : 12;
    if (item.lat != null && item.lng != null) {
      goTo({ label: item.label, lat: item.lat, lng: item.lng, zoom: close });
      return;
    }
    const lookup = item.placeId ? `placeId=${encodeURIComponent(item.placeId)}` : `q=${encodeURIComponent(item.label)}`;
    const details = (await fetch(`/api/v1/geocode/details?${lookup}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)) as { lat: number | null; lng: number | null } | null;
    if (details?.lat != null && details.lng != null) goTo({ label: item.label, lat: details.lat, lng: details.lng, zoom: close });
  }

  function goTo(next: { label: string; lat: number; lng: number; zoom?: number }) {
    const params = new URLSearchParams({
      where: next.label,
      lat: next.lat.toFixed(5),
      lng: next.lng.toFixed(5),
      z: String(next.zoom ?? 12),
    });
    if (kind !== "all") params.set("kind", kind);
    withFilters(params);
    track("search", { has_where: true, filters: kind });
    router.push(`/search?${params.toString()}`, { scroll: false });
    setSuggestions([]);
  }

  function setKind(next: PlaceKindFilter) {
    const params = withFilters(viewParams(next));
    track("search", { has_where: Boolean(where), filters: next });
    router.push(`/search?${params.toString()}`, { scroll: false });
  }

  function setVerified(next: boolean) {
    const params = withFilters(viewParams(), { verified: next });
    if (!next) params.delete("verified");
    track("search", { has_where: Boolean(where), filters: next ? "verified" : kind });
    router.push(`/search?${params.toString()}`, { scroll: false });
  }

  function setSort(next: ExploreSort) {
    const params = withFilters(viewParams(), { sort: next });
    if (next === "distance") params.delete("sort");
    router.push(`/search?${params.toString()}`, { scroll: false });
  }

  function searchArea(area: MapArea) {
    track("map_moved", {});
    const params = new URLSearchParams({
      // The old label ("London") would be wrong once the map has moved elsewhere.
      where: "Map area",
      lat: area.lat.toFixed(5),
      lng: area.lng.toFixed(5),
      z: String(Math.round(area.zoom * 100) / 100),
      bbox: bboxParam(area.bbox),
    });
    if (kind !== "all") params.set("kind", kind);
    withFilters(params);
    startAreaSearch(() => router.replace(`/search?${params.toString()}`, { scroll: false }));
  }

  const withTimes = places.filter((place) => place.timeSource !== "calculated").length;
  const listed = places.slice(0, shown);
  const showMap = desktop || mapMode;

  return (
    // data-filling lets E2E wait for an area fill to finish: its router.refresh() would otherwise undo a filter click.
    // On wide screens the explore view is one screen tall: the list scrolls beside a map that fills the rest.
    <div
      data-filling={filling}
      className={cn("flex flex-col lg:h-[calc(100dvh-81px)]", mapMode && "h-[calc(100dvh-65px)] overflow-hidden lg:overflow-visible")}
    >
      <div className="shrink-0 border-b border-border bg-background">
        <div className="mx-auto max-w-[1440px] px-4 py-3 lg:px-6">
          <form
            className="mx-auto flex max-w-3xl items-center gap-2 rounded-full border border-border bg-card p-1.5 shadow-[0_3px_12px_rgba(31,29,26,.08)]"
            onSubmit={(event) => {
              event.preventDefault();
              const first = suggestions[0];
              if (first) void choose(first);
              else if (query.trim().length >= 2) router.push(`/search?where=${encodeURIComponent(query.trim())}`);
            }}
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search for a masjid or an area</span>
              <input
                aria-label="Where"
                value={query}
                onChange={(event) => onInput(event.target.value)}
                onFocus={(event) => {
                  // Deferred, or the click's mouseup drops the selection: typing then replaces "Near you".
                  const input = event.currentTarget;
                  requestAnimationFrame(() => input.select());
                }}
                className="h-11 w-full bg-transparent px-4 text-[15px] outline-none"
                placeholder="Search a masjid, area or city"
                autoComplete="off"
              />
              {challenge ? <div ref={widgetRef} className="px-3 pb-2" /> : null}
              {suggestions.length > 0 ? (
                <ul className="absolute top-full right-0 left-0 z-40 mt-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-lg" data-testid="suggestions">
                  {suggestions.map((item) => (
                    <li key={`${item.label}-${item.lat}-${item.slug ?? ""}`}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-sm hover:bg-muted"
                        onClick={() => void choose(item)}
                      >
                        <span className="min-w-0 truncate">{item.label}</span>
                        {item.slug || item.kind === "mosque" ? <span className="shrink-0 text-xs font-semibold text-primary">Masjid</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
            <button
              type="button"
              onClick={() => locate()}
              className="hidden h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-3.5 text-sm font-bold text-primary sm:inline-flex"
            >
              {locating ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Navigation className="size-4" aria-hidden="true" />} Near me
            </button>
            <button type="submit" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Search">
              <Search className="size-5" />
            </button>
          </form>
          <div className="mx-auto mt-3 flex max-w-3xl gap-2 overflow-x-auto pb-0.5">
            <FilterChip active={verifiedOnly} onClick={() => setVerified(!verifiedOnly)} icon={<ShieldCheck className="size-4" />}>
              Has prayer times
            </FilterChip>
            <FilterChip active={kind === "prayer_room"} onClick={() => setKind(kind === "prayer_room" ? "all" : "prayer_room")}>
              Prayer rooms
            </FilterChip>
            <FiltersDialog kind={kind} needs={needs} verified={verifiedOnly} bboxQuery={`lat=${lat}&lng=${lng}&z=${zoom}`} onApply={applyFilters} />
          </div>
        </div>
      </div>
      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <section className={cn("min-w-0 px-4 pt-5 pb-24 lg:overflow-y-auto lg:px-6 lg:pb-6", mapMode && "hidden lg:block")} data-testid="place-list">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              {nextPrayer ? (
                <p className="text-xs font-extrabold tracking-wide text-primary uppercase" data-testid="next-prayer">
                  Next prayer · {nextPrayer.label} adhan {nextPrayer.time}
                </p>
              ) : null}
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                {places.length}
                {truncated ? "+" : ""} {places.length === 1 ? "place" : "mosques & prayer spaces"} nearby
              </h1>
              <p className="truncate text-sm text-muted-foreground">{subline}</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <span className="sr-only">Sort</span>
              <select
                aria-label="Sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as ExploreSort)}
                className="h-10 rounded-full border border-border bg-card px-3"
              >
                <option value="distance">Nearest</option>
                <option value="iqamah">Soonest iqamah</option>
                <option value="verified">Has prayer times</option>
              </select>
            </label>
          </div>
          {places.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <TimeSourceLegend />
              <span className="text-[11px] font-semibold text-muted-foreground" data-testid="with-times">
                {withTimes} with jamā&apos;ah times
              </span>
            </div>
          ) : null}
          {showGeoPrompt && geoPermission !== "denied" && !precise ? (
            <button type="button" className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-primary-soft px-4 py-3 text-start text-sm" onClick={() => locate()}>
              <LocateFixed className="size-4 shrink-0 text-primary" />
              Showing mosques around your approximate location. Use your exact location for a closer list.
            </button>
          ) : null}
          {geoProblem ? (
            <p role="status" className="mb-4 rounded-2xl bg-muted px-4 py-3 text-sm">
              {geoProblem}
            </p>
          ) : null}
          {filling === "loading" && places.length > 0 ? (
            <p role="status" className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Loading more mosques in this area…
            </p>
          ) : null}
          {places.length === 0 && areaTimes ? (
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
          {places.length === 0 && filling === "loading" ? (
            <div role="status" className="flex items-center gap-3 rounded-2xl bg-muted p-6 text-sm" data-testid="area-filling">
              <LoaderCircle className="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
              <span>Finding mosques and prayer spaces in this area. This takes a few seconds the first time anyone looks here.</span>
            </div>
          ) : places.length === 0 ? (
            <div className="rounded-2xl bg-muted p-6 text-sm">
              <p>
                {filling === "error" ? "We couldn't load this area just now." : "No mosques or prayer spaces are mapped here yet."} Know one?{" "}
                <Link href={`/add?lat=${lat}&lng=${lng}`} className="font-semibold text-primary">
                  Add it to the map
                </Link>{" "}
                and the community can fill in its times.
              </p>
              {filling === "error" ? (
                <button type="button" className="mt-3 font-semibold text-primary" onClick={() => setFillAttempt((value) => value + 1)}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <ul className="-mx-2 flex flex-col">
                {listed.map((place) => (
                  <li key={place.id}>
                    <Link
                      href={`/m/${place.slug}`}
                      data-place-card={place.id}
                      onMouseEnter={() => setHighlightId(place.id)}
                      onMouseLeave={() => setHighlightId(null)}
                      onFocus={() => setHighlightId(place.id)}
                      className={cn("flex min-w-0 items-center gap-3 rounded-2xl p-2 hover:bg-muted sm:gap-4 sm:p-2.5", highlightId === place.id && "bg-muted")}
                    >
                      <PlaceRowContent place={place} />
                    </Link>
                  </li>
                ))}
              </ul>
              {places.length > shown ? (
                <button type="button" onClick={() => setShown((value) => value + LIST_PAGE)} className="mt-3 h-11 w-full rounded-full border border-border text-sm font-semibold">
                  Show more ({places.length - shown})
                </button>
              ) : null}
            </>
          )}
        </section>
        <aside className={cn("relative min-h-0 min-w-0", mapMode ? "flex-1" : "hidden lg:block")} aria-label="Map">
          {showMap ? (
            <Suspense fallback={<div className="flex h-full min-h-[320px] items-center justify-center bg-muted text-sm text-muted-foreground">Loading map…</div>}>
              <PlaceMap
                places={places}
                lat={lat}
                lng={lng}
                zoom={zoom}
                searchedBbox={searchedBbox}
                searching={searchingArea}
                highlightId={highlightId}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onSearchArea={searchArea}
                user={user}
                onLocate={() => locate()}
                locating={locating}
              />
            </Suspense>
          ) : null}
        </aside>
      </div>
      <button
        type="button"
        className="fixed bottom-5 left-1/2 z-30 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-bold text-background shadow-lg lg:hidden"
        onClick={() => {
          setSelectedId(null);
          setMapMode((value) => !value);
        }}
        data-testid="view-toggle"
      >
        {mapMode ? <List className="size-4" aria-hidden="true" /> : <MapIcon className="size-4" aria-hidden="true" />}
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
      aria-pressed={active}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap",
        active ? "border-foreground bg-foreground text-background" : "border-border bg-card",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Whether a media query matches; false during server render and the first paint. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
