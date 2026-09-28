"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";

/** Map with one draggable pin for the add form (loaded on demand). */
export default function PinMap({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  return (
    <div className="h-72 overflow-hidden rounded-2xl border border-border" data-testid="pin-map">
      <Map initialViewState={{ latitude: lat, longitude: lng, zoom: 16 }} mapStyle="/map/liberty.json">
        <NavigationControl position="top-right" />
        <Marker
          latitude={lat}
          longitude={lng}
          anchor="bottom"
          draggable
          onDragEnd={(event) => onChange(Number(event.lngLat.lat.toFixed(7)), Number(event.lngLat.lng.toFixed(7)))}
        >
          <span aria-label="Place location, draggable" className="block size-9 rounded-full border-4 border-white bg-primary shadow-lg" />
        </Marker>
      </Map>
    </div>
  );
}
