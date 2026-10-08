import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { fetchMasjidal, masjidalDays } from "./masjidal";
import { mawaqitDays, parseConfData, type MawaqitConf } from "./mawaqit";
import { linkFromWebsites, linkSource, localDate, refreshDueSources } from "./sync";
import { addMinutes, cleanDay, dateRange, detectSource, normaliseHm, parseTimetable, timetableOn } from "./timetable";

const NOW = Date.UTC(2026, 9, 8, 10); // Thursday 8 October 2026

/** A year calendar where every day has the same times, like the slice of a Mawaqit page we read. */
function conf(extra: Partial<MawaqitConf> = {}): MawaqitConf {
  const month = (row: string[]) => Object.fromEntries(Array.from({ length: 31 }, (_, day) => [String(day + 1), row]));
  return {
    name: "Grande Mosquée",
    latitude: 51.5174,
    longitude: -0.0654,
    timezone: "Europe/London",
    iqamaEnabled: true,
    calendar: Array.from({ length: 12 }, () => month(["06:27", "08:00", "13:43", "16:38", "19:18", "20:45"])),
    iqamaCalendar: Array.from({ length: 12 }, () => month(["+8", "+8", "17:00", "+0", "+10"])),
    jumua: "13:50",
    jumua2: "14:30",
    jumua3: null,
    ...extra,
  };
}

function page(data: MawaqitConf) {
  return `<html><script>let lastUpdated = 1;\n    let confData = ${JSON.stringify(data)};\n    let other = {"a":"}"};</script></html>`;
}

describe("timetable helpers", () => {
  it("normalises clock strings", () => {
    expect(normaliseHm("6:05")).toBe("06:05");
    expect(normaliseHm("06:05:00")).toBe("06:05");
    expect(normaliseHm("1:30PM")).toBe("13:30");
    expect(normaliseHm("12:10 am")).toBe("00:10");
    expect(normaliseHm("25:00")).toBeNull();
    expect(normaliseHm(null)).toBeNull();
    expect(addMinutes("23:55", 10)).toBe("00:05");
    expect(dateRange("2026-12-31", 2)).toEqual(["2026-12-31", "2027-01-01"]);
  });

  it("recognises Mawaqit and Masjidal links", () => {
    expect(detectSource("https://mawaqit.net/fr/grande-mosquee-de-paris")).toEqual({
      provider: "mawaqit",
      externalId: "grande-mosquee-de-paris",
      url: "https://mawaqit.net/en/grande-mosquee-de-paris",
    });
    expect(detectSource("mawaqit.net/en/m/Some-Mosque")?.externalId).toBe("some-mosque");
    expect(detectSource("https://mawaqit.net/en/backoffice/mosque")).toBeNull();
    expect(detectSource("https://masjidal.com/widget/simple/v3/?masjid_id=AbC123xy")).toMatchObject({ provider: "masjidal", externalId: "AbC123xy" });
    expect(detectSource("https://masjidal.com/widget/simple/v3/")).toBeNull();
    expect(detectSource("https://example.com/mawaqit.net/x")).toBeNull();
    expect(detectSource("not a url at all")).toBeNull();
    expect(detectSource(null)).toBeNull();
  });

  it("reads stored timetables defensively", () => {
    expect(parseTimetable("{")).toBeNull();
    expect(parseTimetable(JSON.stringify({ p: "other", url: "x", at: 1, days: {} }))).toBeNull();
    const timetable = parseTimetable(JSON.stringify({ p: "mawaqit", url: "u", at: 1, days: { "2026-10-08": { i: { fajr: "06:35" } }, "2026-10-09": {} } }));
    expect(timetableOn(timetable, "2026-10-08")?.i?.fajr).toBe("06:35");
    expect(timetableOn(timetable, "2026-10-09")).toBeNull();
    expect(cleanDay({ a: { fajr: "6am" }, j: ["13:00", "x"] })).toEqual({ j: ["13:00"] });
  });
});

describe("Mawaqit", () => {
  it("finds confData in a page, even with braces inside strings", () => {
    const parsed = parseConfData(page(conf({ name: "A {tricky} \"name\"" })));
    expect(parsed?.name).toBe('A {tricky} "name"');
    expect(parseConfData("<html></html>")).toBeNull();
    expect(parseConfData("confData = {not json};")).toBeNull();
  });

  it("turns the year calendars into dated adhan, iqamah and Friday jumu'ah", () => {
    const days = mawaqitDays(conf(), "2026-10-08", 2);
    expect(days["2026-10-08"]).toEqual({
      a: { fajr: "06:27", dhuhr: "13:43", asr: "16:38", maghrib: "19:18", isha: "20:45" },
      i: { fajr: "06:35", dhuhr: "13:51", asr: "17:00", maghrib: "19:18", isha: "20:55" },
    });
    expect(days["2026-10-09"]?.j).toEqual(["13:50", "14:30"]);
    const noIqamah = mawaqitDays(conf({ iqamaEnabled: false }), "2026-10-08", 1);
    expect(noIqamah["2026-10-08"]?.i).toBeUndefined();
    const fixed = mawaqitDays(conf({ fixedIqama: ["07:00", "", "", "", ""] }), "2026-10-08", 1);
    expect(fixed["2026-10-08"]?.i?.fajr).toBe("07:00");
  });
});

describe("Masjidal", () => {
  it("matches rows to dates by position", () => {
    const days = masjidalDays(
      {
        status: "success",
        data: {
          salah: [{ fajr: "5:42AM", zuhr: "1:05PM", asr: "4:40PM", maghrib: "6:30PM", isha: "7:50PM" }],
          iqamah: [{ fajr: "6:15AM", zuhr: "1:30PM", asr: "5:00PM", maghrib: "6:35PM", isha: "8:15PM", jummah1: "1:30PM" }],
        },
      },
      "2026-10-09",
      2,
    );
    expect(days["2026-10-09"]).toEqual({
      a: { fajr: "05:42", dhuhr: "13:05", asr: "16:40", maghrib: "18:30", isha: "19:50" },
      i: { fajr: "06:15", dhuhr: "13:30", asr: "17:00", maghrib: "18:35", isha: "20:15" },
      j: ["13:30"],
    });
    expect(days["2026-10-10"]).toBeUndefined();
    expect(masjidalDays({ status: "error", data: [] }, "2026-10-09", 1)).toEqual({});
  });

  it("asks for the date range and explains an unknown masjid or an empty timetable", async () => {
    const urls: string[] = [];
    const answer = (body: unknown) =>
      (async (url: string) => {
        urls.push(url);
        return new Response(JSON.stringify(body));
      }) as unknown as typeof fetch;
    const days = await fetchMasjidal("AbC123", "2026-10-09", 2, answer({ status: "success", data: { salah: [{ fajr: "5:42AM" }], iqamah: [{ fajr: "6:15AM" }] } }));
    expect(days["2026-10-09"]?.i?.fajr).toBe("06:15");
    expect(urls[0]).toBe("https://masjidal.com/api/v1/time/range?masjid_id=AbC123&from_date=2026-10-09&to_date=2026-10-10");
    await expect(fetchMasjidal("nope", "2026-10-09", 2, answer({ status: "error", data: [] }))).rejects.toThrow("doesn't know");
    await expect(fetchMasjidal("AbC123", "2026-10-09", 2, answer({ status: "success", data: { salah: [], iqamah: [] } }))).rejects.toThrow("empty");
  });
});

describe("sync", () => {
  let d1: D1Database;
  let sqlite: ReturnType<typeof createTestD1>["sqlite"];
  const place = { id: "elm", lat: 51.5173983, lng: -0.0653616, timezone: "Europe/London" };

  beforeEach(() => {
    ({ d1, sqlite } = createTestD1());
    sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, website, created_at, updated_at)
      VALUES ('elm', 'elm', 'East London Mosque', 'mosque', 51.5173983, -0.0653616, 'gcpvjh', 'GB', 'london', 'Europe/London', 'MoonsightingCommittee', 'hanafi', 'https://mawaqit.net/en/east-london-mosque', 0, 0)`);
  });

  const mawaqitFetch = (data: MawaqitConf, status = 200) =>
    (async () => new Response(status === 200 ? page(data) : "nope", { status })) as unknown as typeof fetch;

  it("uses the place's own date", () => {
    expect(localDate(Date.UTC(2026, 9, 8, 23, 30), "Asia/Karachi")).toBe("2026-10-09");
    expect(localDate(NOW, "Not/AZone")).toBe("2026-10-08");
  });

  it("links a Mawaqit page and stores two weeks on the place", async () => {
    const ref = detectSource("https://mawaqit.net/en/east-london-mosque")!;
    const result = await linkSource(d1, place, ref, { userId: "u", fetcher: mawaqitFetch(conf()), now: NOW });
    expect(result.ok).toBe(true);
    const row = sqlite.prepare(`SELECT timetable_json FROM place WHERE id = 'elm'`).get() as { timetable_json: string };
    const stored = parseTimetable(row.timetable_json);
    expect(stored?.p).toBe("mawaqit");
    expect(Object.keys(stored?.days ?? {})).toHaveLength(14);
    expect(sqlite.prepare(`SELECT status, created_by FROM place_source`).get()).toEqual({ status: "ok", created_by: "u" });
  });

  it("refuses a page for a mosque somewhere else and keeps the error", async () => {
    const ref = detectSource("https://mawaqit.net/en/far-away")!;
    const result = await linkSource(d1, place, ref, { userId: "u", fetcher: mawaqitFetch(conf({ latitude: 48.84, longitude: 2.35 })), now: NOW });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("km away");
    expect(sqlite.prepare(`SELECT status FROM place_source`).get()).toEqual({ status: "failed" });
    const missing = await linkSource(d1, place, ref, { userId: "u", fetcher: mawaqitFetch(conf(), 404), now: NOW });
    expect(!missing.ok && missing.error).toBe("That Mawaqit page doesn't exist.");
  });

  it("links OpenStreetMap websites nightly and refreshes what is due", async () => {
    sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, website, created_at, updated_at)
      VALUES ('home', 'home', 'Other Mosque', 'mosque', 51.5, -0.06, 'gcpvjh', 'GB', 'london', 'Europe/London', 'MoonsightingCommittee', 'hanafi', 'https://mawaqit.net/', 0, 0)`);
    expect(await linkFromWebsites(d1, NOW)).toBe(1);
    expect(await linkFromWebsites(d1, NOW)).toBe(0);
    // The provider's home page is noted once and never fetched.
    expect(sqlite.prepare(`SELECT status, external_id FROM place_source WHERE place_id = 'home'`).get()).toEqual({ status: "failed", external_id: "" });
    expect(await refreshDueSources(d1, mawaqitFetch(conf()), NOW)).toEqual({ ok: 1, failed: 0 });
    // Fresh: nothing due the next day.
    expect(await refreshDueSources(d1, mawaqitFetch(conf()), NOW + 24 * 60 * 60 * 1000)).toEqual({ ok: 0, failed: 0 });
    expect(await refreshDueSources(d1, mawaqitFetch(conf()), NOW + 4 * 24 * 60 * 60 * 1000)).toEqual({ ok: 1, failed: 0 });
    expect(await refreshDueSources(d1, mawaqitFetch(conf()), NOW + 30 * 24 * 60 * 60 * 1000)).toEqual({ ok: 1, failed: 0 });
  });
});

describe("linking limits", () => {
  it("allows ten links per person per day", async () => {
    const { d1, sqlite } = createTestD1();
    const { DAILY_LINKS, linksLeftToday } = await import("./sync");
    expect(await linksLeftToday(d1, "u", NOW)).toBe(DAILY_LINKS);
    for (let index = 0; index < DAILY_LINKS; index += 1) {
      sqlite.exec(`INSERT INTO place_source (place_id, provider, external_id, url, created_by, created_at, updated_at) VALUES ('p${index}', 'mawaqit', 'x', 'u', 'u', ${NOW}, ${NOW})`);
    }
    expect(await linksLeftToday(d1, "u", NOW)).toBe(0);
    expect(await linksLeftToday(d1, "u", NOW + 25 * 60 * 60 * 1000)).toBe(DAILY_LINKS);
    expect(await linksLeftToday(d1, "someone-else", NOW)).toBe(DAILY_LINKS);
  });

  it("serves a fixture mosque at the place for E2E", async () => {
    const { sourceFixtureFetcher } = await import("./fixture");
    const fetcher = sourceFixtureFetcher({ lat: 51.5, lng: -0.1 });
    expect(parseConfData(await (await fetcher("https://mawaqit.net/en/x")).text())?.latitude).toBe(51.5);
    expect(await (await fetcher("https://masjidal.com/api")).json()).toMatchObject({ status: "error" });
  });
});
