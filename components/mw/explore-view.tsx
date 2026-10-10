"use client";

import { List, LoaderCircle, LocateFixed, Map as MapIcon, Navigation, Search, Share2, ShieldCheck, Sparkles } from "lucide-react";
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
import { PlaceRowContent } from "./place-row";
import { RewardChip } from "./hasanat";
import { REWARD } from "@/lib/hasanat";
import { reminderFor, whatsappHref } from "@/lib/reminders";
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
  /** How the shown iqamah is set: "fixed" clock time, or minutes after the adhan; null without an iqamah. */
  iqamahRule?: "fixed" | number | null;
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
  const missing = places.filter((place) => place.timeSource === "calculated");
  const toConfirm = places.find((place) => place.timeSource === "community" && place.verification !== "verified");
  const listed = places.slice(0, shown);
  const showMap = desktop || mapMode;

  return (
    // data-filling lets E2E wait for an area fill to finish: its router.refresh() would otherwise undo a filter click.
    // On wide screens the explore view is one screen tall: the list scrolls beside a map that fills the rest.
    <div
      data-filling={filling}
      className={cn("flex flex-col lg:h-[calc(100dvh-81px)]", mapMode && "h-[calc(100dvh-57px)] overflow-hidden lg:overflow-visible")}
    >
      <div className="shrink-0 bg-background lg:border-b lg:border-border">
        <div className="mx-auto max-w-[1440px] px-4 pt-3 pb-2 lg:px-6 lg:py-3">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <form
              className="relative flex min-w-0 flex-1 items-center gap-1 rounded-full border border-border bg-card py-1 ps-4 pe-1 shadow-card"
              onSubmit={(event) => {
                event.preventDefault();
                const first = suggestions[0];
                if (first) void choose(first);
                else if (query.trim().length >= 2) router.push(`/search?where=${encodeURIComponent(query.trim())}`);
              }}
            >
              <Search className="size-5 shrink-0 text-foreground" aria-hidden="true" />
              <label className="min-w-0 flex-1">
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
                  className="h-11 w-full bg-transparent px-2 text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
                  placeholder="Search a masjid, area or city"
                  autoComplete="off"
                />
              </label>
              {challenge ? <div ref={widgetRef} className="px-3 pb-2" /> : null}
              {suggestions.length > 0 ? (
                <ul className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-card" data-testid="suggestions">
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
              <button
                type="button"
                onClick={() => locate()}
                aria-label="Near me"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                {locating ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Navigation className="size-[18px]" aria-hidden="true" />}
              </button>
            </form>
          </div>
          <div className="no-scrollbar mx-auto mt-3 flex max-w-3xl gap-2 overflow-x-auto pb-1">
            <FilterChip active={verifiedOnly} onClick={() => setVerified(!verifiedOnly)} icon={<ShieldCheck className="size-4" />}>
              Has jamā&apos;ah times
            </FilterChip>
            <FilterChip active={kind === "prayer_room"} onClick={() => setKind(kind === "prayer_room" ? "all" : "prayer_room")}>
              Prayer rooms
            </FilterChip>
            <FiltersDialog kind={kind} needs={needs} verified={verifiedOnly} bboxQuery={`lat=${lat}&lng=${lng}&z=${zoom}`} onApply={applyFilters} />
          </div>
        </div>
      </div>
      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <section className={cn("min-w-0 px-4 pt-2 pb-28 lg:overflow-y-auto lg:px-6 lg:pt-5 lg:pb-6", mapMode && "hidden lg:block")} data-testid="place-list">
          {areaTimes ? <AreaPrayerTimes times={areaTimes} where={where === "Map area" ? "this area" : where} /> : null}
          {showGeoPrompt && geoPermission !== "denied" && !precise ? (
            <button type="button" className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-start text-sm" onClick={() => locate()}>
              <LocateFixed className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="font-semibold">Use your exact location</span>
                <span className="block text-muted-foreground">We&apos;re showing masajid around your approximate area.</span>
              </span>
            </button>
          ) : null}
          {geoProblem ? (
            <p role="status" className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm">
              {geoProblem}
            </p>
          ) : null}
          {places.length > 0 ? <HelpNudge missing={missing} toConfirm={toConfirm ?? null} total={places.length} /> : null}
          <div className="mt-6 mb-1 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl leading-tight font-extrabold tracking-tight">
                {places.length}
                {truncated ? "+" : ""} {places.length === 1 ? "masjid" : "masajid"} nearby
              </h1>
              <p className="truncate text-sm text-muted-foreground" data-testid="with-times">
                {places.length > 0 ? `${withTimes} with jamā'ah times · ` : ""}
                {subline}
              </p>
            </div>
            <label className="shrink-0">
              <span className="sr-only">Sort</span>
              <select
                aria-label="Sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as ExploreSort)}
                className="h-10 rounded-full border border-border bg-card px-3 text-sm font-semibold"
              >
                <option value="distance">Nearest</option>
                <option value="iqamah">Soonest iqamah</option>
                <option value="verified">Has jamā&apos;ah times</option>
              </select>
            </label>
          </div>
          {filling === "loading" && places.length > 0 ? (
            <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Loading more masajid in this area…
            </p>
          ) : null}
          {places.length === 0 && filling === "loading" ? (
            <div role="status" className="mt-3 flex items-center gap-3 rounded-2xl bg-muted p-5 text-sm" data-testid="area-filling">
              <LoaderCircle className="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
              <span>Finding masajid and prayer spaces here. This takes a few seconds the first time anyone looks.</span>
            </div>
          ) : places.length === 0 ? (
            <div className="mt-3 rounded-3xl border border-dashed border-input p-6 text-center">
              <p className="font-bold">{filling === "error" ? "We couldn't load this area just now." : "No masajid mapped here yet"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Know one? Add it and the next traveller will find it.</p>
              <Link href={`/add?lat=${lat}&lng=${lng}`} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-secondary px-5 text-sm font-semibold text-secondary-foreground">
                Add a masjid <RewardChip points={REWARD.addPlace} className="bg-white/15 text-inherit" />
              </Link>
              {filling === "error" ? (
                <button type="button" className="mt-3 block w-full font-semibold text-primary" onClick={() => setFillAttempt((value) => value + 1)}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <ul className="-mx-2 mt-2 flex flex-col">
                {listed.map((place) => (
                  <li key={place.id}>
                    <Link
                      href={`/m/${place.slug}`}
                      data-place-card={place.id}
                      onMouseEnter={() => setHighlightId(place.id)}
                      onMouseLeave={() => setHighlightId(null)}
                      onFocus={() => setHighlightId(place.id)}
                      className={cn("flex min-w-0 items-center gap-3 rounded-2xl p-2 hover:bg-muted sm:gap-4", highlightId === place.id && "bg-muted")}
                    >
                      <PlaceRowContent place={place} />
                    </Link>
                  </li>
                ))}
              </ul>
              {places.length > shown ? (
                <button type="button" onClick={() => setShown((value) => value + LIST_PAGE)} className="mt-3 h-12 w-full rounded-xl border border-foreground text-sm font-semibold">
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
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex justify-center lg:hidden">
        <div className="pointer-events-auto inline-flex rounded-full bg-foreground p-1 shadow-card" role="group" aria-label="View">
          <button
            type="button"
            aria-pressed={!mapMode}
            onClick={() => {
              setSelectedId(null);
              setMapMode(false);
            }}
            className={cn("inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold", !mapMode ? "bg-background text-foreground" : "text-background")}
          >
            <List className="size-4" aria-hidden="true" /> List
          </button>
          <button
            type="button"
            aria-pressed={mapMode}
            data-testid="view-toggle"
            onClick={() => {
              setSelectedId(null);
              setMapMode((value) => !value);
            }}
            className={cn("inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold", mapMode ? "bg-background text-foreground" : "text-background")}
          >
            <MapIcon className="size-4" aria-hidden="true" /> Map
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Today's calculated prayer times for the area, kept apart from any masjid's own adhan and iqamah:
 * they tell you when each prayer's time begins here, not when a congregation prays.
 */
function AreaPrayerTimes({ times, where }: { times: AreaTimes; where: string }) {
  const nextPrayer = times.rows.find((row) => row.next);
  return (
    <section className="rounded-3xl bg-muted p-4" aria-labelledby="area-times" data-testid="area-times">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="area-times" className="truncate text-[15px] font-bold">
          Prayer times · {where}
        </h2>
        {nextPrayer ? (
          <p className="shrink-0 text-xs font-bold text-primary" data-testid="next-prayer">
            Next: {nextPrayer.label} {nextPrayer.time}
          </p>
        ) : null}
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1.5 text-center">
        {times.rows.map((row) => (
          <li key={row.key} className={cn("rounded-2xl px-0.5 py-2", row.next ? "bg-primary text-primary-foreground" : "bg-card")} aria-current={row.next ? "time" : undefined}>
            <span className={cn("block text-[11px] font-semibold", row.next ? "text-primary-foreground/85" : "text-muted-foreground")}>{row.label}</span>
            <span className="tabular block text-[13px] font-extrabold whitespace-nowrap sm:text-sm">{row.time.replace(/ [AP]M$/, "")}</span>
            <span className={cn("block text-[10px]", row.next ? "text-primary-foreground/85" : "text-muted-foreground")}>{row.time.slice(-2)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">Calculated start times ({times.method}). Each masjid&apos;s own adhan and iqamah are below.</p>
    </section>
  );
}

/**
 * The one ask on the page: add times where they're missing (worth the most to the next visitor), else
 * confirm unverified ones; then pass it on. Sadaqah jariyah framing, never a guilt trip.
 */
function HelpNudge({ missing, toConfirm, total }: { missing: ExplorePlace[]; toConfirm: ExplorePlace | null; total: number }) {
  const target = missing[0] ?? null;
  if (!target && !toConfirm) return null;
  const reminder = reminderFor(target ? "add" : "confirm", (target ?? toConfirm)?.id ?? "");
  const share = () => {
    const url = window.location.href;
    const text = `Help fill in the jamā'ah times for the masajid near us on mosques.world, so the next person knows when to pray: ${url}`;
    track("share_click", { surface: "explore_nudge" });
    if (navigator.share) void navigator.share({ text, url }).catch(() => undefined);
    else window.open(whatsappHref(text), "_blank", "noopener");
  };
  return (
    <section className="mt-4 rounded-3xl border border-border p-4" aria-labelledby="help-nudge" data-testid="help-nudge">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="help-nudge" className="font-bold">
            {target ? `${missing.length} of ${total} masajid here have no jamā'ah times` : "Help keep these times right"}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {target ? `Prayed at ${target.name}? Add its times so the next person can join the jamā'ah.` : `Been to ${toConfirm?.name} lately? Confirm its times in one tap.`}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground italic">
        “{reminder.text}” <span className="not-italic">— {reminder.source}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={target ? `/m/${target.slug}/update` : `/m/${toConfirm?.slug}#times`}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold text-secondary-foreground"
          onClick={() => track("nudge_clicked", { kind: target ? "add_times" : "confirm" })}
        >
          {target ? "Add times" : "Confirm times"}
          <span className="text-xs font-bold text-gold-soft">+{target ? REWARD.addTimes : REWARD.confirm}</span>
        </Link>
        <button type="button" onClick={share} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold">
          <Share2 className="size-4" aria-hidden="true" /> Ask a friend
        </button>
      </div>
    </section>
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
        active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground",
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
