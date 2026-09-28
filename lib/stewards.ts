import { z } from "zod";
import { ulid } from "@/lib/id";
import { describeValue, factLabel } from "@/lib/trust/facts";

/**
 * Stewards (spec P6): people involved with a mosque ask to look after it, a moderator approves them,
 * and their votes there carry +2. Their dashboard lists what needs them.
 */

export const STEWARD_ROLES = ["imam", "committee", "volunteer", "staff", "other"] as const;
export const STEWARD_ROLE_LABELS: Record<(typeof STEWARD_ROLES)[number], string> = {
  imam: "Imam",
  committee: "Committee member",
  volunteer: "Regular volunteer",
  staff: "Staff",
  other: "Other",
};

export const stewardInput = z.object({
  role: z.enum(STEWARD_ROLES),
  evidence: z.string().trim().min(20, "Tell us a little more (at least 20 characters).").max(1000),
  contact: z.string().trim().max(200).optional(),
});

export class StewardError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function requestStewardship(
  db: D1Database,
  input: { userId: string; placeId: string; request: z.infer<typeof stewardInput>; now: number },
): Promise<string> {
  const existing = await db
    .prepare(`SELECT id, status, decided_at FROM steward WHERE place_id = ? AND user_id = ?`)
    .bind(input.placeId, input.userId)
    .first<{ id: string; status: string; decided_at: number | null }>();
  if (existing?.status === "approved") throw new StewardError("You already look after this place.", 409);
  if (existing?.status === "requested") throw new StewardError("Your request is waiting for a moderator.", 409);
  if (existing && (existing.decided_at ?? 0) > input.now - 30 * 24 * 60 * 60 * 1000) {
    throw new StewardError("You can ask again 30 days after the last decision.", 409);
  }
  const open = await db.prepare(`SELECT COUNT(*) AS n FROM steward WHERE user_id = ? AND status = 'requested'`).bind(input.userId).first<{ n: number }>();
  if ((open?.n ?? 0) >= 5) throw new StewardError("You have 5 requests waiting already. Please wait for a decision.", 429);
  const evidence = `${input.request.role}: ${input.request.evidence}`;
  const id = existing?.id ?? ulid(input.now);
  await db
    .prepare(
      `INSERT INTO steward (id, place_id, user_id, role, status, evidence, contact, created_at) VALUES (?, ?, ?, 'steward', 'requested', ?, ?, ?)
       ON CONFLICT (place_id, user_id) DO UPDATE SET status = 'requested', evidence = excluded.evidence, contact = excluded.contact,
         created_at = excluded.created_at, decided_at = NULL, approved_by = NULL`,
    )
    .bind(id, input.placeId, input.userId, evidence, input.request.contact || null, input.now)
    .run();
  return id;
}

export async function decideStewardship(
  db: D1Database,
  input: { id: string; moderatorId: string; action: "approve" | "reject" | "revoke"; now: number },
) {
  const row = await db
    .prepare(`SELECT steward.status, steward.user_id, steward.place_id, place.name, place.slug FROM steward JOIN place ON place.id = steward.place_id WHERE steward.id = ?`)
    .bind(input.id)
    .first<{ status: string; user_id: string; place_id: string; name: string; slug: string }>();
  if (!row) throw new StewardError("That request was not found.", 404);
  const allowed = input.action === "revoke" ? row.status === "approved" : row.status === "requested";
  if (!allowed) throw new StewardError("That request was already decided.", 409);
  const status = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "revoked";
  const statements = [
    db
      .prepare(`UPDATE steward SET status = ?, approved_by = ?, decided_at = ? WHERE id = ?`)
      .bind(status, input.action === "approve" ? input.moderatorId : null, input.now, input.id),
    db
      .prepare(`INSERT INTO audit_log (id, actor_id, action, target_type, target_id, before_json, after_json, created_at) VALUES (?, ?, ?, 'steward', ?, ?, ?, ?)`)
      .bind(ulid(input.now), input.moderatorId, `steward_${input.action}`, input.id, JSON.stringify({ status: row.status }), JSON.stringify({ status }), input.now),
  ];
  if (input.action === "approve") {
    statements.push(
      db
        .prepare(`INSERT INTO notification (id, user_id, topic, place_id, title, body, url, push_status, created_at) VALUES (?, ?, 'steward_alerts', ?, ?, ?, '/steward', 'skipped', ?)`)
        .bind(
          ulid(input.now),
          row.user_id,
          row.place_id,
          `You now look after ${row.name}`,
          `JazakAllahu khayran. Your confirmations at ${row.name} now carry extra weight, and we'll tell you when someone disputes a time there.`,
          input.now,
        ),
    );
  }
  await db.batch(statements);
  return { status, userId: row.user_id, slug: row.slug };
}

export async function stewardCount(db: D1Database, placeId: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM steward WHERE place_id = ? AND status = 'approved'`).bind(placeId).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function stewardStatus(db: D1Database, placeId: string, userId: string): Promise<string | null> {
  const row = await db.prepare(`SELECT status FROM steward WHERE place_id = ? AND user_id = ?`).bind(placeId, userId).first<{ status: string }>();
  return row?.status ?? null;
}

export type StewardItem = {
  kind: "dispute" | "stale" | "held";
  key: string;
  label: string;
  detail: string;
  /** The value a steward confirms with one click. */
  confirmId: string;
  confirmLabel: string;
  /** For disputes: the other value, which can be confirmed instead. */
  otherId?: string;
  otherLabel?: string;
};

export type StewardPlace = { id: string; slug: string; name: string; locality: string | null; items: StewardItem[] };

type ItemRow = {
  place_id: string;
  fact_key: string;
  qualifier: string;
  state: string;
  candidate_id: string;
  status: string;
  value_json: string;
  score: number;
};

/** Everything that needs a steward at their places (or one place): disputes, stale values, held changes. */
export async function stewardQueue(db: D1Database, userId: string, slug?: string): Promise<StewardPlace[]> {
  const places = await db
    .prepare(
      `SELECT place.id, place.slug, place.name, place.locality FROM steward JOIN place ON place.id = steward.place_id
       WHERE steward.user_id = ? AND steward.status = 'approved' ${slug ? "AND place.slug = ?" : ""} ORDER BY place.name LIMIT 50`,
    )
    .bind(...(slug ? [userId, slug] : [userId]))
    .all<{ id: string; slug: string; name: string; locality: string | null }>();
  const list = places.results ?? [];
  if (list.length === 0) return [];
  const rows = await db
    .prepare(
      `SELECT fact.place_id, fact.key AS fact_key, fact.qualifier, fact.state, fact_candidate.id AS candidate_id, fact_candidate.status,
         fact_candidate.value_json, fact_candidate.score
       FROM fact JOIN fact_candidate ON fact_candidate.fact_id = fact.id
       WHERE fact.place_id IN (${list.map(() => "?").join(", ")})
         AND (fact_candidate.status = 'held' OR (fact.state IN ('disputed', 'stale') AND fact_candidate.status IN ('current', 'candidate')))
         AND NOT (fact.key LIKE 'timetable.%' AND fact.qualifier < ?)
       ORDER BY fact.key LIMIT 500`,
    )
    .bind(...list.map((place) => place.id), new Date().toISOString().slice(0, 10))
    .all<ItemRow>();
  const byPlace = new Map<string, ItemRow[]>();
  for (const row of rows.results ?? []) byPlace.set(row.place_id, [...(byPlace.get(row.place_id) ?? []), row]);
  return list.map((place) => {
    const items: StewardItem[] = [];
    const facts = new Map<string, ItemRow[]>();
    for (const row of byPlace.get(place.id) ?? []) facts.set(`${row.fact_key}|${row.qualifier}`, [...(facts.get(`${row.fact_key}|${row.qualifier}`) ?? []), row]);
    for (const group of facts.values()) {
      const first = group[0];
      if (!first) continue;
      const label = factLabel(first.fact_key, first.qualifier);
      const describe = (row: ItemRow) => describeValue(row.fact_key, JSON.parse(row.value_json));
      const current = group.find((row) => row.status === "current");
      const challenger = group.filter((row) => row.status === "candidate" && row.score > 0).sort((a, b) => b.score - a.score)[0];
      for (const held of group.filter((row) => row.status === "held")) {
        items.push({ kind: "held", key: first.fact_key, label, detail: `A new member suggested ${describe(held)}`, confirmId: held.candidate_id, confirmLabel: `Confirm ${describe(held)}` });
      }
      if (first.state === "disputed" && current && challenger) {
        items.push({
          kind: "dispute",
          key: first.fact_key,
          label,
          detail: `${describe(current)} or ${describe(challenger)}?`,
          confirmId: challenger.candidate_id,
          confirmLabel: `It's ${describe(challenger)}`,
          otherId: current.candidate_id,
          otherLabel: `Still ${describe(current)}`,
        });
      } else if (first.state === "stale" && current) {
        items.push({ kind: "stale", key: first.fact_key, label, detail: `Not confirmed for over 60 days: ${describe(current)}`, confirmId: current.candidate_id, confirmLabel: "Still correct" });
      }
    }
    const rank = { dispute: 0, held: 1, stale: 2 } as const;
    return { ...place, items: items.sort((a, b) => rank[a.kind] - rank[b.kind]) };
  });
}
