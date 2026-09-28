import ICAL from "ical.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { placeFacts } from "@/lib/trust/read";
import { castVote, type Actor } from "@/lib/trust/store";
import { iqamahCells } from "@/lib/places/mosque";
import { getPrayerDay } from "@/lib/prayer/times";
import { calendar, escapeText, feedToken, fold, offsetMinutes, placeEvents, readFeedToken, vtimezone } from "./ics";
import { addSpecialPrayer, describeSpecial, eidNear, eidSeason, specialDates, specialInput, upcomingSpecial } from "./special";
import { cleanRows, daysIn, extractTimetable, importTimetable, monthValues, normalizeTime, timetableInput } from "./timetable";
import type { DirectoryPlace } from "@/lib/db/queries";

const NOW = Date.UTC(2026, 9, 5, 9);
let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

function user(id: string, trustLevel = 1, createdAt = 0): Actor {
  sqlite.prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, trust_level, username) VALUES (?, ?, ?, 1, ?, 0, ?, ?)`).run(id, id, `${id}@x`, createdAt, trustLevel, id);
  return { id, trustLevel: trustLevel as Actor["trustLevel"], createdAt, role: "user" };
}

function placeOf(): DirectoryPlace {
  const row = sqlite.prepare(`SELECT * FROM place WHERE id = 'p1'`).get() as Record<string, unknown>;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    timezone: row.timezone,
    calcMethod: row.calc_method,
    asrMadhab: row.asr_madhab,
    highLatRule: "twilightangle",
    iqamahSummaryJson: row.iqamah_summary_json,
    distanceKm: null,
  } as unknown as DirectoryPlace;
}

function month(times: Partial<Record<"fajr" | "dhuhr" | "asr" | "maghrib" | "isha", string>>) {
  return daysIn("2026-10").map((date) => ({ date, ...times }));
}

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at, status, address)
    VALUES ('p1', 'elm', 'East London Mosque', 'mosque', 51.5175, -0.0653, 'gcpvn0', 'GB', 'london', 'Europe/London', 'MoonsightingCommittee', 'hanafi', 0, 0, 'active', '82 Whitechapel Rd')`);
});

describe("reading timetables", () => {
  it("normalises board times using the prayer to place AM/PM", () => {
    expect(normalizeTime("5:45", "fajr")).toBe("05:45");
    expect(normalizeTime("1.15", "dhuhr")).toBe("13:15");
    expect(normalizeTime("12:30", "dhuhr")).toBe("12:30");
    expect(normalizeTime("4:30", "asr")).toBe("16:30");
    expect(normalizeTime("8:15 pm", "isha")).toBe("20:15");
    expect(normalizeTime("12:05 am", "isha")).toBe("00:05");
    expect(normalizeTime("19:02", "maghrib")).toBe("19:02");
    expect(normalizeTime("25:00", "fajr")).toBeNull();
    expect(normalizeTime("soon", "fajr")).toBeNull();
    expect(normalizeTime(null, "fajr")).toBeNull();
  });

  it("cleans a model's loose table into rows for the month", () => {
    const rows = cleanRows(
      [{ day: 1, fajr: "5:45", zuhr: "1:15", asr: "4:30", maghrib: "6:52", isha: "8:15" }, { date: "2026-10-02", fajr: "5:46" }, { day: 40 }, { day: 3, fajr: "??" }, "junk", { date: "2026-11-01", fajr: "5:00" }],
      "2026-10",
    );
    expect(rows).toEqual([
      { date: "2026-10-01", fajr: "05:45", dhuhr: "13:15", asr: "16:30", maghrib: "18:52", isha: "20:15" },
      { date: "2026-10-02", fajr: "05:46" },
    ]);
    expect(cleanRows("nope", "2026-10")).toEqual([]);
    expect(daysIn("2024-02")).toHaveLength(29);
  });

  it("validates import input", () => {
    expect(timetableInput.safeParse({ month: "2026-10", rows: [{ date: "2026-10-01", fajr: "05:45" }] }).success).toBe(true);
    expect(timetableInput.safeParse({ month: "2026-10", rows: [{ date: "2026-11-01", fajr: "05:45" }] }).success).toBe(false);
    expect(timetableInput.safeParse({ month: "2026-10", rows: [{ date: "2026-10-01" }, { date: "2026-10-01" }] }).success).toBe(false);
  });

  it("extracts through the mock, or reports why it can't", async () => {
    const store = new Map<string, string>();
    const env = {
      CACHE: { get: async (key: string) => store.get(key) ?? null } as unknown as KVNamespace,
      MEDIA: { get: async () => null } as unknown as R2Bucket,
    };
    expect(await extractTimetable(env, { photoId: "x", month: "2026-10", mocks: true })).toBe("unavailable");
    store.set("test:timetable:extract", JSON.stringify([{ day: 1, fajr: "5:45" }]));
    expect(await extractTimetable(env, { photoId: "x", month: "2026-10", mocks: true })).toEqual([{ date: "2026-10-01", fajr: "05:45" }]);
    const ai = { run: async () => ({ response: 'Here you go: [{"day":2,"isha":"8:00"}]' }) } as unknown as Ai;
    expect(await extractTimetable({ ...env, AI: ai }, { photoId: "x", month: "2026-10", mocks: false })).toBe("processing");
    const media = { get: async () => ({ arrayBuffer: async () => new Uint8Array([1, 2]).buffer }) } as unknown as R2Bucket;
    expect(await extractTimetable({ ...env, MEDIA: media, AI: ai }, { photoId: "x", month: "2026-10", mocks: false })).toEqual([{ date: "2026-10-02", isha: "20:00" }]);
    const broken = { run: async () => ({ response: "no table" }) } as unknown as Ai;
    expect(await extractTimetable({ ...env, MEDIA: media, AI: broken }, { photoId: "x", month: "2026-10", mocks: false })).toEqual([]);
    const throwing = { run: async () => Promise.reject(new Error("down")) } as unknown as Ai;
    expect(await extractTimetable({ ...env, MEDIA: media, AI: throwing }, { photoId: "x", month: "2026-10", mocks: false })).toBe("unavailable");
  });
});

describe("importing a month", () => {
  it("creates 31 × 5 dated values in batches, and the page shows the date's iqamah", async () => {
    const actor = user("imam", 1);
    const result = await importTimetable(d1, { actor, steward: false, placeId: "p1", month: "2026-10", rows: month({ fajr: "05:45", dhuhr: "13:15", asr: "16:00", maghrib: "18:25", isha: "20:00" }), photo: null, now: NOW });
    expect(result).toMatchObject({ values: 155, created: 155, confirmed: 0, replaced: 0 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM fact WHERE key LIKE 'timetable.%' AND current_candidate_id IS NOT NULL`).get()).toEqual({ n: 155 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM timetable_row`).get()).toEqual({ n: 155 });
    expect(sqlite.prepare(`SELECT type FROM activity`).get()).toEqual({ type: "timetable_imported" });
    const values = await monthValues(d1, "p1", "2026-10");
    expect(values.get("2026-10-17|isha")).toEqual({ time: "20:00", state: "unverified" });

    // The mosque page for 17 Oct uses the timetable's value.
    const place = placeOf();
    const day = getPrayerDay({ lat: place.lat, lng: place.lng, timeZone: place.timezone, method: place.calcMethod, madhab: "hanafi", highLat: "twilightangle", now: new Date(Date.UTC(2026, 9, 17, 9)) });
    const facts = await placeFacts(d1, "p1", "2026-10-17");
    expect(facts.filter((fact) => fact.key.startsWith("timetable.")).map((fact) => fact.qualifier)).toEqual(["2026-10-17", "2026-10-17", "2026-10-17", "2026-10-17", "2026-10-17"]);
    expect(iqamahCells(facts, day, NOW).isha).toMatchObject({ label: "8:00 PM", factKey: "timetable.isha" });
    // Cards read the summary window.
    const summary = JSON.parse(sqlite.prepare(`SELECT iqamah_summary_json AS s FROM place`).get()!.s as string) as { tt: Record<string, Record<string, string>> };
    expect(summary.tt["2026-10-05"]).toEqual({ fajr: "05:45", dhuhr: "13:15", asr: "16:00", maghrib: "18:25", isha: "20:00" });
  });

  it("re-imports confirm matching values and stewards replace differing ones", async () => {
    const first = user("first", 1);
    const second = user("second", 1);
    const steward = user("steward", 0);
    sqlite.exec(`INSERT INTO steward (id, place_id, user_id, status, evidence, created_at) VALUES ('s', 'p1', 'steward', 'approved', 'x', 0)`);
    sqlite.exec(`INSERT INTO photo (id, place_id, purpose, category, status, uploaded_by, created_at) VALUES ('ph', 'p1', 'evidence', 'timetable', 'approved', 'second', 0)`);
    const rows = [{ date: "2026-10-01", fajr: "05:45", isha: "20:00" }];
    await importTimetable(d1, { actor: first, steward: false, placeId: "p1", month: "2026-10", rows, photo: null, now: NOW });
    const again = await importTimetable(d1, { actor: second, steward: false, placeId: "p1", month: "2026-10", rows, photo: { id: "ph", approved: true }, now: NOW });
    expect(again).toMatchObject({ created: 0, confirmed: 2, replaced: 0 });
    expect(again.pending).toHaveLength(2);
    const changed = await importTimetable(d1, { actor: steward, steward: true, placeId: "p1", month: "2026-10", rows: [{ date: "2026-10-01", isha: "19:45" }], photo: null, now: NOW });
    expect(changed).toMatchObject({ replaced: 1 });
    expect((await monthValues(d1, "p1", "2026-10")).get("2026-10-01|isha")?.time).toBe("19:45");
    const other = await importTimetable(d1, { actor: second, steward: false, placeId: "p1", month: "2026-10", rows: [{ date: "2026-10-01", isha: "19:30" }], photo: null, now: NOW });
    expect(other).toMatchObject({ replaced: 0, confirmed: 0 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM fact_candidate WHERE value_json = '{"t":"19:30"}' AND status = 'candidate'`).get()).toEqual({ n: 1 });
    // A second person's vote on that candidate reuses it.
    await importTimetable(d1, { actor: first, steward: false, placeId: "p1", month: "2026-10", rows: [{ date: "2026-10-01", isha: "19:30" }], photo: null, now: NOW });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM fact_candidate WHERE value_json = '{"t":"19:30"}'`).get()).toEqual({ n: 1 });
    void castVote;
  });

  it("brand-new accounts' values wait for a second person", async () => {
    const fresh = user("fresh", 0, NOW - 1000);
    const result = await importTimetable(d1, { actor: fresh, steward: false, placeId: "p1", month: "2026-10", rows: [{ date: "2026-10-01", fajr: "05:45" }], photo: null, now: NOW });
    expect(result.created).toBe(1);
    expect(sqlite.prepare(`SELECT status FROM fact_candidate`).get()).toEqual({ status: expect.stringMatching(/^(candidate|current)$/) });
  });
});

describe("special prayers", () => {
  it("validates, stores, lists and finds Eid nearby", async () => {
    user("u1");
    expect(specialInput.safeParse({ kind: "taraweeh", date: "2027-02-20", endDate: "2027-02-10", start: "21:30" }).success).toBe(false);
    const eid = specialInput.parse({ kind: "eid_fitr", date: "2027-03-20", jamaahs: [{ time: "07:00", location: "Victoria Park" }, { time: "09:00", language: "English" }] });
    await addSpecialPrayer(d1, { userId: "u1", placeId: "p1", prayer: eid, now: NOW });
    await addSpecialPrayer(d1, { userId: "u1", placeId: "p1", prayer: specialInput.parse({ kind: "eid_fitr", date: "2027-03-20", jamaahs: [{ time: "07:30" }] }), now: NOW + 1 });
    await addSpecialPrayer(d1, { userId: "u1", placeId: "p1", prayer: specialInput.parse({ kind: "taraweeh", date: "2027-02-18", endDate: "2027-03-19", start: "21:30", rakahs: 8 }), now: NOW });
    const upcoming = await upcomingSpecial(d1, "p1", "2026-10-05");
    expect(upcoming.map((item) => [item.kind, item.lines])).toEqual([
      ["taraweeh", ["Starts 9:30 PM · 8 rakʿahs"]],
      ["eid_fitr", ["7:30 AM"]],
    ]);
    expect(specialDates(upcoming[0]!)).toBe("Thu 18 Feb – Fri 19 Mar");
    expect(describeSpecial("eid_adha", JSON.stringify([{ time: "07:00", location: "Park" }, { time: "08:30" }]))).toEqual(["1st jamā'ah 7:00 AM · Park", "2nd jamā'ah 8:30 AM"]);
    expect(describeSpecial("eid_adha", "broken")).toEqual([]);
    const near = await eidNear(d1, { lat: 51.52, lng: -0.07, today: "2026-10-05" });
    expect(near.map((item) => [item.placeSlug, item.kind])).toEqual([["elm", "eid_fitr"]]);
    expect(await eidNear(d1, { lat: 21.4, lng: 39.8, today: "2026-10-05" })).toEqual([]);
  });

  it("knows the Eid seasons", () => {
    expect(eidSeason(new Date(Date.UTC(2027, 2, 5)))).toBe(true);
    expect(eidSeason(new Date(Date.UTC(2027, 4, 16)))).toBe(true);
    expect(eidSeason(new Date(Date.UTC(2027, 2, 12)))).toBe(false);
    expect(eidSeason(new Date(Date.UTC(2026, 9, 5)))).toBe(false);
  });
});

describe("calendar feeds", () => {
  it("builds a valid iCalendar in the place's time zone, across a DST change", async () => {
    user("imam");
    await importTimetable(d1, { actor: user("board"), steward: false, placeId: "p1", month: "2026-10", rows: [{ date: "2026-10-20", isha: "19:55" }], photo: null, now: NOW });
    sqlite.exec(`UPDATE place SET iqamah_summary_json = '{"iqamah":{"fajr":{"v":{"t":"06:00"},"from":"2026-01-01","prev":null,"s":"verified","n":3,"at":1}},"jumuah":[]}'`);
    const fresh = placeOf();
    const timetable = new Map([["2026-10-20|isha", "19:55"]]);
    const text = calendar({ name: "ELM, iqamah", groups: [{ timeZone: fresh.timezone, events: placeEvents(fresh, NOW, 30, "https://mosques.world", timetable) }], now: NOW, days: 30 });
    const component = new ICAL.Component(ICAL.parse(text));
    const zone = component.getFirstSubcomponent("vtimezone");
    expect(zone?.getFirstPropertyValue("tzid")).toBe("Europe/London");
    expect(zone?.getAllSubcomponents("standard").length).toBeGreaterThanOrEqual(2);
    const events = component.getAllSubcomponents("vevent");
    expect(events).toHaveLength(31);
    const timezone = new ICAL.Timezone(zone!);
    const fajr = new ICAL.Event(events[0]!);
    fajr.startDate.zone = timezone;
    expect(fajr.summary).toBe("Fajr iqamah · East London Mosque");
    expect(fajr.startDate.toString()).toBe("2026-10-05T06:00:00");
    // 6:00 BST is 05:00 UTC; after the clocks go back (25 Oct) 6:00 GMT is 06:00 UTC.
    expect(fajr.startDate.toJSDate().toISOString()).toBe("2026-10-05T05:00:00.000Z");
    const late = new ICAL.Event(events.find((event) => new ICAL.Event(event).startDate.toString().startsWith("2026-10-30"))!);
    late.startDate.zone = timezone;
    expect(late.startDate.toJSDate().toISOString()).toBe("2026-10-30T06:00:00.000Z");
    expect(events.some((event) => new ICAL.Event(event).summary.startsWith("Isha"))).toBe(true);
    expect(text).toContain("X-WR-CALNAME:ELM\\, iqamah");
  });

  it("formats, folds and signs", async () => {
    expect(offsetMinutes("Asia/Kolkata", NOW)).toBe(330);
    expect(offsetMinutes("America/New_York", NOW)).toBe(-240);
    expect(vtimezone("Asia/Kolkata", NOW, NOW + 30 * 86_400_000)).toContain("TZOFFSETTO:+0530");
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const long = fold(`SUMMARY:${"x".repeat(200)}`);
    expect(long.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    const token = await feedToken("s", "u1");
    expect(await readFeedToken("s", token)).toBe("u1");
    expect(await readFeedToken("t", token)).toBeNull();
    expect(await readFeedToken("s", "bad")).toBeNull();
  });
});
