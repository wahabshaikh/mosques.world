import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";
import { appEnv } from "@/lib/db/client";
import { flagEnabled, PHASE8_FLAG } from "@/lib/flags";
import { DEFAULT_LOCALE, splitLocale, type Locale } from "@/lib/i18n/config";

type CfFields = { latitude?: string | number; longitude?: string | number };

export async function middleware(request: NextRequest) {
  const host = request.nextUrl.hostname;
  if (host === "www.mosques.world") {
    const url = request.nextUrl.clone();
    url.hostname = "mosques.world";
    return NextResponse.redirect(url, 308);
  }

  // `/{locale}/…` (spec P8) renders the same page in another language; `/en/…` is the unprefixed URL.
  const split = splitLocale(request.nextUrl.pathname);
  if (split?.locale === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = split.path;
    return NextResponse.redirect(url, 308);
  }
  let locale: Locale | null = null;
  if (split && (await localesOn(request, host))) locale = split.locale;

  // Profiles live at app/(site)/u/[username] because `@folders` are parallel-route slots; `/@name`
  // is the canonical URL and `/u/name` 308-redirects to it (spec 4.2).
  const rawPath = locale && split ? split.path : request.nextUrl.pathname;
  const profilePath = rawPath.replace(/^\/%40/i, "/@");
  const rewritten = request.headers.get("x-mw-profile") === "1";
  const legacy = /^\/u\/([^/]+)(\/map)?\/?$/.exec(rawPath);
  if (legacy && !rewritten) {
    const url = request.nextUrl.clone();
    url.pathname = `${locale ? `/${locale}` : ""}/@${legacy[1]}${legacy[2] ?? ""}`;
    return NextResponse.redirect(url, 308);
  }
  const profile = /^\/@([^/]+)(\/map)?\/?$/.exec(profilePath);

  const cf = (request as NextRequest & { cf?: CfFields }).cf;
  const headers = new Headers(request.headers);
  headers.delete("x-mw-locale");
  headers.delete("x-mw-path");
  if (locale) headers.set("x-mw-locale", locale);
  const environment = appEnv().ENVIRONMENT;
  const nonProd = environment === "preview" || environment === "local";
  if (!nonProd) {
    headers.delete("x-mw-latitude");
    headers.delete("x-mw-longitude");
    headers.delete("x-mw-now");
  }
  const hasTestGeo = nonProd && headers.get("x-mw-latitude") && headers.get("x-mw-longitude");
  if (!hasTestGeo && cf?.latitude != null && cf.longitude != null) {
    headers.set("x-mw-latitude", String(cf.latitude));
    headers.set("x-mw-longitude", String(cf.longitude));
  }

  let response: NextResponse;
  if (profile) {
    headers.set("x-mw-profile", "1");
    const url = request.nextUrl.clone();
    url.pathname = `/u/${profile[1]}${profile[2] ?? ""}`;
    response = NextResponse.rewrite(url, { request: { headers } });
  } else if (locale) {
    const url = request.nextUrl.clone();
    url.pathname = rawPath;
    response = NextResponse.rewrite(url, { request: { headers } });
  } else {
    response = NextResponse.next({ request: { headers } });
  }
  // `/@name/map?embed=1` is meant to be iframed on other sites (spec P4).
  const embeddable = Boolean(profile?.[2]) && request.nextUrl.searchParams.get("embed") === "1";
  response.headers.set("Content-Security-Policy", contentSecurityPolicy(nonProd, embeddable));
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(self)");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (!embeddable) response.headers.set("X-Frame-Options", "DENY");
  if (!nonProd) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  const path = rawPath;
  const signedIn = request.cookies.getAll().some((cookie) => cookie.name.endsWith("better-auth.session_token"));
  const shared = (path.startsWith("/m/") && !path.endsWith("/update")) || path.startsWith("/cities/");
  if (path === "/sw.js" || path === "/manifest.webmanifest") {
    response.headers.set("Cache-Control", "no-cache");
  } else if (request.method === "GET" && shared && !signedIn) {
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
  } else if (signedIn && !path.startsWith("/media/") && !path.startsWith("/api/")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

/** Localized routes are dark-launched with Phase 8; while off, `/ar/…` is simply not found. */
async function localesOn(request: NextRequest, host: string): Promise<boolean> {
  try {
    const env = appEnv();
    return await flagEnabled(env.FLAGS, PHASE8_FLAG, { environment: env.ENVIRONMENT, bucketKey: request.headers.get("cf-connecting-ip") ?? host });
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|map/).*)"],
};
