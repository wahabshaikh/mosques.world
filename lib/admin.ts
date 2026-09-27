import { z } from "zod";
import { ulid } from "@/lib/id";

export const heldAction = z.object({ action: z.enum(["approve", "reject"]) });
export const reportAction = z.object({ status: z.enum(["resolved", "dismissed"]) });
export const userAction = z.object({
  trustOverride: z.union([z.number().int().min(0).max(3), z.null()]).optional(),
  ban: z.union([z.object({ reason: z.string().trim().min(3).max(200) }), z.literal(false)]).optional(),
});

export function auditStatement(
  db: D1Database,
  input: { actorId: string; action: string; targetType: string; targetId: string; before: unknown; after: unknown; now: number },
) {
  return db
    .prepare(
      `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(ulid(input.now), input.actorId, input.action, input.targetType, input.targetId, JSON.stringify(input.before), JSON.stringify(input.after), input.now);
}
