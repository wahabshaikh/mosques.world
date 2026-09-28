import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";

type CfFields = { latitude?: string | number; longitude?: string | number };

export function middleware(request: NextRequest) {
  const host = request.nextUrl.hostname;
  if (host === "www.mosques.world") {
    const url = request.nextUrl.clone();
    url.hostname = "mosques.world";
    return NextResponse.redirect(url, 308);
  }

  const cf = (request as NextRequest & { cf?: CfFields }).cf;
  const headers = new Headers(request.headers);
  const nonProd = host === "localhost" || host === "127.0.0.1" || host.endsWith(".workers.dev");
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

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy(nonProd));
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(self)");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  if (!nonProd) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  const path = request.nextUrl.pathname;
  const signedIn = request.cookies.getAll().some((cookie) => cookie.name.endsWith("better-auth.session_token"));
  const shared = (path.startsWith("/m/") && !path.endsWith("/update")) || path.startsWith("/cities/");
  if (request.method === "GET" && shared && !signedIn) {
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
  } else if (signedIn && !path.startsWith("/media/") && !path.startsWith("/api/")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|map/).*)"],
};
