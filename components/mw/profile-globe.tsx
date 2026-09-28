"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo } from "react";
import Map, { AttributionControl, Layer, NavigationControl, Source, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { ProfilePin } from "@/lib/profile/read";

const GOLD = "#E9B949";

/**
 * Full-screen night globe of a person's check-ins (spec 3.6 profile map): no tiles, Natural Earth
 * land on the ocean colour, globe projection at low zoom, gold circles sized by visits.
 */
export function ProfileGlobe({ pins, embed }: { pins: ProfilePin[]; embed: boolean }) {
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: pins.map((pin) => ({
        type: "Feature" as const,
        properties: { slug: pin.slug, name: pin.name, count: pin.count },
        geometry: { type: "Point" as const, coordinates: [pin.lng, pin.lat] },
      })),
    }),
    [pins],
  );
  const center = useMemo(() => {
    if (pins.length === 0) return { latitude: 25, longitude: 30 };
    const latitude = pins.reduce((total, pin) => total + pin.lat, 0) / pins.length;
    const longitude = pins.reduce((total, pin) => total + pin.lng, 0) / pins.length;
    return { latitude, longitude };
  }, [pins]);

  const open = (event: MapLayerMouseEvent) => {
    const slug = event.features?.[0]?.properties?.slug as string | undefined;
    if (!slug) return;
    if (embed) window.open(`/m/${slug}`, "_blank", "noopener");
    else window.location.assign(`/m/${slug}`);
  };

  return (
    <Map
      initialViewState={{ ...center, zoom: 1.4 }}
      mapStyle="/map/night.json"
      projection="globe"
      attributionControl={false}
      interactiveLayerIds={["pins"]}
      cursor="pointer"
      onClick={open}
      style={{ position: "absolute", inset: 0 }}
    >
      <AttributionControl compact customAttribution="Natural Earth" />
      <NavigationControl position="bottom-right" showCompass={false} />
      <Source id="checkins" type="geojson" data={data}>
        <Layer
          id="halo"
          type="circle"
          paint={{
            "circle-color": GOLD,
            "circle-opacity": 0.22,
            "circle-radius": ["interpolate", ["linear"], ["min", ["get", "count"], 12], 1, 9, 12, 20],
          }}
        />
        <Layer
          id="pins"
          type="circle"
          paint={{
            "circle-color": GOLD,
            "circle-stroke-color": "#0E2A22",
            "circle-stroke-width": 1.5,
            "circle-radius": ["interpolate", ["linear"], ["min", ["get", "count"], 12], 1, 4.5, 12, 8],
          }}
        />
      </Source>
    </Map>
  );
}

export default ProfileGlobe;
