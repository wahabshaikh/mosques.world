import type { MetadataRoute } from "next";
import { AI_CRAWLERS } from "@/lib/crawlers";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
  return {
    rules: [{ userAgent: "*", allow: "/" }, ...AI_CRAWLERS.map((userAgent) => ({ userAgent, disallow: "/" }))],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
