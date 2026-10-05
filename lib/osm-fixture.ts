import { geohashBounds } from "@/lib/osm-fill";

/**
 * An in-process stand-in for Overpass and Photon, for E2E on hosts that can't reach them (CI, sandboxes).
 * The fill route uses it only on non-production hosts when the request carries `x-mw-osm-fixture: 1`.
 * Every cell gets sixteen places on a grid (mosques and prayer rooms), named after their position.
 */
export function fixtureFetcher(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/reverse")) {
      return Response.json({ features: [{ properties: { countrycode: "US", city: "Fixtureville", state: "Testshire", type: "house" } }] });
    }
    const data = new URLSearchParams(typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "").get("data") ?? "";
    const box = data.match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/);
    if (!box) return new Response("bad query", { status: 400 });
    const [south, west, north, east] = box.slice(1).map(Number) as [number, number, number, number];
    // A 4×4 grid across the cell, so any zoomed-in view of it has a few places.
    const elements = [];
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const lat = south + ((row + 0.5) / 4) * (north - south);
        const lng = west + ((col + 0.5) / 4) * (east - west);
        const id = Math.abs(Math.round(lat * 10_000) * 100_003 + Math.round(lng * 10_000));
        const label = `${Math.abs(lat).toFixed(2)}${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(2)}${lng >= 0 ? "E" : "W"}`;
        const kind = (row + col) % 4;
        elements.push(
          kind === 0
            ? { type: "node", id, lat, lon: lng, tags: { name: `Masjid Al-Noor ${label}`, wheelchair: "yes" } }
            : kind === 1
              ? { type: "node", id, lat, lon: lng, tags: { name: `Islamic Center ${label}`, website: "https://example.org" } }
              : kind === 2
                ? { type: "way", id, center: { lat, lon: lng }, tags: { name: `Masjid Bilal ${label}` } }
                : { type: "node", id, lat, lon: lng, tags: { name: `Station Prayer Room ${label}` } },
        );
      }
    }
    return Response.json({ elements });
  }) as typeof fetch;
}

/** The centre of a cell, for tests that need a point inside it. */
export function cellCentre(cell: string) {
  const box = geohashBounds(cell);
  return { lat: (box.south + box.north) / 2, lng: (box.west + box.east) / 2 };
}
