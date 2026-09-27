import { dailyLimits, type TrustLevel } from "@/lib/trust/engine";

const DAY = 24 * 60 * 60 * 1000;

export type Usage = { votes: number; values: number };

/** Votes and new values in the last 24 hours (trust-level caps, spec 5.4). */
export async function dailyUsage(db: D1Database, userId: string, now: number): Promise<Usage> {
  const [votes, values] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM vote WHERE user_id = ? AND created_at > ?`).bind(userId, now - DAY),
    db.prepare(`SELECT COUNT(*) AS n FROM fact_candidate WHERE created_by = ? AND created_at > ?`).bind(userId, now - DAY),
  ]);
  return {
    votes: (votes?.results?.[0] as { n: number } | undefined)?.n ?? 0,
    values: (values?.results?.[0] as { n: number } | undefined)?.n ?? 0,
  };
}

export function limitProblem(level: TrustLevel, usage: Usage, adding: Usage): string | null {
  const limits = dailyLimits(level);
  if (usage.votes + adding.votes > limits.votes) {
    return `You've reached today's limit of ${limits.votes} confirmations. Limits grow as your contributions are accepted. Try again tomorrow.`;
  }
  if (usage.values + adding.values > limits.values) {
    return `You've reached today's limit of ${limits.values} new times. Limits grow as your contributions are accepted. Try again tomorrow.`;
  }
  return null;
}

/** Per-minute burst limit through the RL_WRITE binding; allows when the binding is absent. */
export async function writeAllowed(binding: RateLimit | undefined, key: string): Promise<boolean> {
  if (!binding) return true;
  const { success } = await binding.limit({ key });
  return success;
}
