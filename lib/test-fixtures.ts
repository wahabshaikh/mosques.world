import type { AppEnv } from "@/lib/db/client";

/** Test routes can mutate data and reveal OTPs. Every test environment needs a secret. */
export function testFixtureAllowed(
  env: Pick<AppEnv, "ENVIRONMENT" | "EMAIL_SINK" | "TEST_FIXTURE_SECRET">,
  request: Request,
): boolean {
  if (env.ENVIRONMENT !== "preview" && env.ENVIRONMENT !== "local")
    return false;
  if (env.EMAIL_SINK !== "1") return false;

  const secret = env.TEST_FIXTURE_SECRET;
  return Boolean(
    secret &&
    secret.length >= 32 &&
    request.headers.get("x-mw-test-secret") === secret,
  );
}
