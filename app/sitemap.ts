import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
  const entries = await sitemapEntries();
  return entries.slice(0, 50000).map((entry) => ({
    url: `${base}${entry.path}`,
    changeFrequency: "daily" as const,
  }));
}
