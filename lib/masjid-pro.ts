import { z } from "zod";
import type { PolarInterval } from "@/lib/polar";
import { IQAMAH_PRAYERS, type IqamahPrayer } from "@/lib/trust/facts";

/**
 * Masjid Pro: a committee subscription for one mosque. The directory stays free. The committee
 * pays for a lobby screen, an embeddable widget, one notice, and a link out to give. We never
 * take the donation.
 */

export const MASJID_PRO_PRICES = {
  month: { usd: 19, label: "$19 a month" },
  year: { usd: 180, label: "$180 a year" },
} as const;

export const NOTICE_MAX = 180;
export const LABEL_MAX = 32;

const PRO_STATUSES = ["inactive", "active", "past_due", "canceled", "revoked"] as const;
export type ProStatus = (typeof PRO_STATUSES)[number];

export function entitled(status: string, periodEnd: number | null, now: number): boolean {
  if (status === "active") return true;
  return status === "canceled" && periodEnd != null && periodEnd > now;
}

function blockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (bare === "::1" || bare.startsWith("fe80:") || bare.startsWith("fc") || bare.startsWith("fd")) return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a = 0, b = 0] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** https link the committee already uses. Nothing is fetched from it. */
export function donationHref(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (blockedHost(url.hostname) || url.href.length > 500) return null;
  return url.href;
}

function noControls(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

export function cleanNotice(value: string | null): { ok: true; notice: string | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, notice: null };
  const notice = value.trim();
  if (!notice) return { ok: true, notice: null };
  if (notice.length > NOTICE_MAX) return { ok: false, error: `Keep the notice to ${NOTICE_MAX} characters.` };
  if (!noControls(notice)) return { ok: false, error: "The notice has a character the screen cannot show." };
  return { ok: true, notice };
}

export function cleanLabel(value: string | null): { ok: true; label: string | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, label: null };
  const label = value.trim();
  if (!label) return { ok: true, label: null };
  if (label.length > LABEL_MAX || !noControls(label) || /[<>]/.test(label)) {
    return { ok: false, error: `Keep the donation label to ${LABEL_MAX} letters.` };
  }
  return { ok: true, label };
}

export const boardInput = z
  .object({
    notice: z.string().max(400).nullable().optional(),
    donationUrl: z.string().max(500).nullable().optional(),
    donationLabel: z.string().max(40).nullable().optional(),
  })
  .refine((value) => value.notice !== undefined || value.donationUrl !== undefined || value.donationLabel !== undefined, {
    message: "Nothing to save.",
  });

export type BoardPatch = { notice?: string | null; donationUrl?: string | null; donationLabel?: string | null };

/** Validates a partial board edit. A donation link must be https and public. */
export function normalizeBoard(input: z.infer<typeof boardInput>): { ok: true; patch: BoardPatch } | { ok: false; error: string } {
  const patch: BoardPatch = {};
  if (input.notice !== undefined) {
    const notice = cleanNotice(input.notice);
    if (!notice.ok) return notice;
    patch.notice = notice.notice;
  }
  if (input.donationUrl !== undefined) {
    if (input.donationUrl === null || input.donationUrl.trim() === "") patch.donationUrl = null;
    else {
      const href = donationHref(input.donationUrl);
      if (!href) return { ok: false, error: "The donation link has to be an https address on the public web." };
      patch.donationUrl = href;
    }
  }
  if (input.donationLabel !== undefined) {
    const label = cleanLabel(input.donationLabel);
    if (!label.ok) return label;
    patch.donationLabel = label.label;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to save." };
  return { ok: true, patch };
}

export const checkoutInput = z.object({ interval: z.enum(["month", "year"]) });

/**
 * The next congregation: the soonest iqamah still ahead, or that prayer's adhan when iqamah
 * is unknown. Sunrise is not a congregation. After isha, tomorrow's fajr (already on the row) wins.
 */
export function nextCongregation(
  rows: { key: string; at: string }[],
  iqamahAt: Partial<Record<string, string>>,
  now: number,
): { key: string; at: string; iqamah: boolean } | null {
  let best: { key: string; at: string; time: number; iqamah: boolean } | null = null;
  for (const row of rows) {
    if (row.key === "sunrise") continue;
    const listed = iqamahAt[row.key];
    const at = listed ?? row.at;
    const time = new Date(at).getTime();
    if (!Number.isFinite(time) || time <= now) continue;
    if (!best || time < best.time) best = { key: row.key, at, time, iqamah: Boolean(listed) };
  }
  if (best) return { key: best.key, at: best.at, iqamah: best.iqamah };
  const fajr = rows.find((row) => row.key === "fajr");
  return fajr ? { key: fajr.key, at: fajr.at, iqamah: Boolean(iqamahAt.fajr) } : null;
}

/** How long the lobby waits before reloading. At the next congregation, and never longer than 30 minutes. */
export function reloadDelay(reloadAt: number | null, now: number): number {
  const next = reloadAt ?? now + 30 * 60_000;
  return Math.min(Math.max(next - now + 1500, 60_000), 30 * 60_000);
}

/** Remaining time on the lobby clock: `5:04`, or `1:05:04` once it is an hour or more. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

/** `?theme=light` is the light board. Anything else, including a missing value, stays dark. */
export function lobbyTheme(value: string | null | undefined): "dark" | "light" {
  return value === "light" ? "light" : "dark";
}

const PRAYER_LABEL: Record<IqamahPrayer, string> = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 13:15.");

export const proTimesInput = z.object({
  prayers: z
    .array(
      z.object({
        prayer: z.enum(IQAMAH_PRAYERS),
        mode: z.enum(["fixed", "offset"]),
        time: clockTime.optional(),
        minutes: z.number().int().min(0).max(90).optional(),
      }),
    )
    .max(5)
    .default([]),
  jumuah: z
    .array(
      z.object({
        slot: z.number().int().min(1).max(6),
        time: clockTime,
        khutbah: clockTime.nullable().optional(),
      }),
    )
    .max(6)
    .default([]),
});

export type ProTimeChange = { key: string; qualifier: string; value: { t: string } | { t: string; khutbah: string } | { rule: "after_adhan"; min: number } };

/**
 * An approved steward of a mosque with Masjid Pro in force. Anyone else is refused before a time is written.
 * Steward is checked first, so a stranger does not learn whether the mosque subscribes.
 */
export function proTimesDecision(input: { approved: boolean; entitled: boolean }): { ok: true } | { ok: false; status: 403 | 402; error: string } {
  if (!input.approved) return { ok: false, status: 403, error: "Only an approved steward of this mosque can set iqamah times." };
  if (!input.entitled) return { ok: false, status: 402, error: "Masjid Pro is not active for this mosque." };
  return { ok: true };
}

/** Turns a steward's form into fact changes. Fixed clock times and minutes after adhan are the only two shapes. */
export function normalizeProTimes(input: z.infer<typeof proTimesInput>): { ok: true; changes: ProTimeChange[] } | { ok: false; error: string } {
  const changes: ProTimeChange[] = [];
  const seen = new Set<string>();
  for (const prayer of input.prayers) {
    const label = PRAYER_LABEL[prayer.prayer];
    if (seen.has(prayer.prayer)) return { ok: false, error: `${label} was sent twice.` };
    seen.add(prayer.prayer);
    if (prayer.mode === "fixed") {
      if (!prayer.time) return { ok: false, error: `Enter a clock time for ${label}.` };
      changes.push({ key: `iqamah.${prayer.prayer}`, qualifier: "", value: { t: prayer.time } });
    } else if (prayer.minutes === undefined) {
      return { ok: false, error: `Enter the minutes after adhan for ${label}.` };
    } else {
      changes.push({ key: `iqamah.${prayer.prayer}`, qualifier: "", value: { rule: "after_adhan", min: prayer.minutes } });
    }
  }
  const slots = new Set<number>();
  for (const row of input.jumuah) {
    if (slots.has(row.slot)) return { ok: false, error: `Jumu'ah ${row.slot} was sent twice.` };
    slots.add(row.slot);
    changes.push({
      key: "jumuah.jamaah",
      qualifier: String(row.slot),
      value: row.khutbah ? { t: row.time, khutbah: row.khutbah } : { t: row.time },
    });
  }
  if (changes.length === 0) return { ok: false, error: "Set at least one time." };
  return { ok: true, changes };
}

export function embedSnippet(origin: string, slug: string): string {
  const src = `${origin.replace(/\/$/, "")}/m/${encodeURIComponent(slug)}/widget`;
  return `<iframe src="${src}" title="Prayer times" width="420" height="560" style="max-width:100%;border:0" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

type ProRow = {
  status: string;
  billing_interval: string | null;
  current_period_end: number | null;
  notice: string | null;
  donation_url: string | null;
  donation_label: string | null;
};

export type PublicBoard = { notice: string | null; donationUrl: string | null; donationLabel: string | null };

export type ProView = PublicBoard & {
  status: ProStatus;
  interval: PolarInterval | null;
  periodEnd: number | null;
  entitled: boolean;
};

function asStatus(value: string): ProStatus {
  return (PRO_STATUSES as readonly string[]).includes(value) ? (value as ProStatus) : "inactive";
}

function asInterval(value: string | null): PolarInterval | null {
  return value === "month" || value === "year" ? value : null;
}

export function toProView(row: ProRow, now: number): ProView {
  const active = entitled(row.status, row.current_period_end, now);
  return {
    status: asStatus(row.status),
    interval: asInterval(row.billing_interval),
    periodEnd: row.current_period_end,
    entitled: active,
    notice: active ? row.notice : null,
    donationUrl: active ? row.donation_url : null,
    donationLabel: active ? row.donation_label : null,
  };
}

const PRO_COLUMNS = `status, billing_interval, current_period_end, notice, donation_url, donation_label`;

export async function readPro(db: D1Database, placeId: string, now: number): Promise<ProView | null> {
  const row = await db.prepare(`SELECT ${PRO_COLUMNS} FROM masjid_pro WHERE place_id = ?`).bind(placeId).first<ProRow>();
  return row ? toProView(row, now) : null;
}

/** Notice and donation link for public pages. Null unless the subscription is in force. */
export async function readPublicBoard(db: D1Database, placeId: string, now: number): Promise<PublicBoard | null> {
  const view = await readPro(db, placeId, now);
  if (!view?.entitled) return null;
  return { notice: view.notice, donationUrl: view.donationUrl, donationLabel: view.donationLabel };
}

export async function approvedSteward(db: D1Database, placeId: string, userId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM steward WHERE place_id = ? AND user_id = ? AND status = 'approved'`)
    .bind(placeId, userId)
    .first<{ ok: number }>();
  return Boolean(row);
}

export async function saveBoard(db: D1Database, placeId: string, patch: BoardPatch, now: number): Promise<boolean> {
  const current = await db.prepare(`SELECT notice, donation_url, donation_label FROM masjid_pro WHERE place_id = ?`).bind(placeId).first<{
    notice: string | null;
    donation_url: string | null;
    donation_label: string | null;
  }>();
  if (!current) return false;
  const result = await db
    .prepare(`UPDATE masjid_pro SET notice = ?, donation_url = ?, donation_label = ?, updated_at = ? WHERE place_id = ?`)
    .bind(
      patch.notice !== undefined ? patch.notice : current.notice,
      patch.donationUrl !== undefined ? patch.donationUrl : current.donation_url,
      patch.donationLabel !== undefined ? patch.donationLabel : current.donation_label,
      now,
      placeId,
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Preview/local grant so the screen can be tested without Polar. */
export async function setProForTest(
  db: D1Database,
  input: { placeId: string; active: boolean; notice?: string | null; donationUrl?: string | null; donationLabel?: string | null; userId?: string | null; now: number },
): Promise<void> {
  const status = input.active ? "active" : "revoked";
  const periodEnd = input.active ? input.now + 30 * 24 * 60 * 60 * 1000 : input.now - 1000;
  await db
    .prepare(
      `INSERT INTO masjid_pro (place_id, status, current_period_end, notice, donation_url, donation_label, activated_by, created_at, updated_at, polar_event_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT (place_id) DO UPDATE SET
         status = excluded.status,
         current_period_end = excluded.current_period_end,
         notice = excluded.notice,
         donation_url = excluded.donation_url,
         donation_label = excluded.donation_label,
         activated_by = coalesce(masjid_pro.activated_by, excluded.activated_by),
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.placeId,
      status,
      periodEnd,
      input.notice ?? null,
      input.donationUrl ?? null,
      input.donationLabel ?? null,
      input.userId ?? null,
      input.now,
      input.now,
    )
    .run();
}

export type PolarDelivery = {
  webhookId: string;
  type: string;
  at: number;
  placeId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  productId: string | null;
  status: ProStatus;
  periodEnd: number | null;
  interval: PolarInterval | null;
  userId: string | null;
};

function timeMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1e12) return value;
    if (value > 1e9) return value * 1000;
    return null;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function textId(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function mapStatus(type: string, raw: unknown): ProStatus | null {
  if (type === "checkout.updated") return raw === "succeeded" ? "active" : null;
  switch (raw) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    case "revoked":
    case "incomplete_expired":
      return "revoked";
    default:
      return null;
  }
}

/** A Polar webhook body we know how to apply. Unknown events return null (ack, don't retry). */
export function parsePolarDelivery(webhookId: string, body: unknown, now: number): PolarDelivery | null {
  if (!body || typeof body !== "object") return null;
  const envelope = body as { type?: unknown; timestamp?: unknown; data?: unknown };
  if (typeof envelope.type !== "string" || !envelope.data || typeof envelope.data !== "object") return null;
  const data = envelope.data as Record<string, unknown>;
  const status = mapStatus(envelope.type, envelope.type === "checkout.updated" ? data.status : (data.status ?? statusFromType(envelope.type)));
  if (!status) return null;
  const metadata = data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : {};
  const product = data.product && typeof data.product === "object" ? (data.product as { id?: unknown }) : null;
  const interval = metadata.interval === "month" || metadata.interval === "year" ? metadata.interval : data.recurring_interval === "month" || data.recurring_interval === "year" ? data.recurring_interval : null;
  return {
    webhookId,
    type: envelope.type,
    at: timeMs(envelope.timestamp) ?? now,
    placeId: textId(metadata.place_id, 64),
    subscriptionId: textId(envelope.type.startsWith("subscription.") ? data.id : data.subscription_id),
    customerId: textId(data.customer_id),
    productId: textId(data.product_id) ?? textId(product?.id),
    status,
    periodEnd: timeMs(data.current_period_end),
    interval,
    userId: textId(metadata.user_id, 64),
  };
}

function statusFromType(type: string): string | null {
  if (type === "subscription.active" || type === "subscription.created" || type === "subscription.uncanceled") return "active";
  if (type === "subscription.canceled") return "canceled";
  if (type === "subscription.revoked") return "revoked";
  if (type === "subscription.past_due") return "past_due";
  return null;
}

export type ApplyResult = "applied" | "duplicate" | "ignored";

/**
 * Records a Polar delivery once and moves the mosque's subscription. Notice text is never
 * touched here. An older event does not overwrite a newer one.
 */
export async function applyPolarDelivery(db: D1Database, event: PolarDelivery, productIds: string[]): Promise<ApplyResult> {
  if (!event.productId || !productIds.includes(event.productId)) {
    await recordEvent(db, event, null);
    return "ignored";
  }
  let placeId = event.placeId;
  if (!placeId && event.subscriptionId) {
    const existing = await db.prepare(`SELECT place_id FROM masjid_pro WHERE polar_subscription_id = ?`).bind(event.subscriptionId).first<{ place_id: string }>();
    placeId = existing?.place_id ?? null;
  }
  const recorded = await recordEvent(db, event, placeId);
  if (recorded === "duplicate") return "duplicate";
  if (!placeId) return "ignored";
  const place = await db.prepare(`SELECT id FROM place WHERE id = ? AND status IN ('active', 'closed')`).bind(placeId).first();
  if (!place) return "ignored";
  await db
    .prepare(
      `INSERT INTO masjid_pro (
         place_id, status, polar_subscription_id, polar_customer_id, product_id, billing_interval,
         current_period_end, activated_by, created_at, updated_at, polar_event_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (place_id) DO UPDATE SET
         status = excluded.status,
         polar_subscription_id = coalesce(excluded.polar_subscription_id, masjid_pro.polar_subscription_id),
         polar_customer_id = coalesce(excluded.polar_customer_id, masjid_pro.polar_customer_id),
         product_id = coalesce(excluded.product_id, masjid_pro.product_id),
         billing_interval = coalesce(excluded.billing_interval, masjid_pro.billing_interval),
         current_period_end = coalesce(excluded.current_period_end, masjid_pro.current_period_end),
         activated_by = coalesce(masjid_pro.activated_by, excluded.activated_by),
         updated_at = excluded.updated_at,
         polar_event_at = excluded.polar_event_at
       WHERE masjid_pro.polar_event_at IS NULL OR masjid_pro.polar_event_at <= excluded.polar_event_at`,
    )
    .bind(
      placeId,
      event.status,
      event.subscriptionId,
      event.customerId,
      event.productId,
      event.interval,
      event.periodEnd,
      event.userId,
      event.at,
      event.at,
      event.at,
    )
    .run();
  return "applied";
}

async function recordEvent(db: D1Database, event: PolarDelivery, placeId: string | null): Promise<"recorded" | "duplicate"> {
  const result = await db
    .prepare(`INSERT INTO masjid_pro_event (id, place_id, type, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`)
    .bind(event.webhookId, placeId, event.type, event.at)
    .run();
  return (result.meta?.changes ?? 0) > 0 ? "recorded" : "duplicate";
}
