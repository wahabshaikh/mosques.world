import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { parseTimetable } from "@/lib/sources/timetable";
import { placesInBbox } from "./queries";

const LONDON = { south: 51.4, north: 51.6, west: -0.3, east: 0.1 };

describe("placesInBbox", () => {
  let sqlite: ReturnType<typeof createTestD1>["sqlite"];

  beforeEach(() => {
    const created = createTestD1();
    sqlite = created.sqlite;
    (env as Record<string, unknown>).DB = created.d1;
    const insert = (id: string, lat: number, extra: Record<string, string> = {}) => {
      const columns = Object.keys(extra);
      sqlite
        .prepare(
          `INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, verification_state, created_at, updated_at${columns.map((c) => `, ${c}`).join("")})
           VALUES (?, ?, ?, 'mosque', ?, -0.06, 'gcpvjh', 'GB', 'london', 'Europe/London', 'MoonsightingCommittee', 'hanafi', 'none', 0, 0${columns.map(() => ", ?").join("")})`,
        )
        .run(id, id, `Mosque ${id}`, lat, ...Object.values(extra));
    };
    insert("near", 51.517);
    insert("far", 51.55, {
      timetable_json: JSON.stringify({ p: "mawaqit", url: "u", at: 5, days: { "2026-10-07": { i: { fajr: "06:00" } }, "2026-10-08": { i: { fajr: "06:01" } }, "2026-12-01": { i: { fajr: "07:00" } } } }),
      enrichment_json: JSON.stringify({ wikidata: "Q1", image: { thumb: "https://upload.wikimedia.org/a.jpg", author: "x" }, wikipedia: { extract: "long ".repeat(500) } }),
    });
    insert("outside", 52.5);
  });

  it("returns the nearest places in the box with only the card's slice of big columns", async () => {
    const rows = await placesInBbox(LONDON, "all", { lat: 51.517, lng: -0.06 }, { dates: ["2026-10-07", "2026-10-08"] });
    expect(rows.map((row) => row.id)).toEqual(["near", "far"]);
    const far = rows[1]!;
    const timetable = parseTimetable(far.timetableJson);
    expect(timetable?.p).toBe("mawaqit");
    expect(Object.keys(timetable?.days ?? {})).toEqual(["2026-10-07", "2026-10-08"]);
    expect(timetable?.days["2026-10-08"]?.i?.fajr).toBe("06:01");
    expect(JSON.parse(far.enrichmentJson!)).toEqual({ wikidata: "Q1", image: { thumb: "https://upload.wikimedia.org/a.jpg" } });
    expect(rows[0]?.timetableJson).toBeNull();
    expect(rows[0]?.enrichmentJson).toBeNull();
  });

  it("counts a mosque timetable as having times", async () => {
    const rows = await placesInBbox(LONDON, "all", { lat: 51.517, lng: -0.06 }, { verifiedOnly: true });
    expect(rows.map((row) => row.id)).toEqual(["far"]);
  });
});
