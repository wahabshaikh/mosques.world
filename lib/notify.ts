import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { AppEnv } from "@/lib/db/client";
import { serverGoal } from "@/lib/analytics-server";
import { deliver } from "@/lib/email/send";
import { layout, type Mail } from "@/lib/email/templates";
import { isNonProductionHost } from "@/lib/places/present";
import { NOTIFICATION_CHANNELS, NOTIFICATION_TOPICS, TOPIC_LABELS, type NotificationChannel, type NotificationTopic } from "@/lib/notifications";

/**
 * Delivery for the notification outbox (spec P6): email through `q-email` (sink on preview) and Web Push
 * (VAPID). Rows are claimed in small batches; preferences are read per batch; every email carries an
 * RFC 8058 one-click unsubscribe for its topic.
 */

const DEV_SECRET = "mosques-world-local-development-secret-not-for-production";

type DeliverEnv = Pick<AppEnv, "DB" | "CACHE" | "EMAIL_SINK" | "Q_EMAIL" | "EMAIL" | "PUBLIC_BASE_URL" | "BETTER_AUTH_SECRET"> & {
  Q_RECOMPUTE?: Queue;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

/** The signing secret; the fixed development secret is only allowed on non-production hosts (as in lib/auth). */
function secretOf(env: Pick<AppEnv, "BETTER_AUTH_SECRET">, host = ""): string {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (isNonProductionHost(host)) return DEV_SECRET;
  throw new Error("BETTER_AUTH_SECRET is not set");
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`unsubscribe:${value}`)));
  return base64url(mac.slice(0, 18));
}

/** A signed, non-expiring token that turns off one topic on one channel for one person. */
export async function unsubscribeToken(secret: string, input: { userId: string; channel: NotificationChannel; topic: NotificationTopic }): Promise<string> {
  const value = `${input.userId}.${input.channel}.${input.topic}`;
  return `${base64url(new TextEncoder().encode(value))}.${await sign(secret, value)}`;
}

export async function readUnsubscribeToken(secret: string, token: string) {
  const [encoded, mac] = token.split(".");
  if (!encoded || !mac) return null;
  let value: string;
  try {
    value = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  if ((await sign(secret, value)) !== mac) return null;
  const [userId, channel, topic] = value.split(".");
  if (!userId || !(NOTIFICATION_CHANNELS as readonly string[]).includes(channel ?? "") || !(NOTIFICATION_TOPICS as readonly string[]).includes(topic ?? "")) return null;
  return { userId, channel: channel as NotificationChannel, topic: topic as NotificationTopic };
}

export function setPrefStatement(db: D1Database, input: { userId: string; channel: NotificationChannel; topic: NotificationTopic; enabled: boolean; now: number }) {
  return db
    .prepare(
      `INSERT INTO notification_pref (user_id, channel, topic, enabled, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, channel, topic) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
    )
    .bind(input.userId, input.channel, input.topic, input.enabled ? 1 : 0, input.now);
}

export async function unsubscribe(env: DeliverEnv, token: string, host: string, now = Date.now()) {
  const parsed = await readUnsubscribeToken(secretOf(env, host), token);
  if (!parsed) return null;
  await setPrefStatement(env.DB, { ...parsed, enabled: false, now }).run();
  return parsed;
}

/** Preferences for a set of people; anything not stored is on. */
export async function loadPrefs(db: D1Database, userIds: string[]): Promise<(userId: string, channel: NotificationChannel, topic: string) => boolean> {
  const off = new Set<string>();
  for (let index = 0; index < userIds.length; index += 90) {
    const part = userIds.slice(index, index + 90);
    const rows = await db
      .prepare(`SELECT user_id, channel, topic FROM notification_pref WHERE enabled = 0 AND user_id IN (${part.map(() => "?").join(", ")})`)
      .bind(...part)
      .all<{ user_id: string; channel: string; topic: string }>();
    for (const row of rows.results ?? []) off.add(`${row.user_id}|${row.channel}|${row.topic}`);
  }
  return (userId, channel, topic) => !off.has(`${userId}|${channel}|${topic}`);
}

export function notificationMail(
  to: string,
  input: { title: string; body: string; url: string; unsubscribeUrl: string; oneClickUrl: string; topic: NotificationTopic },
): Mail {
  const reason = TOPIC_LABELS[input.topic].help;
  return {
    to,
    subject: input.title,
    text: `${input.body}\n\n${input.url}\n\n${reason} Turn these emails off: ${input.unsubscribeUrl}`,
    html: layout(input.title, [input.body], { label: "Open mosques.world", url: input.url }, `${reason} Turn these emails off: ${input.unsubscribeUrl}`),
    headers: {
      "List-Unsubscribe": `<${input.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

type Pending = { id: string; user_id: string; topic: NotificationTopic; title: string; body: string; url: string; email: string; deleted_at: number | null };

async function mark(db: D1Database, column: "email_status" | "push_status", results: Array<[string, string]>) {
  if (results.length === 0) return;
  await db.batch(results.map(([id, status]) => db.prepare(`UPDATE notification SET ${column} = ? WHERE id = ?`).bind(status, id)));
}

/** Sends pending emails and pushes, oldest first, at most `limit` of each per call. */
export async function deliverPending(env: DeliverEnv, input: { host: string; origin?: string; limit?: number }) {
  const limit = input.limit ?? 50;
  // Links point at the site that queued them: preview/localhost use their own origin.
  const base = input.origin && isNonProductionHost(input.host) ? input.origin : env.PUBLIC_BASE_URL || "https://mosques.world";
  const secret = secretOf(env, input.host);
  const select = (column: "email_status" | "push_status") =>
    env.DB.prepare(
      `SELECT notification.id, notification.user_id, notification.topic, notification.title, notification.body, notification.url, user.email, user.deleted_at
       FROM notification JOIN user ON user.id = notification.user_id WHERE notification.${column} = 'pending' ORDER BY notification.created_at LIMIT ?`,
    )
      .bind(limit)
      .all<Pending>();

  // Anything older than three days is stale news (e.g. written while the flag was off): never send it late.
  const cutoff = Date.now() - 72 * 60 * 60 * 1000;
  await env.DB.batch([
    env.DB.prepare(`UPDATE notification SET email_status = 'expired' WHERE email_status = 'pending' AND created_at < ?`).bind(cutoff),
    env.DB.prepare(`UPDATE notification SET push_status = 'expired' WHERE push_status = 'pending' AND created_at < ?`).bind(cutoff),
  ]);
  const emails = (await select("email_status")).results ?? [];
  const enabled = await loadPrefs(env.DB, [...new Set(emails.map((row) => row.user_id))]);
  const emailResults: Array<[string, string]> = [];
  for (const row of emails) {
    if (row.deleted_at || !enabled(row.user_id, "email", row.topic)) {
      emailResults.push([row.id, "skipped"]);
      continue;
    }
    try {
      const token = await unsubscribeToken(secret, { userId: row.user_id, channel: "email", topic: row.topic });
      const mail = notificationMail(row.email, {
        ...row,
        url: (() => {
          const link = new URL(row.url, base);
          link.searchParams.set("from", "email");
          return link.toString();
        })(),
        unsubscribeUrl: `${base}/notifications/unsubscribe?token=${token}`,
        oneClickUrl: `${base}/api/v1/notifications/unsubscribe?token=${token}`,
      });
      await deliver(env as AppEnv, input.host, mail);
      emailResults.push([row.id, "sent"]);
    } catch {
      emailResults.push([row.id, "failed"]);
    }
  }
  await mark(env.DB, "email_status", emailResults);

  const pushes = (await select("push_status")).results ?? [];
  const pushResults: Array<[string, string]> = [];
  const vapid =
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? { subject: env.VAPID_SUBJECT ?? "mailto:hello@mosques.world", publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
      : null;
  const pushEnabled = await loadPrefs(env.DB, [...new Set(pushes.map((row) => row.user_id))]);
  for (const row of pushes) {
    if (!vapid || row.deleted_at || row.topic === "digest" || !pushEnabled(row.user_id, "push", row.topic)) {
      pushResults.push([row.id, "skipped"]);
      continue;
    }
    const subscriptions = await env.DB.prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscription WHERE user_id = ? LIMIT 5`)
      .bind(row.user_id)
      .all<{ id: string; endpoint: string; p256dh: string; auth: string }>();
    let sent = false;
    for (const subscription of subscriptions.results ?? []) {
      try {
        const payload = await buildPushPayload(
          { data: JSON.stringify({ title: row.title, body: row.body, url: row.url }), options: { ttl: 60 * 60 * 24, urgency: "normal" } },
          { endpoint: subscription.endpoint, expirationTime: null, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          vapid,
        );
        const response = await fetch(subscription.endpoint, payload);
        if (response.status === 404 || response.status === 410) {
          await env.DB.prepare(`DELETE FROM push_subscription WHERE id = ?`).bind(subscription.id).run();
        } else if (response.ok) {
          sent = true;
        }
      } catch {
        // A broken subscription never blocks the rest of the batch.
      }
    }
    pushResults.push([row.id, sent ? "sent" : "skipped"]);
  }
  await mark(env.DB, "push_status", pushResults);
  return { emails: emailResults.filter(([, status]) => status === "sent").length, pushes: pushResults.filter(([, status]) => status === "sent").length };
}

export type DeliverMessage = { kind: "deliver" };

export function isDeliverMessage(body: unknown): body is DeliverMessage {
  return Boolean(body && typeof body === "object" && (body as DeliverMessage).kind === "deliver");
}

/**
 * Called after a write that may have created notifications. Production hands delivery to the queue
 * (only when something is pending); preview and localhost deliver inline, since they share queue names.
 */
export async function kickDelivery(env: DeliverEnv, host: string, origin?: string): Promise<{ emails: number; pushes: number } | null> {
  const pending = await env.DB.prepare(
    `SELECT 1 AS found FROM notification WHERE email_status = 'pending' UNION ALL SELECT 1 FROM notification WHERE push_status = 'pending' LIMIT 1`,
  ).first<{ found: number }>();
  if (!pending) return null;
  if (env.Q_RECOMPUTE && !isNonProductionHost(host)) {
    await env.Q_RECOMPUTE.send({ kind: "deliver" } satisfies DeliverMessage);
    return null;
  }
  return deliverPending(env, { host, origin, limit: 50 });
}

/**
 * Weekly digest for recent contributors (spec P6): their confirmations this week and up to three places
 * they know that need a check. One INSERT per run, capped, and never twice in six days.
 */
export function weeklyDigestStatement(db: D1Database, now: number, limit = 300) {
  const week = now - 7 * 24 * 60 * 60 * 1000;
  return db
    .prepare(
      `INSERT INTO notification (id, user_id, topic, place_id, title, body, url, push_status, created_at)
       SELECT lower(hex(randomblob(16))), user.id, 'digest', NULL, 'Your week on mosques.world',
         printf('You confirmed %d %s this week.%s', confirmations, CASE confirmations WHEN 1 THEN 'time' ELSE 'times' END,
           CASE WHEN needing IS NULL THEN ' Every place you know is up to date — JazakAllahu khayran.' ELSE ' These places you know need a check: ' || needing || '.' END),
         '/verify', 'skipped', ?1
       FROM (
         SELECT user.id,
           (SELECT COUNT(*) FROM activity WHERE activity.actor_id = user.id AND activity.type = 'confirmed' AND activity.created_at > ?2) AS confirmations,
           (SELECT group_concat(name, ', ') FROM (
              SELECT DISTINCT place.name FROM activity JOIN fact ON fact.place_id = activity.place_id JOIN place ON place.id = fact.place_id
              WHERE activity.actor_id = user.id AND activity.created_at > ?3 AND fact.state IN ('stale', 'disputed') LIMIT 3)) AS needing
         FROM user
         WHERE user.deleted_at IS NULL AND user.id != 'system'
           AND EXISTS (SELECT 1 FROM activity WHERE activity.actor_id = user.id AND activity.type != 'prayed' AND activity.created_at > ?3)
           AND NOT EXISTS (SELECT 1 FROM notification_pref WHERE notification_pref.user_id = user.id AND channel = 'email' AND topic = 'digest' AND enabled = 0)
           AND NOT EXISTS (SELECT 1 FROM notification WHERE notification.user_id = user.id AND notification.topic = 'digest' AND notification.created_at > ?4)
         LIMIT ?5
       ) AS user`,
    )
    .bind(now, week, now - 30 * 24 * 60 * 60 * 1000, now - 6 * 24 * 60 * 60 * 1000, limit);
}

/** Route helper: deliver anything a contribution just queued, when Phase 6 is on for this request. */
export async function afterContribution(env: DeliverEnv, request: Request, enabled: boolean) {
  if (!enabled) return;
  try {
    const url = new URL(request.url);
    const sent = await kickDelivery(env, url.hostname, url.origin);
    if (sent?.emails) await serverGoal(env as AppEnv, request, "notification_sent", { channel: "email", count: sent.emails });
    if (sent?.pushes) await serverGoal(env as AppEnv, request, "notification_sent", { channel: "push", count: sent.pushes });
  } catch (error) {
    // Delivery is retried by the queue and the nightly sweep; a contribution never fails because of it.
    console.error("notification delivery failed", error);
  }
}
