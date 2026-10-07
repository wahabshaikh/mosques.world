import { env } from "cloudflare:workers";

function deploymentEnvironment(): string | undefined {
  return (env as { ENVIRONMENT?: string }).ENVIRONMENT;
}

/**
 * Whether a request is served outside production: local dev, or a Worker Preview on `workers.dev`.
 * Non-production turns on test hooks (`x-mw-*` headers, the email sink, `/api/v1/test/*`), so the
 * hostname alone is not enough: the production Worker also answers on `*.workers.dev` Version URLs,
 * and those must keep production behaviour. The deployment's `ENVIRONMENT` var decides, and an
 * unset value counts as production.
 */
export function isNonProductionHost(host: string, environment = deploymentEnvironment()): boolean {
  if (host === "localhost" || host === "127.0.0.1") return true;
  return environment !== undefined && environment !== "production" && host.endsWith(".workers.dev");
}

/**
 * Base URL for links a request sends out (emails, feeds). Outside production that is the request's own
 * origin, so a link from a Preview opens that Preview; in production it is PUBLIC_BASE_URL.
 */
export function linkBase(requestUrl: string, publicBaseUrl: string | undefined, environment = deploymentEnvironment()): string {
  const url = new URL(requestUrl);
  if (isNonProductionHost(url.hostname, environment)) return url.origin;
  return publicBaseUrl || "https://mosques.world";
}
