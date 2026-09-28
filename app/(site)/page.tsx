import type { Metadata } from "next";
import { headers } from "next/headers";
import { translator } from "@/lib/i18n";
import { LOCALE_NAMES, languageAlternates, localePath, negotiate } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";
import { phase8Enabled } from "@/lib/phase";
import { ExplorePage } from "./explore-page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const languages = (await phase8Enabled().catch(() => false)) ? languageAlternates("/") : undefined;
  return {
    title: "Find a mosque",
    description: "Mosques and prayer spaces near you, with today's calculated adhan times.",
    alternates: { canonical: localePath(locale, "/"), ...(languages ? { languages } : {}) },
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const suggested = await suggestedLocale();
  return (
    <>
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
    if ((await getLocale()) !== "en" || !(await phase8Enabled())) return null;
    const locale = negotiate((await headers()).get("accept-language"));
    if (locale === "en") return null;
    return { locale, href: localePath(locale, "/"), text: translator(locale).t("suggest.available", { language: LOCALE_NAMES[locale] }) };
  } catch {
    return null;
  }
}
