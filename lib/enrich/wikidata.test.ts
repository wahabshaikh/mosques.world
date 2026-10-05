import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { encodeGeohash } from "@/lib/geo/geohash";
import { createTestD1 } from "@/lib/testing/d1";
import { boxQuery, cellsToEnrich, commonsThumb, enrichCell, enrichStaleCells, matchPlaces, nameSimilarity, parseEnrichment, parseImageInfo, parseSparql, parseSummary, type WikidataMosque } from "./wikidata";

const london = JSON.parse(readFileSync(new URL("../testing/wikidata-london.json", import.meta.url), "utf8")) as unknown;

const IMAGE_INFO = {
  query: {
    normalized: [{ from: "File:ELM and LMC Angled View 1.jpg", to: "File:ELM and LMC Angled View 1.jpg" }],
    pages: {
      "1": {
        title: "File:ELM and LMC Angled View 1.jpg",
        imageinfo: [
          {
            thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/ELM.jpg/960px-ELM.jpg?utm_source=commons.wikimedia.org&utm_content=thumbnail",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:ELM_and_LMC_Angled_View_1.jpg",
            extmetadata: {
              Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Example">Example &amp; Co</a>' },
              LicenseShortName: { value: "CC BY-SA 4.0" },
              LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
            },
          },
        ],
      },
      "2": {
        title: "File:Not free.jpg",
        imageinfo: [{ thumburl: "https://x/y.jpg", descriptionurl: "https://x", extmetadata: { LicenseShortName: { value: "CC BY-NC 2.0" } } }],
      },
      "-1": { title: "File:Missing.jpg", missing: "" },
    },
  },
};

const SUMMARY = {
  type: "standard",
  title: "East London Mosque",
  extract:
    "The East London Mosque is a mosque in the London Borough of Tower Hamlets. It is one of the largest mosques in the United Kingdom. Its current building on Whitechapel Road opened in 1985, after decades of fundraising by the community that met in houses nearby.",
  content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/East_London_Mosque" } },
};

function item(overrides: Partial<WikidataMosque>): WikidataMosque {
  return { id: "Q1", label: "", lat: 0, lng: 0, image: null, website: null, inception: null, article: null, nameAr: null, ...overrides };
}

describe("parsing Wikimedia responses", () => {
  it("reads one row per Wikidata item from SPARQL, with its photo, article and founding year", () => {
    const items = parseSparql(london);
    expect(items.map((entry) => entry.label).sort()).toEqual(["Baitul Ahad Mosque", "Brick Lane Masjid", "East London Mosque", "New Peckham Mosque", "Shacklewell Lane Mosque"]);
    const brick = items.find((entry) => entry.label === "Brick Lane Masjid");
    expect(brick).toMatchObject({ id: "Q4965928", image: "Brick Lane Jamme Masjid.jpg", article: "Brick Lane Mosque", inception: "1743", nameAr: "مسجد بريك لين" });
    expect(brick?.lat).toBeCloseTo(51.5193);
    expect(parseSparql(null)).toEqual([]);
    expect(parseSparql({ results: { bindings: [{ item: { value: "http://www.wikidata.org/entity/Q9" } }] } })).toEqual([]);
  });

  it("keeps only freely licensed Commons photos and strips the credit's HTML", () => {
    const images = parseImageInfo(IMAGE_INFO);
    expect([...images.keys()]).toEqual(["ELM and LMC Angled View 1.jpg"]);
    expect(images.get("ELM and LMC Angled View 1.jpg")).toMatchObject({
      author: "Example & Co",
      license: "CC BY-SA 4.0",
      thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/ELM.jpg/960px-ELM.jpg",
    });
    expect(parseImageInfo(undefined).size).toBe(0);
  });

  it("trims a Wikipedia summary to a couple of sentences", () => {
    const summary = parseSummary(SUMMARY);
    expect(summary?.extract).toBe("The East London Mosque is a mosque in the London Borough of Tower Hamlets. It is one of the largest mosques in the United Kingdom.");
    expect(summary?.url).toBe("https://en.wikipedia.org/wiki/East_London_Mosque");
    expect(parseSummary({ ...SUMMARY, type: "disambiguation" })).toBeNull();
    expect(parseSummary({ title: "No extract" })).toBeNull();
    expect(parseSummary({ title: "Long", extract: "x".repeat(500) })?.extract).toHaveLength(358);
  });

  it("reads stored enrichment defensively", () => {
    expect(parseEnrichment('{"wikidata":"Q1"}')).toEqual({ wikidata: "Q1" });
    expect(parseEnrichment("not json")).toBeNull();
    expect(parseEnrichment('{"other":1}')).toBeNull();
    expect(parseEnrichment(null)).toBeNull();
  });

  it("asks for mosques inside the box", () => {
    expect(boxQuery({ west: -0.2, south: 51.45, east: 0.05, north: 51.56 })).toContain('"Point(-0.2 51.45)"^^geo:wktLiteral');
  });
});

describe("matching places to Wikidata", () => {
  it("compares the telling words of names", () => {
    expect(nameSimilarity("The East London Mosque", "East London Mosque")).toBe(1);
    expect(nameSimilarity("Brick Lane Jamme Masjid", "Brick Lane Masjid")).toBeCloseTo(0.8);
    expect(nameSimilarity("Masjid", "Mosque")).toBe(0);
  });

  it("matches by name over Wikidata's rough coordinates, by distance alone only when very close", () => {
    const places = [
      { id: "elm", name: "East London Mosque", lat: 51.5174, lng: -0.0654 },
      { id: "near", name: "Unnamed prayer room", lat: 51.5193, lng: -0.0723 },
      { id: "far", name: "Some Other Masjid", lat: 51.53, lng: -0.09 },
    ];
    const { matches, duplicates } = matchPlaces(places, [
      item({ id: "Q10", label: "East London Mosque", lat: 51.5176, lng: -0.0656 }),
      item({ id: "Q11", label: "Brick Lane Masjid", lat: 51.5193, lng: -0.0722 }),
      item({ id: "Q12", label: "Faraway Mosque", lat: 51.6, lng: -0.3 }),
    ]);
    expect(matches.get("elm")?.id).toBe("Q10");
    expect(matches.get("near")?.id).toBe("Q11");
    expect(matches.has("far")).toBe(false);
    expect(duplicates).toEqual([]);
  });

  it("gives each item to one place and reports two places that both are it", () => {
    const { matches, duplicates } = matchPlaces(
      [
        { id: "a", name: "East London Mosque", lat: 51.5174, lng: -0.0654 },
        { id: "b", name: "The East London Mosque", lat: 51.5178, lng: -0.0649 },
      ],
      [item({ id: "Q10", label: "East London Mosque", lat: 51.5176, lng: -0.0656 })],
    );
    expect(matches.size).toBe(1);
    expect(duplicates).toEqual([{ wikidata: "Q10", placeIds: ["a", "b"] }]);
  });
});

function fakeFetch(responses: { sparql?: unknown; commons?: unknown; wikipedia?: unknown; fail?: string }) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const host = new URL(url).hostname;
    if (responses.fail && host.includes(responses.fail)) return new Response("slow down", { status: 429 });
    const body = host === "query.wikidata.org" ? responses.sparql : host === "commons.wikimedia.org" ? responses.commons : responses.wikipedia;
    return Response.json(body ?? {});
  }) as typeof fetch;
  return { fetcher, calls };
}

function seed(sqlite: ReturnType<typeof createTestD1>["sqlite"]) {
  const add = (id: string, name: string, lat: number, lng: number, website: string | null = null) =>
    sqlite
      .prepare(
        `INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, website, created_at, updated_at)
         VALUES (?, ?, ?, 'mosque', ?, ?, ?, 'GB', 'london', 'Europe/London', 'MoonsightingCommittee', 'hanafi', ?, 0, 0)`,
      )
      .run(id, id, name, lat, lng, encodeGeohash(lat, lng, 6), website);
  add("elm", "East London Mosque", 51.5174, -0.0654);
  add("brick", "Brick Lane Jamme Masjid", 51.5195, -0.0718, "https://community.example/");
  add("other", "Small Musalla", 51.5, -0.12);
  add("elm2", "The East London Mosque", 51.5178, -0.0649);
}

describe("enriching an area", () => {
  it("stores matches, photos and summaries, fills only empty websites, and records the cell", async () => {
    const { d1, sqlite } = createTestD1();
    seed(sqlite);
    const sparql = parseSparql(london);
    const elm = sparql.find((entry) => entry.label === "East London Mosque")!;
    const { fetcher } = fakeFetch({
      sparql: london,
      commons: { query: { pages: { "1": { ...IMAGE_INFO.query.pages["1"], title: `File:${elm.image}` } } } },
      wikipedia: SUMMARY,
    });
    const cell = encodeGeohash(51.5174, -0.0654, 4);
    const result = await enrichCell(d1, cell, fetcher, 5_000);
    expect(result).toMatchObject({ status: "done", matched: 2 });
    const stored = sqlite.prepare(`SELECT id, wikidata_id, enrichment_json, website FROM place ORDER BY id`).all() as Array<{ id: string; wikidata_id: string | null; enrichment_json: string | null; website: string | null }>;
    const byId = Object.fromEntries(stored.map((row) => [row.id, row]));
    expect(byId.elm?.wikidata_id).toBe(elm.id);
    expect(parseEnrichment(byId.elm?.enrichment_json)).toMatchObject({ image: { license: "CC BY-SA 4.0" }, wikipedia: { title: "East London Mosque" } });
    expect(byId.brick?.website).toBe("https://community.example/");
    expect(byId.other?.wikidata_id).toBeNull();
    expect(sqlite.prepare(`SELECT status, matched FROM enrich_cell WHERE geohash = ?`).get(cell)).toEqual({ status: "done", matched: 2 });
    expect(result.duplicates).toEqual([{ wikidata: elm.id, placeIds: ["elm", "elm2"] }]);
    expect(sqlite.prepare(`SELECT a_id, b_id, status FROM place_duplicate_candidate`).all()).toEqual([{ a_id: "elm", b_id: "elm2", status: "open" }]);
    expect(await cellsToEnrich(d1, 6_000, 10)).not.toContain(cell);
  });

  it("still stores the match when Commons rate-limits us", async () => {
    const { d1, sqlite } = createTestD1();
    seed(sqlite);
    const { fetcher } = fakeFetch({ sparql: london, fail: "commons", wikipedia: SUMMARY });
    expect((await enrichCell(d1, encodeGeohash(51.5174, -0.0654, 4), fetcher, 1)).status).toBe("done");
    const row = sqlite.prepare(`SELECT enrichment_json FROM place WHERE id = 'elm'`).get() as { enrichment_json: string };
    expect(parseEnrichment(row.enrichment_json)?.image).toBeUndefined();
  });

  it("marks a cell failed when Wikidata is down, and retries it a day later", async () => {
    const { d1, sqlite } = createTestD1();
    seed(sqlite);
    const { fetcher } = fakeFetch({ fail: "wikidata" });
    const cell = encodeGeohash(51.5174, -0.0654, 4);
    const [result] = await enrichStaleCells(d1, fetcher, 1_000, 5);
    expect(result).toMatchObject({ cell, status: "failed" });
    expect(await cellsToEnrich(d1, 2_000, 5)).not.toContain(cell);
    expect(await cellsToEnrich(d1, 1_000 + 25 * 3_600_000, 5)).toContain(cell);
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM place WHERE wikidata_id IS NOT NULL`).get()).toEqual({ n: 0 });
  });
});

describe("commonsThumb", () => {
  it("resizes a Commons thumbnail URL and leaves others alone", () => {
    expect(commonsThumb("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/ELM.jpg/800px-ELM.jpg", 120)).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/ELM.jpg/120px-ELM.jpg");
    expect(commonsThumb("https://example.org/a.jpg", 120)).toBe("https://example.org/a.jpg");
  });
});
