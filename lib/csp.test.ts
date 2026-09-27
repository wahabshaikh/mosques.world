import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

describe("contentSecurityPolicy", () => {
  it("allows Cloudflare Web Analytics and Sentry ingest", () => {
    for (const policy of [contentSecurityPolicy(false), contentSecurityPolicy(true)]) {
      const sources = policy.split("; ").flatMap((directive) => directive.split(" "));
      expect(sources).toContain("https://static.cloudflareinsights.com/beacon.min.js");
      expect(sources).toContain("https://cloudflareinsights.com");
      expect(sources).toContain("https://*.ingest.sentry.io");
      expect(sources).toContain("https://*.ingest.us.sentry.io");
      expect(sources).toContain("https://*.ingest.de.sentry.io");
      expect(sources).not.toContain("https://*.sentry.io");
      expect(sources).not.toContain("https://*.cloudflare.com");
    }
  });

  it("keeps unsafe-eval off production script-src", () => {
    expect(contentSecurityPolicy(false)).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy(true)).toContain("'unsafe-eval'");
  });
});
