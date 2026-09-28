import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { translator } from "./index";

/** The request's locale, set by the middleware for `/{locale}/…` paths (unprefixed = English). */
export async function getLocale(): Promise<Locale> {
  try {
    const value = (await headers()).get("x-mw-locale");
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function getTranslator() {
  return translator(await getLocale());
}
