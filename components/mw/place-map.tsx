"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibre-worker";
import { LoaderCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import type { Bbox } from "@/lib/geo/distance";
import { viewNeedsSearch } from "@/lib/places/map-view";
import { cn } from "@/lib/utils";
import type { ExplorePlace } from "./explore-view";

export type MapArea = { bbox: Bbox; lat: number; lng: number; zoom: number };

export function PlaceMap({
  places,
  lat,
  lng,
  zoom,
  searchedBbox,
  truncated,
  searching,
  activeId,
  onSearchArea,
}: {
  places: ExplorePlace[];
  lat: number;
  lng: number;
  zoom: number;
  /** The area the listed places were loaded for. */
  searchedBbox: Bbox;
  /** More places matched than were sent, so a move inside the searched area can still reveal new ones. */
  truncated: boolean;
  searching: boolean;
  activeId: string | null;
  onSearchArea: (area: MapArea) => void;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapRef>(null);
  // Set while the map moves because the URL changed (search, back/forward), so that move doesn't offer a search.
  const programmatic = useRef(false);
  const [pending, setPending] = useState<MapArea | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const marker of root.querySelectorAll<HTMLElement>(".maplibregl-marker")) {
      const pin = marker.querySelector<HTMLElement>("[data-pin]");
      const place = places.find((item) => item.id === pin?.dataset.pin);
      if (!place) continue;
      marker.setAttribute(
        "aria-label",
        `${place.name}, ${place.nextLabel} ${place.nextKind === "iqamah" ? "iqamah" : "adhan"} ${place.nextTime}${place.changeReported ? ", change reported" : ""}`,
      );
    }
  }, [places, activeId]);

  // The map stays mounted across searches. It only moves itself when the URL points somewhere the map
  // isn't already looking (a typed search, "Near me", back/forward); "Search this area" keeps it still.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const centre = map.getCenter();
    if (Math.abs(centre.lat - lat) < 1e-4 && Math.abs(centre.lng - lng) < 1e-4 && Math.abs(map.getZoom() - zoom) < 0.01) return;
    programmatic.current = true;
    const near = Math.abs(centre.lat - lat) < 1 && Math.abs(centre.lng - lng) < 1;
    if (near) map.easeTo({ center: [lng, lat], zoom, duration: 600 });
    else map.jumpTo({ center: [lng, lat], zoom });
  }, [lat, lng, zoom]);

  // A finished search answers the pending area.
  useEffect(() => {
    setPending(null);
  }, [searchedBbox.west, searchedBbox.south, searchedBbox.east, searchedBbox.north]);

  return (
    <div ref={rootRef} className="sticky top-20 h-[calc(100vh-5rem)]" data-testid="place-map">
      <Map
        ref={mapRef}
        initialViewState={{ latitude: lat, longitude: lng, zoom }}
        mapStyle="/map/liberty.json"
        onMoveEnd={(event) => {
          if (programmatic.current) {
            programmatic.current = false;
            return;
          }
          const bounds = event.target.getBounds();
          const centre = event.target.getCenter();
          const bbox = { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() };
          setPending(viewNeedsSearch(bbox, searchedBbox, truncated) ? { bbox, lat: centre.lat, lng: centre.lng, zoom: event.target.getZoom() } : null);
        }}
      >
        <NavigationControl position="top-right" />
        {places.map((place) => (
          <Marker
            key={place.id}
            latitude={place.lat}
            longitude={place.lng}
            anchor="bottom"
            onClick={() => router.push(`/m/${place.slug}`)}
          >
            <span
              data-pin={place.id}
              data-active={activeId === place.id ? "true" : "false"}
              className={cn(
                "tabular block rounded-full bg-background px-2 py-1 text-xs font-extrabold shadow-md",
                activeId === place.id && "bg-secondary text-secondary-foreground",
              )}
            >
              {place.nextLabel} {place.nextTime}
              {place.changeReported ? (
                <span className="ml-1 inline-block size-2 rounded-full bg-warning align-middle" aria-hidden="true" />
              ) : null}
            </span>
          </Marker>
        ))}
      </Map>
      {pending || searching ? (
        <button
          type="button"
          disabled={searching}
          onClick={() => pending && onSearchArea(pending)}
          className="absolute top-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-bold text-background shadow-lg disabled:opacity-90"
          data-testid="search-area"
        >
          {searching ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
          {searching ? "Searching this area…" : "Search this area"}
        </button>
      ) : null}
    </div>
  );
}
