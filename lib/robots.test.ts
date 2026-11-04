import { describe, expect, it } from "vitest";
import robots, { AI_CRAWLERS } from "../app/robots";

describe("robots", () => {
  it("excludes auth-only and import routes for all crawlers and blocks AI crawlers entirely", () => {
    const disallow = [
      "/sign-in", "/sign-up", "/verify", "/saved", "/admin", "/account",
      "/m/*/timetable/import", "/settings", "/onboarding",
    ];
    expect(robots().rules).toEqual([
      { userAgent: "*", allow: "/", disallow },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, disallow: "/" })),
    ]);
  });

  it("disallows all 16 AI crawlers with no ClaudeBot allow", () => {
    expect(AI_CRAWLERS).toHaveLength(16);
    const rules = robots().rules as { userAgent: string; allow?: string; disallow: unknown }[];
    for (const ua of AI_CRAWLERS) {
      const r = rules.filter((x) => x.userAgent === ua);
      expect(r).toEqual([{ userAgent: ua, disallow: "/" }]);
    }
    expect(rules.some((r) => r.userAgent === "ClaudeBot" && r.allow)).toBe(false);
  });

  it("keeps the sitemap and host", () => {
    const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
    expect(robots()).toMatchObject({ sitemap: `${base}/sitemap.xml`, host: base });
  });
});
