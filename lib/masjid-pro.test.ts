import { describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import {
  applyPolarDelivery,
  approvedSteward,
  cleanNotice,
  donationHref,
  embedSnippet,
  entitled,
  formatCountdown,
  lobbyTheme,
  nextCongregation,
  normalizeBoard,
  normalizeProTimes,
  parsePolarDelivery,
  proTimesDecision,
  proTimesInput,
  readPublicBoard,
  reloadDelay,
  saveBoard,
  setProForTest,
} from "./masjid-pro";

const NOW = Date.parse("2026-11-09T12:00:00Z");

function place(db: ReturnType<typeof createTestD1>) {
  db.sqlite
    .prepare(
      `INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, verification_state, created_at, updated_at)
       VALUES ('p1', 'elm', 'East London Mosque', 'mosque', 51.5, -0.06, 'gcpvjh', 'GB', 'london', 'Europe/London', 'MoonsightingCommittee', 'hanafi', 'none', 0, 0)`,
    )
    .run();
  db.sqlite.prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'A', 'a@x', 1, 0, 0)`).run();
}

function delivery(over: Record<string, unknown> = {}) {
  return parsePolarDelivery(
    "evt_1",
    {
      type: "subscription.active",
      timestamp: "2026-11-09T12:00:00Z",
      data: {
        id: "sub_1",
        status: "active",
        product_id: "prod_year",
        customer_id: "cus_1",
        current_period_end: "2027-11-09T12:00:00Z",
        recurring_interval: "year",
        metadata: { place_id: "p1", user_id: "u1", interval: "year" },
        ...over,
      },
    },
    NOW,
  )!;
}

describe("entitlement and board input", () => {
  it("keeps a canceled subscription until the period ends, and not after", () => {
    expect(entitled("active", null, NOW)).toBe(true);
    expect(entitled("canceled", NOW + 1000, NOW)).toBe(true);
    expect(entitled("canceled", NOW - 1, NOW)).toBe(false);
    expect(entitled("canceled", null, NOW)).toBe(false);
    expect(entitled("past_due", NOW + 1000, NOW)).toBe(false);
    expect(entitled("revoked", NOW + 1000, NOW)).toBe(false);
  });

  it("accepts a public https donation link and a short notice, and refuses the rest", () => {
    expect(donationHref(" https://give.example.org/elm ")).toBe("https://give.example.org/elm");
    expect(donationHref("http://give.example.org/elm")).toBeNull();
    expect(donationHref("https://user:pass@give.example.org/elm")).toBeNull();
    expect(donationHref("https://127.0.0.1/give")).toBeNull();
    expect(donationHref("https://10.1.2.3/give")).toBeNull();
    expect(donationHref("https://192.168.0.8/give")).toBeNull();
    expect(donationHref("javascript:alert(1)")).toBeNull();
    expect(cleanNotice("  Janazah after Asr.  ")).toEqual({ ok: true, notice: "Janazah after Asr." });
    expect(cleanNotice("   ")).toEqual({ ok: true, notice: null });
    expect(cleanNotice("x".repeat(181)).ok).toBe(false);
    expect(cleanNotice("line\nbreak").ok).toBe(false);
    const board = normalizeBoard({ donationUrl: "https://give.example.org/elm", donationLabel: "Give", notice: "Sisters' entrance on the left." });
    expect(board.ok && board.patch).toEqual({
      donationUrl: "https://give.example.org/elm",
      donationLabel: "Give",
      notice: "Sisters' entrance on the left.",
    });
    expect(normalizeBoard({ donationUrl: "http://give.example.org" }).ok).toBe(false);
    expect(normalizeBoard({}).ok).toBe(false);
  });

  it("picks the next congregation and skips sunrise", () => {
    const rows = [
      { key: "fajr", at: "2026-11-09T05:30:00Z" },
      { key: "sunrise", at: "2026-11-09T07:00:00Z" },
      { key: "dhuhr", at: "2026-11-09T12:00:00Z" },
    ];
    expect(nextCongregation(rows, { fajr: "2026-11-09T05:45:00Z" }, Date.parse("2026-11-09T05:40:00Z"))).toEqual({
      key: "fajr",
      at: "2026-11-09T05:45:00Z",
      iqamah: true,
    });
    expect(nextCongregation(rows, {}, Date.parse("2026-11-09T06:00:00Z"))).toMatchObject({ key: "dhuhr", iqamah: false });
  });

  it("reloads at the next congregation and never waits more than half an hour", () => {
    expect(reloadDelay(NOW + 10 * 60_000, NOW)).toBe(10 * 60_000 + 1500);
    expect(reloadDelay(NOW + 1000, NOW)).toBe(60_000);
    expect(reloadDelay(NOW + 2 * 60 * 60_000, NOW)).toBe(30 * 60_000);
    expect(reloadDelay(null, NOW)).toBe(30 * 60_000);
  });

  it("formats a countdown without a leading zero on the minutes", () => {
    expect(formatCountdown(4_000)).toBe("0:04");
    expect(formatCountdown(5 * 60_000 + 4_000)).toBe("5:04");
    expect(formatCountdown(60 * 60_000 + 5 * 60_000 + 4_000)).toBe("1:05:04");
    expect(formatCountdown(-1)).toBe("0:00");
    expect(lobbyTheme("light")).toBe("light");
    expect(lobbyTheme("dark")).toBe("dark");
    expect(lobbyTheme(undefined)).toBe("dark");
    expect(lobbyTheme("nope")).toBe("dark");
  });

  it("builds an embed snippet from the site origin", () => {
    expect(embedSnippet("https://mosques.world/", "elm")).toContain('src="https://mosques.world/m/elm/widget"');
  });
});

describe("parsePolarDelivery", () => {
  it("reads a subscription and a paid checkout, and ignores anything else", () => {
    const parsed = delivery();
    expect(parsed.status).toBe("active");
    expect(parsed.placeId).toBe("p1");
    expect(parsed.interval).toBe("year");
    expect(parsed.periodEnd).toBe(Date.parse("2027-11-09T12:00:00Z"));
    const checkout = parsePolarDelivery("evt_c", { type: "checkout.updated", data: { status: "succeeded", product_id: "prod_year", metadata: { place_id: "p1" } } }, NOW);
    expect(checkout?.status).toBe("active");
    expect(parsePolarDelivery("evt_o", { type: "checkout.updated", data: { status: "open", product_id: "prod_year" } }, NOW)).toBeNull();
    expect(parsePolarDelivery("evt_x", { type: "order.paid", data: { id: "o" } }, NOW)).toBeNull();
    const revoked = parsePolarDelivery("evt_r", { type: "subscription.revoked", data: { id: "sub_1", product_id: "prod_year", metadata: { place_id: "p1" } } }, NOW);
    expect(revoked?.status).toBe("revoked");
  });
});

describe("applyPolarDelivery", () => {
  it("activates the mosque once, keeps the notice, ignores other products, and drops older events", async () => {
    const db = createTestD1();
    place(db);
    const first = delivery();
    expect(await applyPolarDelivery(db.d1, first, ["prod_year"])).toBe("applied");
    expect(await readPublicBoard(db.d1, "p1", NOW)).toEqual({ notice: null, donationUrl: null, donationLabel: null });
    await saveBoard(db.d1, "p1", { notice: "Janazah after Asr." }, NOW);
    expect((await readPublicBoard(db.d1, "p1", NOW))?.notice).toBe("Janazah after Asr.");

    expect(await applyPolarDelivery(db.d1, first, ["prod_year"])).toBe("duplicate");
    expect((await readPublicBoard(db.d1, "p1", NOW))?.notice).toBe("Janazah after Asr.");

    const other = parsePolarDelivery("evt_other", { type: "subscription.active", data: { id: "sub_2", status: "active", product_id: "prod_other", metadata: { place_id: "p1" } } }, NOW)!;
    expect(await applyPolarDelivery(db.d1, other, ["prod_year"])).toBe("ignored");
    expect((await readPublicBoard(db.d1, "p1", NOW))?.notice).toBe("Janazah after Asr.");

    const older = { ...delivery({ status: "revoked" }), webhookId: "evt_old", at: NOW - 60_000, status: "revoked" as const };
    expect(await applyPolarDelivery(db.d1, older, ["prod_year"])).toBe("applied");
    expect(await readPublicBoard(db.d1, "p1", NOW)).not.toBeNull();

    const ended = { ...delivery(), webhookId: "evt_end", at: NOW + 1000, status: "revoked" as const, periodEnd: NOW - 1 };
    expect(await applyPolarDelivery(db.d1, ended, ["prod_year"])).toBe("applied");
    expect(await readPublicBoard(db.d1, "p1", NOW)).toBeNull();
  });

  it("follows a later event that only carries the subscription id", async () => {
    const db = createTestD1();
    place(db);
    await applyPolarDelivery(db.d1, delivery(), ["prod_year"]);
    const later = parsePolarDelivery("evt_2", { type: "subscription.updated", timestamp: "2026-11-10T12:00:00Z", data: { id: "sub_1", status: "past_due", product_id: "prod_year" } }, NOW)!;
    expect(later.placeId).toBeNull();
    expect(await applyPolarDelivery(db.d1, later, ["prod_year"])).toBe("applied");
    expect(await readPublicBoard(db.d1, "p1", NOW)).toBeNull();
  });

  it("does not grant a place that is not public", async () => {
    const db = createTestD1();
    place(db);
    db.sqlite.prepare(`UPDATE place SET status = 'pending' WHERE id = 'p1'`).run();
    expect(await applyPolarDelivery(db.d1, delivery(), ["prod_year"])).toBe("ignored");
    expect(await readPublicBoard(db.d1, "p1", NOW)).toBeNull();
  });
});

describe("steward iqamah permissions", () => {
  it("allows an approved steward only while Masjid Pro is in force", () => {
    expect(proTimesDecision({ approved: true, entitled: true })).toEqual({ ok: true });
    expect(proTimesDecision({ approved: false, entitled: true })).toEqual({
      ok: false,
      status: 403,
      error: "Only an approved steward of this mosque can set iqamah times.",
    });
    expect(proTimesDecision({ approved: true, entitled: false })).toEqual({
      ok: false,
      status: 402,
      error: "Masjid Pro is not active for this mosque.",
    });
    // A stranger is refused before the subscription is mentioned.
    const stranger = proTimesDecision({ approved: false, entitled: false });
    expect(stranger.ok).toBe(false);
    if (!stranger.ok) expect(stranger.status).toBe(403);
  });

  it("accepts a fixed time, minutes after adhan, and Jumu'ah, and refuses the rest", () => {
    const parsed = proTimesInput.parse({
      prayers: [
        { prayer: "fajr", mode: "fixed", time: "05:40" },
        { prayer: "maghrib", mode: "offset", minutes: 10 },
      ],
      jumuah: [{ slot: 1, time: "13:15", khutbah: "12:55" }, { slot: 2, time: "14:00", khutbah: null }],
    });
    expect(normalizeProTimes(parsed)).toEqual({
      ok: true,
      changes: [
        { key: "iqamah.fajr", qualifier: "", value: { t: "05:40" } },
        { key: "iqamah.maghrib", qualifier: "", value: { rule: "after_adhan", min: 10 } },
        { key: "jumuah.jamaah", qualifier: "1", value: { t: "13:15", khutbah: "12:55" } },
        { key: "jumuah.jamaah", qualifier: "2", value: { t: "14:00" } },
      ],
    });
    expect(normalizeProTimes(proTimesInput.parse({ prayers: [{ prayer: "asr", mode: "fixed" }] })).ok).toBe(false);
    expect(normalizeProTimes(proTimesInput.parse({ prayers: [{ prayer: "asr", mode: "offset" }] })).ok).toBe(false);
    expect(normalizeProTimes(proTimesInput.parse({ prayers: [], jumuah: [] })).ok).toBe(false);
    expect(
      normalizeProTimes(
        proTimesInput.parse({
          prayers: [
            { prayer: "fajr", mode: "fixed", time: "05:40" },
            { prayer: "fajr", mode: "fixed", time: "05:50" },
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(
      normalizeProTimes(
        proTimesInput.parse({
          jumuah: [
            { slot: 1, time: "13:15" },
            { slot: 1, time: "13:30" },
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(proTimesInput.safeParse({ prayers: [{ prayer: "fajr", mode: "offset", minutes: 91 }] }).success).toBe(false);
    expect(proTimesInput.safeParse({ prayers: [{ prayer: "fajr", mode: "fixed", time: "5:40" }] }).success).toBe(false);
    expect(proTimesInput.safeParse({ jumuah: [{ slot: 7, time: "13:15" }] }).success).toBe(false);
    expect(proTimesInput.safeParse({ prayers: [{ prayer: "sunrise", mode: "fixed", time: "06:00" }] }).success).toBe(false);
  });
});

describe("stewards and the test grant", () => {
  it("lets an approved steward save the board on an active subscription", async () => {
    const db = createTestD1();
    place(db);
    expect(await approvedSteward(db.d1, "p1", "u1")).toBe(false);
    db.sqlite
      .prepare(`INSERT INTO steward (id, place_id, user_id, role, status, evidence, created_at) VALUES ('s1', 'p1', 'u1', 'steward', 'requested', 'committee', 0)`)
      .run();
    expect(await approvedSteward(db.d1, "p1", "u1")).toBe(false);
    db.sqlite.prepare(`UPDATE steward SET status = 'approved' WHERE id = 's1'`).run();
    expect(await approvedSteward(db.d1, "p1", "u1")).toBe(true);
    expect(await saveBoard(db.d1, "p1", { notice: "No" }, NOW)).toBe(false);
    await setProForTest(db.d1, { placeId: "p1", active: true, notice: "Class cancelled tonight.", donationUrl: "https://give.example.org/elm", donationLabel: "Give", userId: "u1", now: NOW });
    expect((await readPublicBoard(db.d1, "p1", NOW))?.notice).toBe("Class cancelled tonight.");
    expect(await saveBoard(db.d1, "p1", { notice: null }, NOW)).toBe(true);
    expect((await readPublicBoard(db.d1, "p1", NOW))?.notice).toBeNull();
    expect((await readPublicBoard(db.d1, "p1", NOW))?.donationUrl).toBe("https://give.example.org/elm");
  });
});
