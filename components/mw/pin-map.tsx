"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibre-worker";
import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";

/** Map with one pin: draggable on the add form, fixed on the mosque page (loaded on demand). */
export default function PinMap({
  lat,
  lng,
  onChange,
  className = "h-72 rounded-2xl border border-border",
  zoom = 16,
}: {
  lat: number;
  lng: number;
  onChange?: (lat: number, lng: number) => void;
  className?: string;
  zoom?: number;
}) {
  return (
    <div className={`overflow-hidden ${className}`} data-testid="pin-map">
      <Map initialViewState={{ latitude: lat, longitude: lng, zoom }} mapStyle="/map/liberty.json" cooperativeGestures={!onChange}>
        <NavigationControl position="top-right" />
        <Marker
          latitude={lat}
          longitude={lng}
          anchor="bottom"
          draggable={Boolean(onChange)}
          onDragEnd={(event) => onChange?.(Number(event.lngLat.lat.toFixed(7)), Number(event.lngLat.lng.toFixed(7)))}
        >
          <span role="img" aria-label={onChange ? "Place location, draggable" : "Place location"} className="block size-9 rounded-full border-4 border-white bg-primary shadow-lg" />
        </Marker>
      </Map>
    </div>
  );
}
