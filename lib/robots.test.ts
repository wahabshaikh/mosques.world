import { describe, expect, it } from "vitest";
import robots from "../app/robots";

describe("robots", () => {
  it("excludes auth-only and import routes for both crawlers and slows ClaudeBot", () => {
    const disallow = [
      "/sign-in", "/sign-up", "/verify", "/saved", "/admin", "/account",
      "/m/*/timetable/import", "/settings", "/onboarding",
    ];
    expect(robots().rules).toEqual([
      { userAgent: "*", allow: "/", disallow },
      { userAgent: "ClaudeBot", allow: "/", disallow, crawlDelay: 5 },
    ]);
  });

  it("keeps the sitemap and host", () => {
    const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
    expect(robots()).toMatchObject({ sitemap: `${base}/sitemap.xml`, host: base });
  });
});
