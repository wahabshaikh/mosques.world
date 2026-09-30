import { env } from "cloudflare:workers";

function deploymentEnvironment(): string | undefined {
  return (env as { ENVIRONMENT?: string }).ENVIRONMENT;
}

/**
 * Whether a request is served outside production: local dev, or a Worker Preview on `workers.dev`.
 * Non-production turns on test hooks (`x-mw-*` headers, the email sink, unreleased phases), so the
 * hostname alone is not enough: the production Worker also answers on `*.workers.dev` Version URLs,
 * and those must keep production behaviour. The deployment's `ENVIRONMENT` var decides, and an
 * unset value counts as production.
 */
export function isNonProductionHost(host: string, environment = deploymentEnvironment()): boolean {
  if (host === "localhost" || host === "127.0.0.1") return true;
  return environment !== undefined && environment !== "production" && host.endsWith(".workers.dev");
}
