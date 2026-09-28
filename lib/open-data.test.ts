import { beforeEach, describe, expect, it } from "vitest";
import { clearKeyCache, createApiKey, hashKey, keyFrom, listApiKeys, lookupKey, MAX_ACTIVE_KEYS, revokeApiKey, touchKey } from "@/lib/api-keys";
import { guardKey, placeTimes } from "@/lib/public-api";
import { iqamahCells } from "@/lib/places/mosque";
import { getPrayerDay } from "@/lib/prayer/times";
import { createTestD1 } from "@/lib/testing/d1";
import { placeFacts } from "@/lib/trust/read";
import { castVote, submitValue, type Actor } from "@/lib/trust/store";
import type { DirectoryPlace } from "@/lib/db/queries";
import { CSV_COLUMNS, csvRow, exportRecord, PartWriter, queueMonthlyExport, runExport } from "./open-data";

const NOW = Date.UTC(2026, 9, 5, 9);
let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

function user(id: string, trustLevel = 1): Actor {
  sqlite.prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, trust_level, username) VALUES (?, ?, ?, 1, 0, 0, ?, ?)`).run(id, id, `${id}@x`, trustLevel, id);
  return { id, trustLevel: trustLevel as Actor["trustLevel"], createdAt: 0, role: "user" };
}

async function value(actor: Actor, key: string, v: unknown): Promise<string> {
  const result = await submitValue(d1, { actor, placeId: "p1", key, qualifier: "", value: v, effectiveFrom: "2026-01-01", source: "board", now: NOW });
  return (result as { candidateId: string }).candidateId;
}

function addPlace(id: string, slug: string, extra = "") {
  sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at, status, address, created_by)
    VALUES ('${id}', '${slug}', 'Mosque ${id}', 'mosque', 51.5175, -0.0653, 'gcpvn0', 'GB', 'london', 'Europe/London', 'MoonsightingCommittee', 'hanafi', 0, 0, 'active', '=HYPERLINK("x")', 'u1')${extra}`);
}

/** A tiny in-memory R2 bucket with multipart uploads. */
function fakeBucket() {
  const objects = new Map<string, Uint8Array>();
  const bucket = {
    objects,
    async createMultipartUpload(key: string) {
      const parts: Uint8Array[] = [];
      return {
        async uploadPart(number: number, body: Uint8Array) {
          parts[number - 1] = body;
          return { partNumber: number, etag: String(number) };
        },
        async complete() {
          const size = parts.reduce((total, part) => total + part.length, 0);
          const all = new Uint8Array(size);
          let offset = 0;
          for (const part of parts) {
            all.set(part, offset);
            offset += part.length;
          }
          objects.set(key, all);
        },
        async abort() {},
      };
    },
  };
  return bucket as unknown as R2Bucket & { objects: Map<string, Uint8Array> };
}

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  user("u1");
  addPlace("p1", "elm");
  addPlace("p2", "pending-one");
  sqlite.exec(`UPDATE place SET status = 'pending' WHERE id = 'p2'`);
  clearKeyCache();
});

describe("open-data export", () => {
  it("writes valid GeoJSON and CSV with current facts and confirmation counts, and no user data", async () => {
    const a = user("a");
    const b = user("b");
    const fajr = await value(a, "iqamah.fajr", { t: "06:15" });
    await castVote(d1, { actor: b, candidateId: fajr, polarity: 1, source: "board", now: NOW + 1000 });
    await value(a, "amenity.women_section", { v: true, note: "Upstairs, ask for Fatima" });
    const bucket = fakeBucket();
    const id = await runExport({ DB: d1, MEDIA: bucket }, { period: "2026-10", now: NOW, base: "https://mosques.world" });
    expect(id).toBeTruthy();

    const geojson = JSON.parse(new TextDecoder().decode(bucket.objects.get("open-data/places-2026-10.geojson"))) as {
      type: string;
      license: string;
      features: Array<{ type: string; geometry: { type: string; coordinates: number[] }; properties: Record<string, unknown> }>;
    };
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.license).toBe("ODbL-1.0");
    expect(geojson.features).toHaveLength(1);
    const feature = geojson.features[0]!;
    expect(feature.geometry).toEqual({ type: "Point", coordinates: [-0.0653, 51.5175] });
    expect(feature.properties.fajr_iqamah).toBe("06:15");
    expect(feature.properties.confirmations).toBe(3);
    expect(feature.properties.amenities).toBe("women_section");

    const text = JSON.stringify(geojson) + new TextDecoder().decode(bucket.objects.get("open-data/places-2026-10.csv"));
    expect(text).not.toMatch(/created_by|email|u1@x|"a"|Fatima|author/);
    const csv = new TextDecoder().decode(bucket.objects.get("open-data/places-2026-10.csv")).trim().split("\n");
    expect(csv[0]).toBe(CSV_COLUMNS.join(","));
    expect(csv).toHaveLength(2);
    // Spreadsheet formulas are neutralised.
    expect(csv[1]).toContain(`"'=HYPERLINK(""x"")"`);

    const run = sqlite.prepare(`SELECT status, rows FROM export_run WHERE period = '2026-10'`).get() as { status: string; rows: number };
    expect(run).toEqual({ status: "done", rows: 1 });
    // A finished month is not exported again.
    expect(await runExport({ DB: d1, MEDIA: bucket }, { period: "2026-10", now: NOW, base: "https://mosques.world" })).toBeNull();
  });

  it("pages through places with a keyset", async () => {
    for (let index = 0; index < 1_205; index += 1) {
      sqlite
        .prepare(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at, status) VALUES (?, ?, ?, 'mosque', 1, 1, 's00000', 'SG', 'sg', 'Asia/Singapore', 'Singapore', 'shafi', 0, 0, 'active')`)
        .run(`q${String(index).padStart(5, "0")}`, `q-${index}`, `Q ${index}`);
    }
    const bucket = fakeBucket();
    await runExport({ DB: d1, MEDIA: bucket }, { period: "2026-10", now: NOW, base: "https://mosques.world" });
    const lines = new TextDecoder().decode(bucket.objects.get("open-data/places-2026-10.csv")).trim().split("\n");
    expect(lines).toHaveLength(1 + 1_206);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("uploads equal 5 MiB parts with a shorter last part", async () => {
    const sizes: number[] = [];
    const upload = {
      async uploadPart(number: number, body: Uint8Array) {
        sizes.push(body.length);
        return { partNumber: number, etag: "" };
      },
      async complete() {},
      async abort() {},
    } as unknown as R2MultipartUpload;
    const writer = new PartWriter(upload);
    const chunk = "x".repeat(700_000);
    for (let index = 0; index < 18; index += 1) await writer.write(chunk);
    await writer.finish();
    const mib5 = 5 * 1024 * 1024;
    expect(sizes).toEqual([mib5, mib5, 18 * 700_000 - 2 * mib5]);
  });

  it("queues at most one export a month", async () => {
    const sent: unknown[] = [];
    const queue = { send: async (body: unknown) => void sent.push(body) } as unknown as Queue;
    expect(await queueMonthlyExport({ DB: d1, Q_RECOMPUTE: queue }, NOW)).toBe(true);
    expect(sent).toEqual([{ type: "open_data_export", period: "2026-10" }]);
    await runExport({ DB: d1, MEDIA: fakeBucket() }, { period: "2026-10", now: NOW, base: "https://mosques.world" });
    expect(await queueMonthlyExport({ DB: d1, Q_RECOMPUTE: queue }, NOW + 86_400_000)).toBe(false);
  });

  it("formats rule-based iqamah as +N", () => {
    const record = exportRecord(
      {
        id: "x", slug: "x", name: "X", name_local: null, kind: "mosque", status: "active", lat: 1, lng: 2, address: null, locality: null, region: null,
        country_code: "GB", timezone: "Europe/London", osm_type: null, osm_id: null, website: null, calc_method: "MWL", asr_madhab: "shafi",
        verification_state: "partial", last_verified_at: null,
      },
      [{ place_id: "x", key: "iqamah.maghrib", qualifier: "", state: "verified", value_json: '{"rule":"after_adhan","min":5}', backers: 2 }],
      "https://mosques.world",
    );
    expect(record.properties.maghrib_iqamah).toBe("+5");
    expect(csvRow(record).split(",")).toHaveLength(CSV_COLUMNS.length);
  });
});

describe("API keys", () => {
  it("stores only a hash, shows the key once and caps active keys", async () => {
    const { key, view } = await createApiKey(d1, { ownerId: "u1", name: "Screen", now: NOW });
    expect(key).toMatch(/^mw_[A-Za-z0-9]{32}$/);
    const row = sqlite.prepare(`SELECT hash, prefix FROM api_key WHERE id = ?`).get(view.id) as { hash: string; prefix: string };
    expect(row.hash).toBe(await hashKey(key));
    expect(JSON.stringify(sqlite.prepare(`SELECT * FROM api_key`).all())).not.toContain(key);
    for (let index = 1; index < MAX_ACTIVE_KEYS; index += 1) await createApiKey(d1, { ownerId: "u1", name: `k${index}`, now: NOW });
    await expect(createApiKey(d1, { ownerId: "u1", name: "one too many", now: NOW })).rejects.toThrow(/up to 5/);
    expect(await listApiKeys(d1, "u1")).toHaveLength(MAX_ACTIVE_KEYS);
  });

  it("reads the key from either header and refuses revoked keys", async () => {
    const { key, view } = await createApiKey(d1, { ownerId: "u1", name: "Screen", now: NOW });
    expect(keyFrom(new Request("https://x", { headers: { authorization: `Bearer ${key}` } }))).toBe(key);
    expect(keyFrom(new Request("https://x", { headers: { "x-api-key": key } }))).toBe(key);
    expect(keyFrom(new Request("https://x", { headers: { authorization: "Bearer nope" } }))).toBeNull();

    const ok = await guardKey(new Request("https://x", { headers: { authorization: `Bearer ${key}` } }), { DB: d1 }, NOW);
    expect("headers" in ok && ok.headers["X-RateLimit-Limit"]).toBe("60");
    expect(await revokeApiKey(d1, { ownerId: "other", id: view.id, now: NOW })).toBe(false);
    expect(await revokeApiKey(d1, { ownerId: "u1", id: view.id, now: NOW })).toBe(true);
    const refused = await guardKey(new Request("https://x", { headers: { authorization: `Bearer ${key}` } }), { DB: d1 }, NOW);
    expect("response" in refused && refused.response.status).toBe(401);
  });

  it("applies the per-key rate limit and records use at most hourly", async () => {
    const { key } = await createApiKey(d1, { ownerId: "u1", name: "Screen", now: NOW });
    let calls = 0;
    const limiter = { limit: async () => ({ success: ++calls <= 2 }) } as unknown as RateLimit;
    const request = () => new Request("https://x", { headers: { "x-api-key": key } });
    expect("headers" in (await guardKey(request(), { DB: d1, RL_API: limiter }, NOW))).toBe(true);
    expect("headers" in (await guardKey(request(), { DB: d1, RL_API: limiter }, NOW + 1000))).toBe(true);
    const limited = await guardKey(request(), { DB: d1, RL_API: limiter }, NOW + 2000);
    expect("response" in limited && limited.response.status).toBe(429);
    expect("response" in limited && limited.response.headers.get("Retry-After")).toBe("60");
    const row = await lookupKey(d1, key, NOW + 3000);
    expect(row?.last_used_at).toBe(NOW);
    await touchKey(d1, row!, NOW + 10 * 60_000);
    expect((sqlite.prepare(`SELECT last_used_at FROM api_key`).get() as { last_used_at: number }).last_used_at).toBe(NOW);
  });
});

describe("public API times", () => {
  it("returns the same iqamah the mosque page shows", async () => {
    const a = user("a");
    await value(a, "iqamah.isha", { t: "19:45" });
    await value(a, "iqamah.maghrib", { rule: "after_adhan", min: 5 });
    const place = { id: "p1", slug: "elm", name: "ELM", lat: 51.5175, lng: -0.0653, timezone: "Europe/London", calcMethod: "MoonsightingCommittee", asrMadhab: "hanafi", highLatRule: "twilightangle" } as DirectoryPlace;
    const day = getPrayerDay({ lat: place.lat, lng: place.lng, timeZone: place.timezone, method: place.calcMethod, madhab: "hanafi", highLat: "twilightangle", now: new Date(NOW) });
    const facts = await placeFacts(d1, "p1", day.date);
    const page = iqamahCells(facts, day, NOW);
    const api = placeTimes(place, facts, day, NOW, "https://mosques.world");
    const isha = api.prayers.find((row) => row.prayer === "isha")!;
    expect(isha.iqamah).toBe("19:45");
    expect(isha.iqamah_at).toBe(page.isha?.at);
    const maghrib = api.prayers.find((row) => row.prayer === "maghrib")!;
    expect(maghrib.iqamah_at).toBe(page.maghrib?.at);
    expect(api.prayers.map((row) => row.adhan)).toEqual(day.rows.map((row) => row.adhan));
  });
});
