"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibre-worker";
import { LoaderCircle, LocateFixed, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import type { Bbox } from "@/lib/geo/distance";
import { formatDistance } from "@/lib/geo/distance";
import { cn } from "@/lib/utils";
import type { ExplorePlace } from "./explore-view";
import { CardStatus, PlaceThumb, TimeSourceLegend } from "./place-row";

export type MapArea = { bbox: Bbox; lat: number; lng: number; zoom: number };

/** Where the visitor is: `precise` from the browser, otherwise approximate (from their IP address, on the server). */
export type UserPosition = { lat: number; lng: number; precise: boolean };

export function PlaceMap({
  places,
  lat,
  lng,
  zoom,
  searchedBbox,
  searching,
  highlightId,
  selectedId,
  onSelect,
  onSearchArea,
  user,
  onLocate,
  locating,
}: {
  places: ExplorePlace[];
  lat: number;
  lng: number;
  zoom: number;
  /** The area the listed places were loaded for. */
  searchedBbox: Bbox;
  searching: boolean;
  /** Hovered in the list. */
  highlightId: string | null;
  /** Tapped on the map: shown in a card over the map. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSearchArea: (area: MapArea) => void;
  user: UserPosition | null;
  onLocate: () => void;
  locating: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapRef>(null);
  // Set when the visitor drags, pinches, scrolls or zooms; programmatic moves (a new search) never offer a search.
  const gesture = useRef(false);
  const [pending, setPending] = useState<MapArea | null>(null);

  // MapLibre only measures its container on window resize, so a map shown after being hidden (the mobile
  // List/Map switch) or a column that changes width would draw blank or stretched without this.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // The map stays mounted across searches. It only moves itself when the URL points somewhere the map
  // isn't already looking (a typed search, "Near me", back/forward); "Search this locality" keeps it still.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const centre = map.getCenter();
    if (Math.abs(centre.lat - lat) < 1e-4 && Math.abs(centre.lng - lng) < 1e-4 && Math.abs(map.getZoom() - zoom) < 0.01) return;
    gesture.current = false;
    const near = Math.abs(centre.lat - lat) < 1 && Math.abs(centre.lng - lng) < 1;
    if (near) map.easeTo({ center: [lng, lat], zoom, duration: 600 });
    else map.jumpTo({ center: [lng, lat], zoom });
  }, [lat, lng, zoom]);

  // A finished search answers the pending area.
  useEffect(() => {
    setPending(null);
  }, [searchedBbox.west, searchedBbox.south, searchedBbox.east, searchedBbox.north]);

  const selected = selectedId ? places.find((place) => place.id === selectedId) ?? null : null;
  // Calculated-only places first, so pins with real jamā'ah times are drawn on top of them.
  const ordered = [...places].sort((a, b) => weight(a) - weight(b));

  return (
    <div ref={rootRef} className="relative h-full min-h-[320px] w-full" data-testid="place-map">
      <Map
        ref={mapRef}
        initialViewState={{ latitude: lat, longitude: lng, zoom }}
        mapStyle="/map/liberty.json"
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
        onLoad={(event) => {
          // MapLibre opens the compact attribution on load; on a phone it would cover the bottom of the map.
          event.target.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        }}
        onMoveStart={(event) => {
          if ((event as { originalEvent?: unknown }).originalEvent) gesture.current = true;
        }}
        onMoveEnd={(event) => {
          if (!gesture.current) return;
          gesture.current = false;
          const bounds = event.target.getBounds();
          const centre = event.target.getCenter();
          setPending({
            bbox: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() },
            lat: centre.lat,
            lng: centre.lng,
            zoom: event.target.getZoom(),
          });
        }}
        onClick={() => onSelect(null)}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {user ? (
          <Marker latitude={user.lat} longitude={user.lng} anchor="center" style={{ zIndex: 1, pointerEvents: "none" }}>
            <span
              className="relative flex items-center justify-center"
              role="img"
              aria-label={user.precise ? "Your location" : "Your approximate location"}
              data-testid="user-location"
              data-precise={user.precise ? "true" : "false"}
            >
              {user.precise ? (
                <span className="absolute size-9 animate-ping rounded-full bg-[#1a73e8]/30 motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <span className="absolute size-20 rounded-full border border-[#1a73e8]/40 bg-[#1a73e8]/15" aria-hidden="true" />
              )}
              <span className="relative block size-[18px] rounded-full border-[3px] border-white bg-[#1a73e8] shadow-[0_1px_4px_rgba(0,0,0,.45)]" />
            </span>
          </Marker>
        ) : null}
        {ordered.map((place) => {
          const active = place.id === highlightId || place.id === selectedId;
          return (
            <Marker
              key={place.id}
              latitude={place.lat}
              longitude={place.lng}
              anchor={place.timeSource === "calculated" ? "center" : "bottom"}
              style={{ zIndex: active ? 3 : place.timeSource === "calculated" ? 0 : 2 }}
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                onSelect(place.id);
              }}
            >
              <Pin place={place} active={active} />
            </Marker>
          );
        })}
      </Map>
      {pending || searching ? (
        <button
          type="button"
          disabled={searching}
          onClick={() => pending && onSearchArea(pending)}
          className="absolute top-3 left-1/2 z-10 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-bold whitespace-nowrap text-background shadow-lg disabled:opacity-90"
          data-testid="search-area"
        >
          {searching ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
          {searching ? "Searching this locality…" : "Search this locality"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onLocate}
        aria-label="Show my location"
        className="absolute top-[78px] right-[10px] z-10 inline-flex size-[29px] items-center justify-center rounded-[4px] bg-white text-[#1a73e8] shadow-[0_0_0_2px_rgba(0,0,0,.1)]"
        data-testid="locate-me"
      >
        {locating ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="size-4" aria-hidden="true" />}
      </button>
      <div className="pointer-events-none absolute bottom-8 left-2 z-10 hidden rounded-xl bg-background/90 px-3 py-2 shadow-md backdrop-blur lg:block">
        <TimeSourceLegend />
      </div>
      {selected ? (
        <div className="absolute inset-x-3 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-md rounded-3xl bg-background p-3 shadow-card lg:bottom-3" data-testid="map-card">
          <button type="button" onClick={() => onSelect(null)} aria-label="Close" className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-full hover:bg-muted">
            <X className="size-4" aria-hidden="true" />
          </button>
          <Link href={`/m/${selected.slug}`} className="flex items-center gap-3 pe-8">
            <PlaceThumb place={selected} />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-bold">{selected.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[selected.locality, selected.distanceKm !== null ? formatDistance(selected.distanceKm) : null].filter(Boolean).join(" · ")}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {selected.timeSource === "calculated" ? (
                  <span className="text-sm text-muted-foreground">No jamā&apos;ah times yet</span>
                ) : (
                  <span className="tabular text-sm font-extrabold">
                    {selected.nextLabel} {selected.nextTime}
                  </span>
                )}
                <CardStatus place={selected} />
              </span>
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function weight(place: ExplorePlace): number {
  return place.timeSource === "calculated" ? 0 : place.timeSource === "community" ? 1 : 2;
}

function pinLabel(place: ExplorePlace): string {
  if (place.timeSource === "calculated") return `${place.name}, no jamā'ah times yet`;
  const whose = place.timeSource === "mosque" ? "mosque timetable" : "community iqamah";
  return `${place.name}, ${place.nextLabel} ${place.nextKind} ${place.nextTime}, ${whose}${place.changeReported ? ", change reported" : ""}`;
}

/**
 * Pins say whose time it is at a glance: the mosque's own timetable is a solid green label, community
 * iqamah an outlined one, and a place with only the calculated adhan (the same for every place nearby)
 * a small dot, so the map isn't buried under identical times.
 */
function Pin({ place, active }: { place: ExplorePlace; active: boolean }) {
  if (place.timeSource === "calculated") {
    return (
      <button
        type="button"
        aria-label={pinLabel(place)}
        data-pin={place.id}
        data-time-source="calculated"
        data-active={active ? "true" : "false"}
        className={cn(
          "block rounded-full border-2 border-white bg-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,.4)] transition-transform",
          active ? "size-4 scale-125 bg-foreground" : "size-3.5",
        )}
      />
    );
  }
  const mosque = place.timeSource === "mosque";
  return (
    <button
      type="button"
      aria-label={pinLabel(place)}
      data-pin={place.id}
      data-time-source={place.timeSource}
      data-active={active ? "true" : "false"}
      className={cn(
        "tabular relative block rounded-full px-2.5 py-1 text-xs font-extrabold whitespace-nowrap shadow-float transition-transform",
        mosque ? "bg-primary text-primary-foreground" : "border border-black/10 bg-white text-[#222]",
        active && "z-10 scale-110 bg-foreground text-background ring-2 ring-background",
      )}
    >
      {place.nextLabel} {place.nextTime}
      {place.changeReported ? <span className="ms-1 inline-block size-2 rounded-full bg-warning align-middle" aria-hidden="true" /> : null}
    </button>
  );
}
export default PlaceMap;
