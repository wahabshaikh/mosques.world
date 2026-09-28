import { z } from "zod";
import { bboxAround, haversineKm } from "@/lib/geo/distance";
import { GEO_VERIFY_METRES } from "@/lib/checkins";
import type { PrayerDay } from "@/lib/prayer/times";
import { AMENITIES, factLabel, formatTime12, iqamahValue, IQAMAH_PRAYERS, isAmenityKey, resolveIqamah } from "@/lib/trust/facts";
import type { FactView } from "@/lib/trust/read";
import { castVote, submitValue, TrustError, type Actor } from "@/lib/trust/store";

/**
 * Quick verify at the mosque (spec P5, flow F6): the nearest place within 150 m, then up to three
 * one-tap questions ranked by how much an answer would help — open disputes, then stale values,
 * then unverified ones, then missing amenities, then a timetable photo.
 */

export type NearbyPlace = { id: string; slug: string; name: string; locality: string | null; distanceM: number };

export async function placesWithin(db: D1Database, lat: number, lng: number, metres = GEO_VERIFY_METRES): Promise<NearbyPlace[]> {
  const box = bboxAround(lat, lng, metres / 1000 + 0.02);
  const rows = await db
    .prepare(
      `SELECT id, slug, name, locality, lat, lng FROM place
       WHERE status = 'active' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 50`,
    )
    .bind(box.south, box.north, box.west, box.east)
    .all<{ id: string; slug: string; name: string; locality: string | null; lat: number; lng: number }>();
  return (rows.results ?? [])
    .map((row) => ({ id: row.id, slug: row.slug, name: row.name, locality: row.locality, distanceM: Math.round(haversineKm(lat, lng, row.lat, row.lng) * 1000) }))
    .filter((row) => row.distanceM <= metres)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 5);
}

export const locationInput = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const verifyAnswer = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("vote"), candidateId: z.string().min(1).max(64), polarity: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({ kind: z.literal("value"), key: z.string().refine(isAmenityKey), value: z.object({ v: z.boolean() }) }),
]);
export type VerifyAnswer = z.infer<typeof verifyAnswer>;

export type VerifyOption = { label: string; answer?: VerifyAnswer; action?: "update" | "photo" | "skip"; style: "primary" | "secondary" | "tertiary" };

export type VerifyQuestion = {
  id: string;
  kind: "dispute" | "stale" | "unverified" | "amenity" | "photo";
  /** The question, split so the value can be emphasised: `${before}${highlight}${after}`. */
  before: string;
  highlight?: string;
  after?: string;
  hint: string;
  context?: string;
  options: VerifyOption[];
};

const AMENITY_PROMPTS: Partial<Record<(typeof AMENITIES)[number]["key"], string>> = {
  "amenity.women_section": "Is there a women's section?",
  "amenity.wudhu_men": "Is there a wudhu area for men?",
  "amenity.wudhu_women": "Is there a wudhu area for women?",
  "amenity.step_free": "Is there step-free access?",
  "amenity.toilets": "Are there toilets?",
};

const SKIP: VerifyOption = { label: "Not sure — skip", action: "skip", style: "tertiary" };

function iqamahLabel(fact: FactView, candidate: "current" | "challenger", day: PrayerDay): string | null {
  const value = candidate === "current" ? fact.current?.value : fact.challenger?.value;
  const prayer = fact.key.slice("iqamah.".length);
  const adhan = day.rows.find((row) => row.key === prayer)?.adhan;
  const parsed = iqamahValue.safeParse(value);
  if (!parsed.success || !adhan) return null;
  return formatTime12(resolveIqamah(parsed.data, adhan));
}

function short(label: string) {
  return label.replace(/ (AM|PM)$/, "");
}

/** Ranks and phrases up to `limit` questions for this person at this place. */
export function chooseQuestions(input: {
  facts: FactView[];
  day: PrayerDay;
  myVotes: Record<string, 1 | -1>;
  hasRecentTimetablePhoto: boolean;
  limit?: number;
}): VerifyQuestion[] {
  const { facts, day, myVotes } = input;
  const voted = (id: string | undefined) => (id ? myVotes[id] !== undefined : false);
  const iqamah = facts.filter((fact) => (IQAMAH_PRAYERS as readonly string[]).includes(fact.key.slice("iqamah.".length)) && fact.key.startsWith("iqamah."));
  const order = (fact: FactView) => IQAMAH_PRAYERS.indexOf(fact.key.slice("iqamah.".length) as (typeof IQAMAH_PRAYERS)[number]);
  const questions: VerifyQuestion[] = [];

  const disputes = iqamah
    .filter((fact) => fact.current && fact.challenger && !voted(fact.current.candidateId) && !voted(fact.challenger.candidateId))
    .sort((a, b) => (b.challenger?.backers ?? 0) - (a.challenger?.backers ?? 0) || order(a) - order(b));
  for (const fact of disputes) {
    const current = iqamahLabel(fact, "current", day);
    const challenger = iqamahLabel(fact, "challenger", day);
    if (!current || !challenger || !fact.current || !fact.challenger) continue;
    const people = fact.challenger.backers;
    questions.push({
      id: `dispute:${fact.key}`,
      kind: "dispute",
      before: `Is ${factLabel(fact.key)} iqamah now `,
      highlight: challenger,
      after: "?",
      hint: "Check the timetable board by the entrance.",
      context: `${people} ${people === 1 ? "person" : "people"} reported a change`,
      options: [
        { label: `Yes, it's ${short(challenger)}`, answer: { kind: "vote", candidateId: fact.challenger.candidateId, polarity: 1 }, style: "primary" },
        { label: `No, still ${short(current)}`, answer: { kind: "vote", candidateId: fact.current.candidateId, polarity: 1 }, style: "secondary" },
        { label: "It's something else", action: "update", style: "tertiary" },
      ],
    });
  }

  const confirmable = (state: FactView["state"]) =>
    iqamah
      .filter((fact) => fact.state === state && fact.current && !fact.challenger && !voted(fact.current.candidateId))
      .sort((a, b) => (a.current?.lastConfirmedAt ?? 0) - (b.current?.lastConfirmedAt ?? 0) || order(a) - order(b));
  for (const [state, kind] of [
    ["stale", "stale"],
    ["unverified", "unverified"],
  ] as const) {
    for (const fact of confirmable(state)) {
      const current = iqamahLabel(fact, "current", day);
      if (!current || !fact.current) continue;
      questions.push({
        id: `${kind}:${fact.key}`,
        kind,
        before: kind === "stale" ? `Is ${factLabel(fact.key)} iqamah still ` : `Is ${factLabel(fact.key)} iqamah `,
        highlight: current,
        after: "?",
        hint: "Only answer what you can see on the board or were told here.",
        context: kind === "stale" ? "Not confirmed for a while" : "Only one person has added this",
        options: [
          { label: `Yes, ${short(current)}`, answer: { kind: "vote", candidateId: fact.current.candidateId, polarity: 1 }, style: "primary" },
          { label: "No, it's different", action: "update", style: "secondary" },
          SKIP,
        ],
      });
    }
  }

  const known = new Set(facts.filter((fact) => fact.current).map((fact) => fact.key));
  for (const amenity of AMENITIES) {
    const prompt = AMENITY_PROMPTS[amenity.key];
    if (!prompt || known.has(amenity.key)) continue;
    questions.push({
      id: `amenity:${amenity.key}`,
      kind: "amenity",
      before: prompt,
      hint: "Skip if you can't tell — only answer what you've seen.",
      options: [
        { label: "Yes", answer: { kind: "value", key: amenity.key, value: { v: true } }, style: "primary" },
        { label: "No", answer: { kind: "value", key: amenity.key, value: { v: false } }, style: "secondary" },
        SKIP,
      ],
    });
  }

  if (!input.hasRecentTimetablePhoto) {
    questions.push({
      id: "photo:timetable",
      kind: "photo",
      before: "Snap the timetable board?",
      hint: "One photo keeps a whole month of times honest.",
      options: [
        { label: "Open camera", action: "photo", style: "primary" },
        { label: "Maybe next time", action: "skip", style: "secondary" },
      ],
    });
  }

  return questions.slice(0, input.limit ?? 3);
}

/** Records one answer as a geo-verified vote or value (weight ×1.5). */
export async function applyAnswer(
  db: D1Database,
  input: { actor: Actor; placeId: string; answer: VerifyAnswer; today: string; now: number },
) {
  const { answer } = input;
  if (answer.kind === "vote") {
    const owner = await db
      .prepare(`SELECT fact.place_id FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id WHERE fact_candidate.id = ?`)
      .bind(answer.candidateId)
      .first<{ place_id: string }>();
    if (owner?.place_id !== input.placeId) throw new TrustError("That question is for another place.", 400);
    return castVote(db, { actor: input.actor, candidateId: answer.candidateId, polarity: answer.polarity, source: "observed", now: input.now, geoVerified: true });
  }
  return submitValue(db, {
    actor: input.actor,
    placeId: input.placeId,
    key: answer.key,
    qualifier: "",
    value: answer.value,
    effectiveFrom: input.today,
    source: "observed",
    now: input.now,
    geoVerified: true,
  });
}
