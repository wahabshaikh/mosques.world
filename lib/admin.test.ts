import { describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { auditStatement, heldAction, reportAction, userAction } from "./admin";

describe("admin inputs", () => {
  it("validates moderator actions", () => {
    expect(heldAction.safeParse({ action: "approve" }).success).toBe(true);
    expect(heldAction.safeParse({ action: "delete" }).success).toBe(false);
    expect(reportAction.safeParse({ status: "dismissed" }).success).toBe(true);
    expect(userAction.parse({ trustOverride: null, ban: false })).toEqual({ trustOverride: null, ban: false });
    expect(userAction.safeParse({ ban: { reason: "x" } }).success).toBe(false);
    expect(userAction.safeParse({ trustOverride: 4 }).success).toBe(false);
  });

  it("writes audit rows", async () => {
    const { d1, sqlite } = createTestD1();
    await auditStatement(d1, { actorId: "m", action: "ban", targetType: "user", targetId: "u", before: { banned: false }, after: { banned: true }, now: 1 }).run();
    expect(sqlite.prepare(`SELECT action, before_json, after_json FROM audit_log`).get()).toEqual({
      action: "ban",
      before_json: '{"banned":false}',
      after_json: '{"banned":true}',
    });
  });
});
