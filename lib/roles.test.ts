import { describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { roleGrantSql } from "./roles";

describe("role grants", () => {
  it("makes a moderator trust level 3 and audits it", () => {
    const { sqlite } = createTestD1();
    sqlite.exec(`INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('u1', 'A', 'mod@example.com', 0, 0)`);
    sqlite.exec(roleGrantSql(" Mod@Example.com ", "moderator", 5));
    expect(sqlite.prepare(`SELECT role, trust_level, trust_override FROM user WHERE id = 'u1'`).get()).toEqual({ role: "moderator", trust_level: 3, trust_override: 3 });
    expect(sqlite.prepare(`SELECT action, target_id FROM audit_log`).get()).toEqual({ action: "grant_role", target_id: "u1" });
    sqlite.exec(roleGrantSql("mod@example.com", "user", 6));
    expect(sqlite.prepare(`SELECT role, trust_override FROM user WHERE id = 'u1'`).get()).toEqual({ role: "user", trust_override: null });
  });

  it("rejects unknown roles, bad emails and escapes quotes", () => {
    expect(() => roleGrantSql("a@b.c", "owner", 0)).toThrow("Unknown role");
    expect(() => roleGrantSql("nope", "admin", 0)).toThrow("Not an email");
    expect(roleGrantSql("o'brien@example.com", "admin", 0)).toContain("'o''brien@example.com'");
  });
});
