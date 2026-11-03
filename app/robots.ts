import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
  const disallow = [
    "/sign-in",
    "/sign-up",
    "/verify",
    "/saved",
    "/admin",
    "/account",
    "/m/*/timetable/import",
    "/settings",
    "/onboarding",
  ];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: "ClaudeBot", allow: "/", disallow, crawlDelay: 5 },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
