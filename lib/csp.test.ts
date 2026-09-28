import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

function directive(policy: string, name: string): string[] {
  const found = policy.split("; ").find((part) => part.startsWith(`${name} `));
  return found ? found.split(" ").slice(1) : [];
}

/** Minimal CSP host-source matcher (scheme + exact host + path, trailing "/" = prefix). */
function allows(sources: string[], url: string): boolean {
  const target = new URL(url);
  return sources.some((source) => {
    if (!source.startsWith("https://")) return false;
    const parsed = new URL(source);
    const hostMatches = parsed.hostname.startsWith("*.")
      ? target.hostname.endsWith(parsed.hostname.slice(1))
      : target.hostname === parsed.hostname;
    if (!hostMatches || target.protocol !== parsed.protocol) return false;
    const path = source.slice(parsed.origin.length);
    if (!path || path === "/") return true;
    return path.endsWith("/")
      ? target.pathname.startsWith(path)
      : target.pathname === path;
  });
}

describe("contentSecurityPolicy", () => {
  it("allows Cloudflare Web Analytics and Sentry ingest", () => {
    for (const policy of [
      contentSecurityPolicy(false),
      contentSecurityPolicy(true),
    ]) {
      const sources = policy.split("; ").flatMap((part) => part.split(" "));
      expect(sources).toContain(
        "https://static.cloudflareinsights.com/beacon.min.js",
      );
      expect(sources).toContain(
        "https://static.cloudflareinsights.com/beacon.min.js/",
      );
      expect(sources).toContain("https://cloudflareinsights.com");
      expect(sources).toContain("https://*.ingest.sentry.io");
      expect(sources).toContain("https://*.ingest.us.sentry.io");
      expect(sources).toContain("https://*.ingest.de.sentry.io");
      expect(sources).not.toContain("https://*.sentry.io");
      expect(sources).not.toContain("https://*.cloudflare.com");
      expect(sources).not.toContain("https://static.cloudflareinsights.com");
    }
  });

  it("lets the versioned Insights beacon load and report, and nothing else on that host", () => {
    for (const policy of [
      contentSecurityPolicy(false),
      contentSecurityPolicy(true),
    ]) {
      const scriptSrc = directive(policy, "script-src");
      expect(
        allows(
          scriptSrc,
          "https://static.cloudflareinsights.com/beacon.min.js",
        ),
      ).toBe(true);
      expect(
        allows(
          scriptSrc,
          "https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495",
        ),
      ).toBe(true);
      expect(
        allows(scriptSrc, "https://static.cloudflareinsights.com/other.js"),
      ).toBe(false);
      expect(allows(scriptSrc, "https://evil.example/beacon.min.js/v1")).toBe(
        false,
      );

      const connectSrc = directive(policy, "connect-src");
      expect(
        allows(connectSrc, "https://cloudflareinsights.com/cdn-cgi/rum"),
      ).toBe(true);
    }
  });

  it("keeps unsafe-eval off production script-src", () => {
    expect(contentSecurityPolicy(false)).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy(true)).toContain("'unsafe-eval'");
  });
});
