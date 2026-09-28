"use client";

import { Languages } from "lucide-react";
import { usePathname } from "next/navigation";
import { LOCALE_NAMES, LOCALES, localePath, splitLocale, type Locale } from "@/lib/i18n/config";

/**
 * Links to this page in every language: full loads, since `lang`/`dir` live on <html>. Client-side
 * because layouts must not depend on the request path (vinext reuses them across navigations).
 */
export function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname() || "/";
  const path = splitLocale(pathname)?.path ?? pathname;
  return (
    <details className="relative" data-testid="language-switcher">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 hover:text-foreground">
        <Languages className="size-4" aria-hidden="true" />
        <span className="sr-only">{label}: </span>
        {LOCALE_NAMES[locale]}
      </summary>
      <ul className="absolute bottom-full z-30 mb-2 w-52 rounded-xl border border-border bg-background p-1 shadow-lg end-0">
        {LOCALES.map((item) => (
          <li key={item}>
            <a
              href={localePath(item, path)}
              hrefLang={item}
              lang={item}
              aria-current={item === locale ? "true" : undefined}
              className="block rounded-lg px-3 py-2 text-foreground hover:bg-muted aria-[current=true]:font-bold"
            >
              {LOCALE_NAMES[item]}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
