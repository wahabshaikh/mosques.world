import { FREE_RATE_LIMIT } from "@/lib/api-keys";

/** OpenAPI 3.1 description of the public read API (spec P8), served at /api/v1/openapi.json. */
export function openApiDocument(base: string) {
  const idParam = {
    name: "id",
    in: "path",
    required: true,
    description: "Place id, or its slug as in /m/{slug}.",
    schema: { type: "string" },
  };
  const errors = {
    "400": { description: "Invalid parameters", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    "401": { description: "Missing or invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    "429": {
      description: `Rate limit reached (${FREE_RATE_LIMIT} requests a minute per key)`,
      headers: { "Retry-After": { schema: { type: "integer" } } },
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "mosques.world public API",
      version: "1.0.0",
      description:
        "Read-only access to mosques, calculated adhan times and community-verified iqamah times. Data is published under the ODbL; attribute “© mosques.world contributors, © OpenStreetMap contributors”.",
      license: { name: "ODbL-1.0", identifier: "ODbL-1.0" },
    },
    servers: [{ url: `${base}/api/v1/public` }],
    security: [{ bearer: [] }, { apiKey: [] }],
    paths: {
      "/places": {
        get: {
          summary: "Places near a point or in a bounding box",
          operationId: "listPlaces",
          parameters: [
            { name: "bbox", in: "query", description: "west,south,east,north (at most 2° each way)", schema: { type: "string", example: "-0.08,51.51,-0.06,51.52" } },
            { name: "lat", in: "query", schema: { type: "number" } },
            { name: "lng", in: "query", schema: { type: "number" } },
            { name: "radius_km", in: "query", schema: { type: "number", default: 5, maximum: 50 } },
            { name: "kind", in: "query", schema: { type: "string", enum: ["mosque", "prayer_room"] } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 500 } },
          ],
          responses: {
            "200": { description: "GeoJSON FeatureCollection, nearest first", content: { "application/geo+json": { schema: { $ref: "#/components/schemas/FeatureCollection" } } } },
            ...errors,
          },
        },
      },
      "/places/{id}": {
        get: {
          summary: "A place with its standing iqamah times, Jumu'ah and amenities",
          operationId: "getPlace",
          parameters: [idParam],
          responses: { "200": { description: "Place", content: { "application/json": { schema: { $ref: "#/components/schemas/PlaceDetail" } } } }, "404": { description: "Not found" }, ...errors },
        },
      },
      "/places/{id}/times": {
        get: {
          summary: "A day's adhan and iqamah times, as shown on the mosque page",
          operationId: "getTimes",
          parameters: [idParam, { name: "date", in: "query", description: "YYYY-MM-DD in the place's time zone; defaults to now", schema: { type: "string", format: "date" } }],
          responses: { "200": { description: "Times", content: { "application/json": { schema: { $ref: "#/components/schemas/Times" } } } }, "404": { description: "Not found" }, ...errors },
        },
      },
    },
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "Create a key at /settings/developers." },
        apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
      schemas: {
        Error: { type: "object", properties: { error: { type: "string" }, docs: { type: "string" } }, required: ["error"] },
        PlaceProperties: {
          type: "object",
          properties: {
            id: { type: "string" },
            slug: { type: "string" },
            name: { type: "string" },
            name_local: { type: ["string", "null"] },
            kind: { type: "string", enum: ["mosque", "prayer_room"] },
            status: { type: "string", enum: ["active", "closed"] },
            address: { type: ["string", "null"] },
            locality: { type: ["string", "null"] },
            country: { type: "string", description: "ISO 3166-1 alpha-2" },
            timezone: { type: "string" },
            verification: { type: "string", enum: ["none", "partial", "verified", "needs_check"] },
            last_verified_at: { type: ["string", "null"], format: "date-time" },
            osm: { type: ["string", "null"], example: "way/123456" },
            url: { type: "string", format: "uri" },
          },
        },
        FeatureCollection: {
          type: "object",
          properties: {
            type: { const: "FeatureCollection" },
            features: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { const: "Feature" },
                  id: { type: "string" },
                  geometry: { type: "object", properties: { type: { const: "Point" }, coordinates: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } } },
                  properties: { $ref: "#/components/schemas/PlaceProperties" },
                },
              },
            },
            license: { type: "string" },
            attribution: { type: "string" },
          },
        },
        PlaceDetail: {
          allOf: [
            { $ref: "#/components/schemas/PlaceProperties" },
            {
              type: "object",
              properties: {
                lat: { type: "number" },
                lng: { type: "number" },
                calculation: { type: "object", properties: { method: { type: "string" }, asr_madhab: { type: "string" }, high_latitude_rule: { type: "string" } } },
                iqamah: {
                  type: "object",
                  description: "Keyed by prayer (fajr, dhuhr, asr, maghrib, isha)",
                  additionalProperties: {
                    type: "object",
                    properties: {
                      time: { type: "string", example: "13:30" },
                      minutes_after_adhan: { type: "integer" },
                      state: { type: "string" },
                      confirmations: { type: "integer" },
                      last_confirmed_at: { type: ["string", "null"], format: "date-time" },
                      effective_from: { type: "string", format: "date" },
                    },
                  },
                },
                jumuah: { type: "array", items: { type: "object", properties: { jamaah: { type: "integer" }, time: { type: "string" }, khutbah: { type: ["string", "null"] }, languages: { type: "array", items: { type: "string" } } } } },
                amenities: { type: "object", additionalProperties: { type: "object", properties: { available: { type: "boolean" }, state: { type: "string" }, confirmations: { type: "integer" } } } },
              },
            },
          ],
        },
        Times: {
          type: "object",
          properties: {
            date: { type: "string", format: "date" },
            hijri: { type: "string" },
            timezone: { type: "string" },
            jumuah_day: { type: "boolean" },
            prayers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  prayer: { type: "string", enum: ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] },
                  adhan: { type: "string", example: "05:12", description: "Calculated, local 24h" },
                  adhan_at: { type: "string", format: "date-time" },
                  iqamah: { type: ["string", "null"], example: "05:45" },
                  iqamah_at: { type: ["string", "null"], format: "date-time" },
                  iqamah_source: { type: ["string", "null"], enum: ["community", "timetable", null] },
                  iqamah_status: { type: ["string", "null"], enum: ["verified", "unverified", "needs_check", null] },
                },
              },
            },
            jumuah: { type: "array", items: { type: "object", properties: { jamaah: { type: "integer" }, time: { type: "string" }, khutbah: { type: ["string", "null"] } } } },
          },
        },
      },
    },
  };
}
