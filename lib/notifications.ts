import { describeValue, factLabel } from "@/lib/trust/facts";

/**
 * Notification topics (spec P6) and the SQL that writes them. Rows are the in-app inbox and the
 * outbox for email/push at once; `lib/notify.ts` delivers them.
 */

export const NOTIFICATION_TOPICS = ["saved_changes", "digest", "steward_alerts"] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];
export const NOTIFICATION_CHANNELS = ["email", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const TOPIC_LABELS: Record<NotificationTopic, { title: string; help: string }> = {
  saved_changes: { title: "Saved mosques", help: "When a time changes at a mosque you saved." },
  digest: { title: "Weekly digest", help: "Your impact, and places near you that need a check (contributors only)." },
  steward_alerts: { title: "Steward alerts", help: "When someone disputes a time at a mosque you look after." },
};

export function isTimeKey(key: string): boolean {
  return key.startsWith("iqamah.") || key.startsWith("jumuah.");
}

/** "Isha iqamah changed at East London Mosque: 8:45 PM → 8:30 PM". */
export function changeText(input: { key: string; qualifier: string; placeName: string; before: unknown; after: unknown }) {
  const label = factLabel(input.key, input.qualifier);
  const noun = input.key.startsWith("iqamah.") ? `${label} iqamah` : label;
  const before = describeValue(input.key, input.before);
  const after = describeValue(input.key, input.after);
  return {
    title: `${noun} changed at ${input.placeName}`,
    body: `${noun}: ${before} → ${after}. Confirmed by the community.`,
  };
}

export function disputeText(input: { key: string; qualifier: string; placeName: string; challenger: unknown }) {
  const label = factLabel(input.key, input.qualifier);
  const noun = input.key.startsWith("iqamah.") ? `${label} iqamah` : label;
  return {
    title: `${noun} is disputed at ${input.placeName}`,
    body: `Someone reported ${describeValue(input.key, input.challenger)}. As a steward, one confirm settles it.`,
  };
}

/** One notification per person who saved the place (except whoever caused the change). */
export function savedChangeStatement(
  db: D1Database,
  input: { placeId: string; slug: string; title: string; body: string; exclude: string | null; now: number },
) {
  return db
    .prepare(
      `INSERT INTO notification (id, user_id, topic, place_id, title, body, url, created_at)
       SELECT lower(hex(randomblob(16))), saved_place.user_id, 'saved_changes', ?1, ?2, ?3, ?4, ?5
       FROM saved_place JOIN user ON user.id = saved_place.user_id
       WHERE saved_place.place_id = ?1 AND saved_place.user_id IS NOT ?6 AND user.deleted_at IS NULL`,
    )
    .bind(input.placeId, input.title, input.body, `/m/${input.slug}`, input.now, input.exclude);
}

export function stewardAlertStatement(
  db: D1Database,
  input: { placeId: string; title: string; body: string; exclude: string | null; now: number },
) {
  return db
    .prepare(
      `INSERT INTO notification (id, user_id, topic, place_id, title, body, url, created_at)
       SELECT lower(hex(randomblob(16))), steward.user_id, 'steward_alerts', ?1, ?2, ?3, '/steward', ?4
       FROM steward WHERE steward.place_id = ?1 AND steward.status = 'approved' AND steward.user_id IS NOT ?5`,
    )
    .bind(input.placeId, input.title, input.body, input.now, input.exclude);
}
