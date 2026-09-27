"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";
import type { Bbox } from "@/lib/geo/distance";
import { cn } from "@/lib/utils";
import type { ExplorePlace } from "./explore-view";

export function PlaceMap({
  places,
  lat,
  lng,
  zoom,
  activeId,
  searchAsMove,
  onToggleSearchAsMove,
  onMove,
}: {
  places: ExplorePlace[];
  lat: number;
  lng: number;
  zoom: number;
  activeId: string | null;
  searchAsMove: boolean;
  onToggleSearchAsMove: () => void;
  onMove: (bbox: Bbox) => void;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={rootRef} className="sticky top-20 h-[calc(100vh-5rem)]" data-testid="place-map">
      <Map
        key={`${lat.toFixed(4)}:${lng.toFixed(4)}:${zoom}`}
        initialViewState={{ latitude: lat, longitude: lng, zoom }}
        mapStyle="/map/liberty.json"
        onMoveEnd={(event) => {
          const bounds = event.target.getBounds();
          onMove({
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          });
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
      <label className="absolute bottom-10 left-3 flex items-center gap-2 rounded-full bg-background px-3 py-2 text-xs font-semibold shadow-md">
        <input type="checkbox" checked={searchAsMove} onChange={onToggleSearchAsMove} />
        Search as I move the map
      </label>
    </div>
  );
}
