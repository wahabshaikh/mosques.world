const CLOUDFLARE_INSIGHTS_SCRIPT = "https://static.cloudflareinsights.com/beacon.min.js";

const SENTRY_INGEST = [
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  "https://*.ingest.de.sentry.io",
];

export function contentSecurityPolicy(nonProd: boolean, embeddable = false): string {
  const scriptSrc = [
    "script-src 'self' 'unsafe-inline'",
    nonProd ? "'unsafe-eval'" : "",
    "https://datafa.st",
    "https://challenges.cloudflare.com",
    CLOUDFLARE_INSIGHTS_SCRIPT,
  ]
    .filter(Boolean)
    .join(" ");

  const connectSrc = [
    "connect-src 'self'",
    "https://tiles.openfreemap.org",
    "https://*.openfreemap.org",
    "https://datafa.st",
    "https://cloudflareinsights.com",
    ...SENTRY_INGEST,
    "https://challenges.cloudflare.com",
  ].join(" ");

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tiles.openfreemap.org https://*.openfreemap.org",
    connectSrc,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "frame-src https://challenges.cloudflare.com https://www.openstreetmap.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    embeddable ? "frame-ancestors *" : "frame-ancestors 'none'",
  ].join("; ");
}
