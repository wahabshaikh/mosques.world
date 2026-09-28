import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { placePath, placeSlugRedirect } from "./slug-redirect";

const KEPT = "01K62GJG001AS17S8THTQ6215P";
const REMOVED = "01K62GJG000EQ0FZB5HNA9AB7M";
const MIGRATIONS = [
  "0001_phase1.sql",
  "0002_seed.sql",
  "0003_phase2.sql",
  "0004_dedupe_london_central_mosque.sql",
];

describe("placePath", () => {
  it("parses mosque paths only", () => {
    expect(placePath("/m/abc")).toEqual({ slug: "abc", rest: "" });
    expect(placePath("/m/abc/history")).toEqual({
      slug: "abc",
      rest: "/history",
    });
    expect(placePath("/m/")).toBeNull();
    expect(placePath("/m/%E0%A4%A")).toBeNull();
    expect(placePath("/cities/gb")).toBeNull();
  });
});

describe("0004 London Central Mosque dedupe", () => {
  let d1: D1Database;
  let sqlite: ReturnType<typeof createTestD1>["sqlite"];

  beforeEach(() => {
    ({ d1, sqlite } = createTestD1(MIGRATIONS));
  });

  const count = (sql: string) => (sqlite.prepare(sql).get() as { n: number }).n;

  it("keeps the mosque building, removes the bus stop and recounts London", () => {
    expect(
      count(
        `SELECT COUNT(*) AS n FROM place WHERE name = 'London Central Mosque'`,
      ),
    ).toBe(1);
    expect(
      count(
        `SELECT COUNT(*) AS n FROM place WHERE id = '${KEPT}' AND osm_type = 'way' AND osm_id = 5983916`,
      ),
    ).toBe(1);
    expect(
      count(`SELECT COUNT(*) AS n FROM place WHERE id = '${REMOVED}'`),
    ).toBe(0);
    expect(
      count(
        `SELECT COUNT(*) AS n FROM place_fts WHERE place_fts MATCH '"london central"'`,
      ),
    ).toBe(1);
    const london = count(
      `SELECT COUNT(*) AS n FROM place WHERE city_slug = 'london' AND status = 'active'`,
    );
    expect(
      count(`SELECT place_count AS n FROM city WHERE city_slug = 'london'`),
    ).toBe(london);
  });

  it("301s the removed slug to the kept one", async () => {
    const response = await placeSlugRedirect(
      d1,
      "https://mosques.world/m/london-central-mosque-st-john-s-wood-2?x=1",
    );
    expect(response?.status).toBe(301);
    expect(response?.headers.get("location")).toBe(
      "https://mosques.world/m/london-central-mosque-st-john-s-wood?x=1",
    );
    const history = await placeSlugRedirect(
      d1,
      "https://mosques.world/m/london-central-mosque-st-john-s-wood-2/history",
    );
    expect(history?.headers.get("location")).toBe(
      "https://mosques.world/m/london-central-mosque-st-john-s-wood/history",
    );
    expect(
      await placeSlugRedirect(
        d1,
        "https://mosques.world/m/london-central-mosque-st-john-s-wood",
      ),
    ).toBeNull();
    expect(
      await placeSlugRedirect(d1, "https://mosques.world/m/no-such-place"),
    ).toBeNull();
    expect(
      await placeSlugRedirect(d1, "https://mosques.world/about"),
    ).toBeNull();
  });

  it("stops any import from re-creating the excluded OSM element", () => {
    const seedRow = readFileSync(
      new URL("../../migrations/0002_seed.sql", import.meta.url),
      "utf8",
    )
      .split("\n")
      .find((line) => line.includes("'node', 469777869"));
    expect(seedRow).toBeDefined();
    sqlite.exec(seedRow ?? "");
    sqlite.exec(`INSERT INTO place (id, slug, name, kind, status, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, osm_type, osm_id, created_at, updated_at)
      VALUES ('other', 'other', 'London Central Mosque', 'mosque', 'active', 51.5, -0.16, 'gcpvhh', 'GB', 'london', 'Europe/London', 'MuslimWorldLeague', 'shafi', 'node', 469777869, 1, 1)
      ON CONFLICT(osm_type, osm_id) DO UPDATE SET lat = excluded.lat`);
    expect(
      count(
        `SELECT COUNT(*) AS n FROM place WHERE osm_type = 'node' AND osm_id = 469777869`,
      ),
    ).toBe(0);
    // Other elements still import normally.
    sqlite.exec(`INSERT INTO place (id, slug, name, kind, status, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, osm_type, osm_id, created_at, updated_at)
      VALUES ('new', 'new', 'New Mosque', 'mosque', 'active', 51.5, -0.16, 'gcpvhh', 'GB', 'london', 'Europe/London', 'MuslimWorldLeague', 'shafi', 'node', 1, 1, 1)`);
    expect(count(`SELECT COUNT(*) AS n FROM place WHERE id = 'new'`)).toBe(1);
  });

  it("re-points rows that referenced the removed place", () => {
    const fresh = createTestD1(MIGRATIONS.slice(0, 3)).sqlite;
    fresh.exec(`INSERT INTO waitlist (id, email, place_id, token_hash, created_at) VALUES
      ('w1', 'a@example.com', '${REMOVED}', 't1', 1), ('w2', 'b@example.com', '${REMOVED}', 't2', 1), ('w3', 'b@example.com', '${KEPT}', 't3', 1)`);
    fresh.exec(
      `INSERT INTO report (id, target_type, target_id, place_id, reason, created_at) VALUES ('r1', 'place', '${REMOVED}', '${REMOVED}', 'wrong', 1)`,
    );
    fresh.exec(
      readFileSync(
        new URL(
          "../../migrations/0004_dedupe_london_central_mosque.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const rows = fresh
      .prepare(`SELECT id, place_id FROM waitlist ORDER BY id`)
      .all();
    expect(rows).toEqual([
      { id: "w1", place_id: KEPT },
      { id: "w3", place_id: KEPT },
    ]);
    expect(
      fresh.prepare(`SELECT target_id, place_id FROM report`).get(),
    ).toEqual({ target_id: KEPT, place_id: KEPT });
    expect(
      (
        fresh
          .prepare(`SELECT COUNT(*) AS n FROM place WHERE id = '${REMOVED}'`)
          .get() as { n: number }
      ).n,
    ).toBe(0);
  });

  it("is a no-op without the seed", () => {
    const empty = createTestD1([
      "0001_phase1.sql",
      "0003_phase2.sql",
      "0004_dedupe_london_central_mosque.sql",
    ]).sqlite;
    expect(
      (
        empty.prepare(`SELECT COUNT(*) AS n FROM osm_exclusion`).get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
    expect(
      (
        empty.prepare(`SELECT COUNT(*) AS n FROM place_slug_history`).get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
  });
});
