import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { castVote, submitValue, type Actor } from "@/lib/trust/store";
import { changeText, disputeText, isTimeKey } from "./notifications";
import { afterContribution, deliverPending, isDeliverMessage, kickDelivery, notificationMail, readUnsubscribeToken, unsubscribe, unsubscribeToken, weeklyDigestStatement } from "./notify";
import { decideStewardship, requestStewardship, StewardError, stewardCount, stewardQueue, stewardStatus } from "./stewards";

const NOW = Date.UTC(2026, 8, 25, 12);
let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];
const kv = new Map<string, string>();
const cache = {
  put: async (key: string, value: string) => void kv.set(key, value),
  get: async (key: string) => kv.get(key) ?? null,
} as unknown as KVNamespace;

function env(extra: Record<string, unknown> = {}) {
  return { DB: d1, CACHE: cache, EMAIL_SINK: "1", PUBLIC_BASE_URL: "https://preview.example", ...extra } as Parameters<typeof deliverPending>[0];
}

function user(id: string, trustLevel = 1): Actor {
  sqlite
    .prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, trust_level, username) VALUES (?, ?, ?, 1, 0, 0, ?, ?)`)
    .run(id, id, `${id}@example.com`, trustLevel, id);
  return { id, trustLevel: trustLevel as Actor["trustLevel"], createdAt: 0, role: "user" };
}

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  kv.clear();
  sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
    VALUES ('p1', 'elm', 'East London Mosque', 'mosque', 51.5, -0.06, 'gcpvn0', 'GB', 'london', 'Europe/London', 'MuslimWorldLeague', 'shafi', 0, 0)`);
});

describe("notification text", () => {
  it("describes changes and disputes", () => {
    expect(isTimeKey("iqamah.isha")).toBe(true);
    expect(isTimeKey("amenity.parking")).toBe(false);
    expect(changeText({ key: "iqamah.isha", qualifier: "", placeName: "ELM", before: { t: "20:45" }, after: { t: "20:30" } })).toEqual({
      title: "Isha iqamah changed at ELM",
      body: "Isha iqamah: 8:45 PM → 8:30 PM. Confirmed by the community.",
    });
    expect(disputeText({ key: "iqamah.fajr", qualifier: "", placeName: "ELM", challenger: { t: "05:30" } }).title).toBe("Fajr iqamah is disputed at ELM");
    expect(changeText({ key: "jumuah.jamaah", qualifier: "1", placeName: "ELM", before: null, after: null }).title).toContain("changed at ELM");
  });
});

describe("saved-place change notifications", () => {
  it("notifies savers (not the person who caused it) when a time is replaced, and delivers email once", async () => {
    const [a, b, c, d, saver] = [user("a"), user("b"), user("c"), user("d"), user("saver")];
    sqlite.exec(`INSERT INTO saved_place (user_id, place_id, created_at) VALUES ('saver', 'p1', 0), ('c', 'p1', 0)`);
    await submitValue(d1, { actor: a, placeId: "p1", key: "iqamah.isha", qualifier: "", value: { t: "20:45" }, effectiveFrom: "2026-01-01", source: "board", now: NOW });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM notification`).get()).toEqual({ n: 0 });
    const challenge = await submitValue(d1, { actor: b, placeId: "p1", key: "iqamah.isha", qualifier: "", value: { t: "20:30" }, effectiveFrom: "2026-01-01", source: "board", now: NOW });
    await castVote(d1, { actor: c, candidateId: challenge.candidateId, polarity: 1, source: "board", now: NOW });
    await castVote(d1, { actor: d, candidateId: challenge.candidateId, polarity: 1, source: "board", now: NOW });
    // d's confirm promoted the change: every other saver (c included) hears about it.
    const rows = sqlite.prepare(`SELECT user_id, topic, title, body, url FROM notification ORDER BY user_id`).all();
    const expected = { topic: "saved_changes", title: "Isha iqamah changed at East London Mosque", body: "Isha iqamah: 8:45 PM → 8:30 PM. Confirmed by the community.", url: "/m/elm" };
    expect(rows).toEqual([
      { user_id: "c", ...expected },
      { user_id: "saver", ...expected },
    ]);
    void saver;

    const sent = await deliverPending(env(), { host: "localhost", now: NOW });
    expect(sent).toEqual({ emails: 2, pushes: 0 });
    const mail = JSON.parse(kv.get("email:to:saver@example.com") ?? "{}") as { subject: string; text: string; headers: Record<string, string> };
    expect(mail.subject).toBe("Isha iqamah changed at East London Mosque");
    expect(mail.text).toContain("https://preview.example/m/elm?from=email");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sqlite.prepare(`SELECT DISTINCT email_status, push_status FROM notification`).all()).toEqual([{ email_status: "sent", push_status: "skipped" }]);
    expect(await deliverPending(env(), { host: "localhost", now: NOW })).toEqual({ emails: 0, pushes: 0 });
  });

  it("respects unsubscribes, skips deleted people and expires old rows", async () => {
    user("u1");
    user("u2");
    user("u3");
    sqlite.exec(`UPDATE user SET deleted_at = 1 WHERE id = 'u2'`);
    const insert = sqlite.prepare(`INSERT INTO notification (id, user_id, topic, title, body, url, created_at) VALUES (?, ?, 'saved_changes', 't', 'b', '/', ?)`);
    insert.run("n1", "u1", Date.now());
    insert.run("n2", "u2", Date.now());
    insert.run("n3", "u3", Date.now() - 4 * 24 * 60 * 60 * 1000);
    const token = await unsubscribeToken("mosques-world-local-development-secret-not-for-production", { userId: "u1", channel: "email", topic: "saved_changes" });
    expect(await unsubscribe(env(), token, "localhost")).toEqual({ userId: "u1", channel: "email", topic: "saved_changes" });
    await deliverPending(env(), { host: "localhost" });
    expect(sqlite.prepare(`SELECT id, email_status FROM notification ORDER BY id`).all()).toEqual([
      { id: "n1", email_status: "skipped" },
      { id: "n2", email_status: "skipped" },
      { id: "n3", email_status: "expired" },
    ]);
  });

  it("sends push to stored subscriptions when VAPID keys are set, dropping gone ones", async () => {
    user("p");
    sqlite.exec(`INSERT INTO notification (id, user_id, topic, title, body, url, email_status, created_at) VALUES ('n1', 'p', 'saved_changes', 't', 'b', '/', 'sent', ${Date.now()})`);
    // A real P-256 key pair so the payload can be built; the push service itself is mocked.
    const keys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
    const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
    const vapid = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
    const vapidPublic = b64(new Uint8Array(await crypto.subtle.exportKey("raw", vapid.publicKey)));
    const vapidPrivate = (await crypto.subtle.exportKey("jwk", vapid.privateKey)).d ?? "";
    sqlite
      .prepare(`INSERT INTO push_subscription (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, 'p', ?, ?, ?, 0)`)
      .run("s1", "https://push.example/ok", b64(raw), b64(crypto.getRandomValues(new Uint8Array(16))));
    sqlite
      .prepare(`INSERT INTO push_subscription (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, 'p', ?, ?, ?, 0)`)
      .run("s2", "https://push.example/gone", b64(raw), b64(crypto.getRandomValues(new Uint8Array(16))));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => new Response(null, { status: String(input).endsWith("gone") ? 410 : 201 }));
    const result = await deliverPending(env({ VAPID_PUBLIC_KEY: vapidPublic, VAPID_PRIVATE_KEY: vapidPrivate }), { host: "localhost" });
    fetchMock.mockRestore();
    expect(result.pushes).toBe(1);
    expect(sqlite.prepare(`SELECT id FROM push_subscription`).all()).toEqual([{ id: "s1" }]);
  });
});

describe("unsubscribe tokens", () => {
  it("round-trip and reject tampering", async () => {
    const secret = "s";
    const token = await unsubscribeToken(secret, { userId: "u1", channel: "push", topic: "digest" });
    expect(await readUnsubscribeToken(secret, token)).toEqual({ userId: "u1", channel: "push", topic: "digest" });
    expect(await readUnsubscribeToken("other", token)).toBeNull();
    expect(await readUnsubscribeToken(secret, `${token}x`)).toBeNull();
    expect(await readUnsubscribeToken(secret, "nodot")).toBeNull();
    expect(await readUnsubscribeToken(secret, "%%%.abc")).toBeNull();
    const bad = await unsubscribeToken(secret, { userId: "u1", channel: "email", topic: "saved_changes" });
    expect(await readUnsubscribeToken(secret, bad.replace(/^[^.]+/, Buffer.from("u1.fax.digest").toString("base64url")))).toBeNull();
    expect(await unsubscribe(env(), "nope.nope", "localhost")).toBeNull();
    await expect(unsubscribe(env(), "nope.nope", "mosques.world")).rejects.toThrow("BETTER_AUTH_SECRET");
  });

  it("builds emails with both unsubscribe routes", () => {
    const mail = notificationMail("a@b", { title: "T", body: "B", url: "https://x/m", unsubscribeUrl: "https://x/page", oneClickUrl: "https://x/api", topic: "digest" });
    expect(mail.headers?.["List-Unsubscribe"]).toBe("<https://x/api>");
    expect(mail.text).toContain("https://x/page");
  });
});

describe("delivery kick", () => {
  it("queues in production, delivers inline elsewhere, and does nothing when idle", async () => {
    const send = vi.fn(async () => undefined);
    const queued = env({ Q_RECOMPUTE: { send } as unknown as Queue });
    expect(await kickDelivery(queued, "mosques.world")).toBeNull();
    expect(send).not.toHaveBeenCalled();
    user("k");
    sqlite.exec(`INSERT INTO notification (id, user_id, topic, title, body, url, created_at) VALUES ('n', 'k', 'digest', 't', 'b', '/', ${Date.now()})`);
    await kickDelivery(queued, "mosques.world");
    expect(send).toHaveBeenCalledWith({ kind: "deliver" });
    expect(isDeliverMessage({ kind: "deliver" })).toBe(true);
    await afterContribution(queued, new Request("https://localhost/x"), true);
    expect(sqlite.prepare(`SELECT email_status FROM notification`).get()).toEqual({ email_status: "sent" });
    await afterContribution(queued, new Request("https://localhost/x"), false);
  });
});

describe("weekly digest", () => {
  it("goes to recent contributors once a week, naming places that need a check", async () => {
    user("busy");
    user("quiet");
    user("off");
    const now = NOW;
    sqlite.exec(`INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at) VALUES
      ('a1', 'busy', 'p1', 'confirmed', '{}', ${now - 1000}), ('a2', 'busy', 'p1', 'confirmed', '{}', ${now - 2000}),
      ('a3', 'off', 'p1', 'confirmed', '{}', ${now - 1000}), ('a4', 'quiet', 'p1', 'prayed', '{}', ${now - 1000})`);
    sqlite.exec(`INSERT INTO fact (id, place_id, key, qualifier, state, confidence, updated_at) VALUES ('f1', 'p1', 'iqamah.asr', '', 'stale', 0, 0)`);
    sqlite.exec(`INSERT INTO notification_pref (user_id, channel, topic, enabled, updated_at) VALUES ('off', 'email', 'digest', 0, 0)`);
    await weeklyDigestStatement(d1, now).run();
    await weeklyDigestStatement(d1, now + 1000).run();
    expect(sqlite.prepare(`SELECT user_id, body, push_status FROM notification WHERE topic = 'digest'`).all()).toEqual([
      { user_id: "busy", body: "You confirmed 2 times this week. These places you know need a check: East London Mosque.", push_status: "skipped" },
    ]);
  });
});

describe("stewards", () => {
  it("requests, approvals and the dashboard queue", async () => {
    const [mod, steward, author, challenger] = [user("mod", 3), user("steward", 0), user("author", 0), user("challenger", 0)];
    const request = { role: "committee" as const, evidence: "I set the timetable every month for the committee." };
    const id = await requestStewardship(d1, { userId: steward.id, placeId: "p1", request, now: NOW });
    await expect(requestStewardship(d1, { userId: steward.id, placeId: "p1", request, now: NOW })).rejects.toThrow("waiting");
    expect(await stewardStatus(d1, "p1", steward.id)).toBe("requested");
    await decideStewardship(d1, { id, moderatorId: mod.id, action: "approve", now: NOW });
    await expect(decideStewardship(d1, { id, moderatorId: mod.id, action: "approve", now: NOW })).rejects.toBeInstanceOf(StewardError);
    await expect(requestStewardship(d1, { userId: steward.id, placeId: "p1", request, now: NOW })).rejects.toThrow("already");
    expect(await stewardCount(d1, "p1")).toBe(1);
    expect(sqlite.prepare(`SELECT title FROM notification WHERE user_id = 'steward'`).get()).toEqual({ title: "You now look after East London Mosque" });

    // Acceptance 2: an L0 value needed two more L0 confirms; one steward confirm verifies it.
    const first = await submitValue(d1, { actor: author, placeId: "p1", key: "iqamah.asr", qualifier: "", value: { t: "16:45" }, effectiveFrom: "2026-01-01", source: "observed", now: NOW });
    expect(first.state).toBe("unverified");
    const confirmed = await castVote(d1, { actor: steward, candidateId: first.candidateId, polarity: 1, source: "imam", now: NOW });
    expect(confirmed.state).toBe("verified");

    // A dispute alerts the steward and shows on their dashboard.
    await submitValue(d1, { actor: author, placeId: "p1", key: "iqamah.fajr", qualifier: "", value: { t: "05:45" }, effectiveFrom: "2026-01-01", source: "observed", now: NOW });
    const other = await submitValue(d1, { actor: challenger, placeId: "p1", key: "iqamah.fajr", qualifier: "", value: { t: "06:00" }, effectiveFrom: "2026-01-01", source: "board", now: NOW });
    await castVote(d1, { actor: user("second", 0), candidateId: other.candidateId, polarity: 1, source: "board", now: NOW });
    expect(sqlite.prepare(`SELECT title FROM notification WHERE user_id = 'steward' ORDER BY rowid`).all()).toEqual([
      { title: "You now look after East London Mosque" },
      { title: "Fajr iqamah is disputed at East London Mosque" },
    ]);
    const queue = await stewardQueue(d1, steward.id);
    expect(queue[0]?.items.map((item) => [item.kind, item.key, item.detail])).toEqual([["dispute", "iqamah.fajr", "5:45 AM or 6:00 AM?"]]);
    expect(await stewardQueue(d1, steward.id, "elm")).toHaveLength(1);
    expect(await stewardQueue(d1, "author")).toEqual([]);

    await decideStewardship(d1, { id, moderatorId: mod.id, action: "revoke", now: NOW });
    await expect(requestStewardship(d1, { userId: steward.id, placeId: "p1", request, now: NOW + 1000 })).rejects.toThrow("30 days");
    await expect(decideStewardship(d1, { id: "missing", moderatorId: mod.id, action: "approve", now: NOW })).rejects.toThrow("not found");
  });

  it("caps open requests per person", async () => {
    user("eager");
    for (let index = 0; index < 5; index += 1) {
      sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
        VALUES ('x${index}', 'x${index}', 'X', 'mosque', 0, 0, 's00000', 'GB', 'london', 'Europe/London', 'MuslimWorldLeague', 'shafi', 0, 0)`);
      await requestStewardship(d1, { userId: "eager", placeId: `x${index}`, request: { role: "volunteer", evidence: "I volunteer here every single week." }, now: NOW });
    }
    await expect(requestStewardship(d1, { userId: "eager", placeId: "p1", request: { role: "volunteer", evidence: "I volunteer here every single week." }, now: NOW })).rejects.toMatchObject({ status: 429 });
  });
});
