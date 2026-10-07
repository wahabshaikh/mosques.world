/**
 * Locales (spec P8). Prefixed routes `/{locale}/…` sit alongside the unprefixed ones, which stay
 * English so no existing URL changes; the proxy rewrites a prefixed path onto the same page
 * and passes the locale in `x-mw-locale`.
 */

export const LOCALES = ["en", "ar", "ur", "bn", "id", "ms", "tr", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Locales served under a prefix (English is the unprefixed default). */
export const PREFIXED_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  ur: "اردو",
  bn: "বাংলা",
  id: "Bahasa Indonesia",
  ms: "Bahasa Melayu",
  tr: "Türkçe",
  fr: "Français",
};

const RTL = new Set<Locale>(["ar", "ur"]);

/** Clock style people expect in each language (spec 3: 12h/24h by locale). */
const HOUR12: Record<Locale, boolean> = { en: true, ar: true, ur: true, bn: true, id: false, ms: true, tr: false, fr: false };

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value) && (LOCALES as readonly string[]).includes(value as string);
}

export function direction(locale: Locale): "rtl" | "ltr" {
  return RTL.has(locale) ? "rtl" : "ltr";
}

export function uses12h(locale: Locale): boolean {
  return HOUR12[locale];
}

/** Paths that are never localized: APIs, feeds, media and static files. */
export function localizable(path: string): boolean {
  return !/^\/(api|og|media|calendar|map|icons|fonts|_next|open-data\/files)(\/|$)/.test(path) && !/\.[a-z0-9]+$/i.test(path);
}

/** `/ar/m/x` → `{ locale: "ar", path: "/m/x" }`; null for unprefixed or non-page paths. */
export function splitLocale(pathname: string): { locale: Locale; path: string } | null {
  const match = /^\/([a-z]{2})(\/.*)?$/.exec(pathname);
  if (!match || !isLocale(match[1])) return null;
  const path = match[2] || "/";
  if (!localizable(path)) return null;
  return { locale: match[1], path };
}

/** The URL of `path` in `locale` (English stays unprefixed). */
export function localePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE || !localizable(path.split("?")[0] ?? path)) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** hreflang alternates for a page, keyed by language plus `x-default`. */
export function languageAlternates(path: string): Record<string, string> {
  const alternates: Record<string, string> = { "x-default": path };
  for (const locale of LOCALES) alternates[locale] = localePath(locale, path);
  return alternates;
}

/** Best supported locale from an Accept-Language header (English when nothing better matches). */
export function negotiate(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((param) => /^q=([\d.]+)$/.exec(param.trim())?.[1]).find(Boolean);
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((item) => item.tag && item.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
