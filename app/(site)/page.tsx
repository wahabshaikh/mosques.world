import type { Metadata } from "next";
import { headers } from "next/headers";
import { translator } from "@/lib/i18n";
import { LOCALE_NAMES, languageAlternates, localePath, negotiate } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";
import { ExplorePage } from "./explore-page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const languages = languageAlternates("/");
  return {
    title: "Mosques near me: prayer and iqamah times",
    description: "Find mosques near you with today's jamā'ah (iqamah) times, kept accurate by the community, and the calculated prayer times for your area.",
    alternates: { canonical: localePath(locale, "/"), ...(languages ? { languages } : {}) },
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const suggested = await suggestedLocale();
  const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
  // Sitelinks search box and a named publisher, for search engines and answer engines.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "mosques.world",
      url: base,
      potentialAction: { "@type": "SearchAction", target: `${base}/search?where={search_term_string}`, "query-input": "required name=search_term_string" },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "mosques.world",
      url: base,
      logo: `${base}/icons/apple-touch-icon.png`,
      description: "A community directory of mosques with jamā'ah (iqamah) times kept accurate by the people who pray there.",
    },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {suggested ? (
        <p className="bg-primary-soft px-4 py-2 text-center text-sm" lang={suggested.locale} data-testid="locale-suggestion">
          <a href={suggested.href} className="font-semibold text-primary underline">
            {suggested.text}
          </a>
        </p>
      ) : null}
      <ExplorePage searchParams={searchParams} />
    </>
  );
}

/**
 * Unprefixed pages stay English so no URL changes (spec P8); the home page (never the CDN-cached
 * mosque and city pages) offers the visitor's own language when we have it.
 */
async function suggestedLocale() {
  try {
    if ((await getLocale()) !== "en") return null;
    const locale = negotiate((await headers()).get("accept-language"));
    if (locale === "en") return null;
    return { locale, href: localePath(locale, "/"), text: translator(locale).t("suggest.available", { language: LOCALE_NAMES[locale] }) };
  } catch {
    return null;
  }
}
