import { beforeEach, describe, expect, it } from "vitest";
import type { PrayerDay } from "@/lib/prayer/times";
import { createTestD1 } from "@/lib/testing/d1";
import type { FactView, FactValueView } from "@/lib/trust/read";
import { placeFacts } from "@/lib/trust/read";
import { submitValue, type Actor } from "@/lib/trust/store";
import { applyAnswer, chooseQuestions, placesWithin, verifyAnswer } from "./verify";

const NOW = Date.UTC(2026, 8, 25, 12);
const DAY: PrayerDay = {
  date: "2026-09-25",
  hijri: "",
  timezone: "Europe/London",
  jumuah: false,
  nextKey: "asr",
  rows: [
    { key: "fajr", label: "Fajr", adhan: "05:22", at: "" },
    { key: "sunrise", label: "Sunrise", adhan: "06:56", at: "" },
    { key: "dhuhr", label: "Dhuhr", adhan: "12:56", at: "" },
    { key: "asr", label: "Asr", adhan: "16:30", at: "" },
    { key: "maghrib", label: "Maghrib", adhan: "18:48", at: "" },
    { key: "isha", label: "Isha", adhan: "20:03", at: "" },
  ],
};

function value(id: string, v: unknown, extra: Partial<FactValueView> = {}): FactValueView {
  return {
    candidateId: id,
    value: v,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    status: "current",
    score: 2,
    backers: 1,
    disputes: 0,
    lastConfirmedAt: 1,
    createdAt: 1,
    author: "@a",
    ...extra,
  };
}

function fact(key: string, state: FactView["state"], current: FactValueView | null, challenger: FactValueView | null = null): FactView {
  return { factId: key, key, qualifier: "", state, current, shown: current, challenger };
}

describe("chooseQuestions", () => {
  it("asks about disputes first, then stale and unverified times, then amenities, then a photo", () => {
    const facts = [
      fact("iqamah.asr", "unverified", value("asr", { t: "16:45" })),
      fact("iqamah.fajr", "stale", value("fajr", { t: "05:45" }, { lastConfirmedAt: 5 })),
      fact("iqamah.isha", "disputed", value("isha", { t: "20:45" }), value("isha2", { t: "20:30" }, { status: "candidate", backers: 3 })),
      fact("amenity.women_section", "verified", value("w", { v: true })),
    ];
    const questions = chooseQuestions({ facts, day: DAY, myVotes: {}, hasRecentTimetablePhoto: false, limit: 10 });
    expect(questions.map((question) => question.id)).toEqual([
      "dispute:iqamah.isha",
      "stale:iqamah.fajr",
      "unverified:iqamah.asr",
      "amenity:amenity.wudhu_men",
      "amenity:amenity.wudhu_women",
      "amenity:amenity.step_free",
      "amenity:amenity.toilets",
      "photo:timetable",
    ]);
    const dispute = questions[0];
    expect(`${dispute?.before}${dispute?.highlight}${dispute?.after}`).toBe("Is Isha iqamah now 8:30 PM?");
    expect(dispute?.context).toBe("3 people reported a change");
    expect(dispute?.options.map((option) => option.label)).toEqual(["Yes, it's 8:30", "No, still 8:45", "It's something else"]);
    expect(dispute?.options[0]?.answer).toEqual({ kind: "vote", candidateId: "isha2", polarity: 1 });
    expect(questions[1]?.highlight).toBe("5:45 AM");
    expect(chooseQuestions({ facts, day: DAY, myVotes: {}, hasRecentTimetablePhoto: true })).toHaveLength(3);
  });

  it("skips what this person already answered and values it cannot phrase", () => {
    const facts = [
      fact("iqamah.isha", "disputed", value("isha", { t: "20:45" }), value("isha2", { t: "20:30" }, { status: "candidate" })),
      fact("iqamah.maghrib", "unverified", value("m", { nonsense: true })),
      fact("iqamah.dhuhr", "unverified", value("d", { rule: "after_adhan", min: 10 })),
    ];
    const questions = chooseQuestions({ facts, day: DAY, myVotes: { isha2: 1, d: 1 }, hasRecentTimetablePhoto: true });
    expect(questions.map((question) => question.id)).toEqual(["amenity:amenity.women_section", "amenity:amenity.wudhu_men", "amenity:amenity.wudhu_women"]);
    const stale = chooseQuestions({ facts: [facts[2] as FactView], day: DAY, myVotes: {}, hasRecentTimetablePhoto: true });
    expect(stale[0]?.highlight).toBe("1:06 PM");
  });
});

describe("verify answers", () => {
  let d1: D1Database;
  let sqlite: ReturnType<typeof createTestD1>["sqlite"];
  const actor = (id: string): Actor => {
    sqlite.prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, trust_level) VALUES (?, ?, ?, 1, 0, 0, 1)`).run(id, id, `${id}@x`);
    return { id, trustLevel: 1, createdAt: 0, role: "user" };
  };

  beforeEach(() => {
    ({ d1, sqlite } = createTestD1());
    for (const [id, lat] of [
      ["near", 51.5],
      ["close", 51.5009],
      ["far", 51.51],
    ] as const) {
      sqlite
        .prepare(
          `INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
           VALUES (?, ?, ?, 'mosque', ?, -0.1, 'gcpvj0', 'GB', 'london', 'Europe/London', 'MuslimWorldLeague', 'shafi', 0, 0)`,
        )
        .run(id, id, id, lat);
    }
  });

  it("finds places within 150 m, nearest first", async () => {
    const places = await placesWithin(d1, 51.5001, -0.1);
    expect(places.map((place) => [place.id, place.distanceM])).toEqual([
      ["near", 11],
      ["close", 89],
    ]);
  });

  it("stores geo-verified votes and values, and refuses candidates from other places", async () => {
    const author = actor("author");
    const visitor = actor("visitor");
    await submitValue(d1, { actor: author, placeId: "near", key: "iqamah.asr", qualifier: "", value: { t: "16:45" }, effectiveFrom: "2026-01-01", source: "board", now: NOW });
    const asr = (await placeFacts(d1, "near", "2026-09-25"))[0]?.current?.candidateId ?? "";
    await applyAnswer(d1, { actor: visitor, placeId: "near", answer: { kind: "vote", candidateId: asr, polarity: 1 }, today: "2026-09-25", now: NOW });
    await applyAnswer(d1, { actor: visitor, placeId: "near", answer: { kind: "value", key: "amenity.toilets", value: { v: true } }, today: "2026-09-25", now: NOW });
    expect(sqlite.prepare(`SELECT geo_verified, weight FROM vote WHERE user_id = 'visitor' ORDER BY created_at`).all()).toEqual([
      { geo_verified: 1, weight: 2.25 },
      { geo_verified: 1, weight: 2.25 },
    ]);
    await expect(
      applyAnswer(d1, { actor: visitor, placeId: "close", answer: { kind: "vote", candidateId: asr, polarity: 1 }, today: "2026-09-25", now: NOW }),
    ).rejects.toThrow("another place");
  });

  it("only accepts amenity keys as values", () => {
    expect(verifyAnswer.safeParse({ kind: "value", key: "amenity.parking", value: { v: false } }).success).toBe(true);
    expect(verifyAnswer.safeParse({ kind: "value", key: "iqamah.asr", value: { v: false } }).success).toBe(false);
  });
});
