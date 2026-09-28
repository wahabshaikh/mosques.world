import { z } from "zod";
import { ulid } from "@/lib/id";
import { variantKey } from "@/lib/photos";
import { evaluateFact, voteWeight, type EngineCandidate } from "@/lib/trust/engine";
import { IQAMAH_PRAYERS, valueHash, type IqamahPrayer } from "@/lib/trust/facts";
import { refreshPlaceSummary, type Actor } from "@/lib/trust/store";

/**
 * Monthly timetables (spec P7). Each (date, prayer) is a fact `timetable.<prayer>` with the date as
 * qualifier, so the trust engine governs it; `timetable` / `timetable_row` keep the import's provenance.
 */

export type TimetableRow = { date: string } & Partial<Record<IqamahPrayer, string>>;

const hm = /^([01]\d|2[0-3]):[0-5]\d$/;

export const timetableInput = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    photoId: z.string().max(64).optional(),
    rows: z
      .array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          fajr: z.string().regex(hm).optional(),
          dhuhr: z.string().regex(hm).optional(),
          asr: z.string().regex(hm).optional(),
          maghrib: z.string().regex(hm).optional(),
          isha: z.string().regex(hm).optional(),
        }),
      )
      .min(1)
      .max(31),
  })
  .refine((value) => value.rows.every((row) => row.date.startsWith(`${value.month}-`)), { message: "Every row must be in that month." })
  .refine((value) => new Set(value.rows.map((row) => row.date)).size === value.rows.length, { message: "Each date can appear once." });

export function daysIn(month: string): string[] {
  const [year, index] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year ?? 2000, index ?? 1, 0)).getUTCDate();
  return Array.from({ length: count }, (_, day) => `${month}-${String(day + 1).padStart(2, "0")}`);
}

/**
 * Reads a time as printed on a board ("5:45", "05.45", "5:45 pm", "17:45") as 24-hour HH:MM, using the
 * prayer to place AM/PM when the board omits it.
 */
export function normalizeTime(raw: unknown, prayer: IqamahPrayer): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const text = String(raw).trim().toLowerCase();
  const match = /^(\d{1,2})[:.h](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const suffix = match[3]?.startsWith("p") ? "pm" : match[3]?.startsWith("a") ? "am" : null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (!suffix && hour <= 12) {
    if (prayer === "dhuhr" && hour < 10) hour += 12;
    if ((prayer === "asr" || prayer === "maghrib" || prayer === "isha") && hour < 12) hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Turns a model's (or a person's) loose table into clean rows for the month; bad cells are dropped. */
export function cleanRows(raw: unknown, month: string): TimetableRow[] {
  const list = Array.isArray(raw) ? raw : [];
  const valid = new Set(daysIn(month));
  const rows = new Map<string, TimetableRow>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    let date = typeof record.date === "string" ? record.date.trim() : "";
    const day = Number(record.day ?? (/^\d{1,2}$/.test(date) ? date : NaN));
    if (Number.isInteger(day) && day >= 1 && day <= 31) date = `${month}-${String(day).padStart(2, "0")}`;
    if (!valid.has(date)) continue;
    const row: TimetableRow = { date };
    for (const prayer of IQAMAH_PRAYERS) {
      const time = normalizeTime(record[prayer] ?? record[prayer === "dhuhr" ? "zuhr" : prayer], prayer);
      if (time) row[prayer] = time;
    }
    if (IQAMAH_PRAYERS.some((prayer) => row[prayer])) rows.set(date, row);
  }
  return [...rows.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export const EXTRACT_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const PROMPT = (month: string) =>
  `This photo shows a mosque's monthly prayer timetable for ${month}. Read the IQAMAH (jamā'ah / congregation) time for each day, ` +
  `not the start/adhan time when both are shown. Reply with only a JSON array, one object per day, like ` +
  `[{"day":1,"fajr":"5:45","dhuhr":"1:15","asr":"4:30","maghrib":"6:52","isha":"8:15"}]. Omit any time you cannot read.`;

function jsonArray(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
}

export type ExtractEnv = { MEDIA: R2Bucket; CACHE: KVNamespace; AI?: Ai };

/**
 * Reads a timetable photo with a Workers AI vision model. On preview/localhost with the email sink,
 * `test:timetable:extract` in KV stands in for the model (E2E fixtures).
 */
export async function extractTimetable(env: ExtractEnv, input: { photoId: string; month: string; mocks: boolean }): Promise<TimetableRow[] | "processing" | "unavailable"> {
  if (input.mocks) {
    const mock = await env.CACHE.get("test:timetable:extract");
    if (mock) return cleanRows(JSON.parse(mock), input.month);
  }
  if (!env.AI) return "unavailable";
  const object = await env.MEDIA.get(variantKey(input.photoId, 1600));
  if (!object) return "processing";
  const bytes = new Uint8Array(await object.arrayBuffer());
  try {
    const result = (await env.AI.run(EXTRACT_MODEL as Parameters<Ai["run"]>[0], {
      messages: [{ role: "user", content: PROMPT(input.month) }],
      image: [...bytes],
      max_tokens: 4096,
      temperature: 0,
    } as never)) as { response?: string };
    return cleanRows(jsonArray(result.response ?? ""), input.month);
  } catch {
    return "unavailable";
  }
}

export type ImportResult = { values: number; created: number; confirmed: number; replaced: number; pending: string[] };

type Existing = { id: string; key: string; qualifier: string; current_id: string | null; current_hash: string | null };

/**
 * Imports a month (spec P7). New (date, prayer) facts are written in batches with the engine's own
 * verdict (no per-fact recompute); values that already exist get this person's vote and are handed back
 * for recompute. Stewards' imports replace differing values outright.
 */
export async function importTimetable(
  db: D1Database,
  input: {
    actor: Actor;
    steward: boolean;
    placeId: string;
    month: string;
    rows: TimetableRow[];
    photo: { id: string; approved: boolean } | null;
    now: number;
  },
): Promise<ImportResult> {
  const { actor, now } = input;
  const weight = voteWeight({ trustLevel: actor.trustLevel, source: "board", steward: input.steward, evidenceApproved: input.photo?.approved });
  const values = input.rows.flatMap((row) =>
    IQAMAH_PRAYERS.filter((prayer) => row[prayer]).map((prayer) => ({ key: `timetable.${prayer}`, qualifier: row.date, value: { t: row[prayer] as string } })),
  );
  const days = daysIn(input.month);
  const existingRows = await db
    .prepare(
      `SELECT fact.id, fact.key, fact.qualifier, fact.current_candidate_id AS current_id, fact_candidate.value_hash AS current_hash
       FROM fact LEFT JOIN fact_candidate ON fact_candidate.id = fact.current_candidate_id
       WHERE fact.place_id = ? AND fact.key LIKE 'timetable.%' AND fact.qualifier BETWEEN ? AND ?`,
    )
    .bind(input.placeId, days[0], days[days.length - 1])
    .all<Existing>();
  const existing = new Map((existingRows.results ?? []).map((row) => [`${row.key}|${row.qualifier}`, row]));

  const statements: D1PreparedStatement[] = [];
  const pending: string[] = [];
  const result: ImportResult = { values: values.length, created: 0, confirmed: 0, replaced: 0, pending };
  for (const item of values) {
    const hash = await valueHash(item.value);
    const valueJson = JSON.stringify(item.value);
    const found = existing.get(`${item.key}|${item.qualifier}`);
    const candidateId = ulid(now);
    const vote = (candidate: string) =>
      db
        .prepare(
          `INSERT INTO vote (id, candidate_id, user_id, polarity, source, weight, evidence_photo_id, created_at) VALUES (?, ?, ?, 1, 'board', ?, ?, ?)
           ON CONFLICT (candidate_id, user_id) DO UPDATE SET polarity = 1, weight = excluded.weight, evidence_photo_id = excluded.evidence_photo_id, created_at = excluded.created_at`,
        )
        .bind(ulid(now), candidate, actor.id, weight, input.photo?.id ?? null, now);

    if (!found) {
      // A brand-new fact with one vote: let the engine decide exactly as a recompute would.
      const engine: EngineCandidate = {
        id: candidateId,
        createdBy: actor.id,
        status: "candidate",
        effectiveFrom: item.qualifier,
        createdAt: now,
        votes: [{ userId: actor.id, polarity: 1, weight, createdAt: now, userCreatedAt: actor.createdAt }],
      };
      const outcome = evaluateFact([engine], now);
      const factId = ulid(now);
      const promoted = outcome.promotedId === candidateId;
      statements.push(
        db
          .prepare(
            `INSERT INTO fact (id, place_id, key, qualifier, current_candidate_id, state, confidence, last_confirmed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(factId, input.placeId, item.key, item.qualifier, promoted ? candidateId : null, outcome.state, outcome.confidence, outcome.lastConfirmedAt, now),
        db
          .prepare(
            `INSERT INTO fact_candidate (id, fact_id, value_json, value_hash, effective_from, status, score, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(candidateId, factId, valueJson, hash, item.qualifier, promoted ? "current" : "candidate", outcome.scores[candidateId] ?? 0, actor.id, now),
        vote(candidateId),
      );
      result.created += 1;
      continue;
    }

    if (found.current_hash === hash && found.current_id) {
      statements.push(vote(found.current_id));
      pending.push(found.id);
      result.confirmed += 1;
      continue;
    }

    const twin = await db
      .prepare(`SELECT id FROM fact_candidate WHERE fact_id = ? AND value_hash = ? AND status IN ('candidate', 'held')`)
      .bind(found.id, hash)
      .first<{ id: string }>();
    const target = twin?.id ?? candidateId;
    if (!twin) {
      statements.push(
        db
          .prepare(
            `INSERT INTO fact_candidate (id, fact_id, value_json, value_hash, effective_from, status, score, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'candidate', 0, ?, ?)`,
          )
          .bind(target, found.id, valueJson, hash, item.qualifier, actor.id, now),
      );
    }
    statements.push(vote(target));
    if (input.steward && found.current_id) {
      // Stewards' imports auto-promote (spec P7): the board is the mosque's own word.
      statements.push(
        db.prepare(`UPDATE fact_candidate SET status = 'superseded', effective_to = ? WHERE id = ?`).bind(item.qualifier, found.current_id),
        db.prepare(`UPDATE fact_candidate SET status = 'current' WHERE id = ?`).bind(target),
        db.prepare(`UPDATE fact SET current_candidate_id = ?, updated_at = ? WHERE id = ?`).bind(target, now, found.id),
        db
          .prepare(`INSERT INTO audit_log (id, actor_id, action, target_type, target_id, before_json, after_json, created_at) VALUES (?, ?, 'timetable_import', 'fact', ?, ?, ?, ?)`)
          .bind(ulid(now), actor.id, found.id, JSON.stringify({ candidateId: found.current_id }), JSON.stringify({ candidateId: target }), now),
      );
      result.replaced += 1;
    }
    pending.push(found.id);
  }

  const timetableId = ulid(now);
  statements.push(
    db
      .prepare(`INSERT INTO timetable (id, place_id, month, source_photo_id, status, rows_count, created_by, created_at) VALUES (?, ?, ?, ?, 'imported', ?, ?, ?)`)
      .bind(timetableId, input.placeId, input.month, input.photo?.id ?? null, values.length, actor.id, now),
    ...values.map((item) =>
      db
        .prepare(`INSERT INTO timetable_row (timetable_id, local_date, prayer, iqamah) VALUES (?, ?, ?, ?)`)
        .bind(timetableId, item.qualifier, item.key.slice("timetable.".length), item.value.t),
    ),
    db
      .prepare(`INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at) VALUES (?, ?, ?, 'timetable_imported', ?, ?)`)
      .bind(ulid(now), actor.id, input.placeId, JSON.stringify({ month: input.month, rows: values.length }), now),
  );
  for (let index = 0; index < statements.length; index += 90) await db.batch(statements.slice(index, index + 90));
  await refreshPlaceSummary(db, input.placeId, now);
  return result;
}

export type MonthCell = { adhan: string; iqamah: string | null; source: "timetable" | "standing" | null; state: string | null };

/** The month's timetable values (current candidates only), keyed by date then prayer. */
export async function monthValues(db: D1Database, placeId: string, month: string) {
  const days = daysIn(month);
  const rows = await db
    .prepare(
      `SELECT fact.key, fact.qualifier, fact.state, fact_candidate.value_json FROM fact
       JOIN fact_candidate ON fact_candidate.id = fact.current_candidate_id
       WHERE fact.place_id = ? AND fact.key LIKE 'timetable.%' AND fact.qualifier BETWEEN ? AND ?`,
    )
    .bind(placeId, days[0], days[days.length - 1])
    .all<{ key: string; qualifier: string; state: string; value_json: string }>();
  const values = new Map<string, { time: string; state: string }>();
  for (const row of rows.results ?? []) {
    const time = (JSON.parse(row.value_json) as { t?: string }).t;
    if (time) values.set(`${row.qualifier}|${row.key.slice("timetable.".length)}`, { time, state: row.state });
  }
  return values;
}
