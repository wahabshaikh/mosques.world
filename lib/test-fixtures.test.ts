import { describe, expect, it } from "vitest";
import { testFixtureAllowed } from "./test-fixtures";

const secret = "preview-test-secret-with-32-plus-characters";
const request = (host: string, token?: string) =>
  new Request(`https://${host}/api/v1/test/fixtures`, {
    headers: token ? { "x-mw-test-secret": token } : {},
  });

describe("test fixture access", () => {
  it("never exposes test routes in production, even with a localhost host or sink misconfiguration", () => {
    expect(
      testFixtureAllowed(
        {
          ENVIRONMENT: "production",
          EMAIL_SINK: "1",
          TEST_FIXTURE_SECRET: secret,
        },
        request("127.0.0.1", secret),
      ),
    ).toBe(false);
    expect(
      testFixtureAllowed(
        { ENVIRONMENT: "production", EMAIL_SINK: "1" },
        request("mosques-world.x.workers.dev"),
      ),
    ).toBe(false);
  });

  it("requires a secret on preview", () => {
    const env = {
      ENVIRONMENT: "preview",
      EMAIL_SINK: "1",
      TEST_FIXTURE_SECRET: secret,
    };
    expect(testFixtureAllowed(env, request("preview.workers.dev"))).toBe(false);
    expect(
      testFixtureAllowed(env, request("preview.workers.dev", secret)),
    ).toBe(true);
    expect(
      testFixtureAllowed(
        { ...env, TEST_FIXTURE_SECRET: "short" },
        request("preview.workers.dev", "short"),
      ),
    ).toBe(false);
    expect(testFixtureAllowed(env, request("127.0.0.1"))).toBe(false);
  });

  it("also requires a secret for local tests", () => {
    expect(
      testFixtureAllowed(
        {
          ENVIRONMENT: "preview",
          EMAIL_SINK: "1",
          TEST_FIXTURE_SECRET: secret,
        },
        request("127.0.0.1", secret),
      ),
    ).toBe(true);
    expect(
      testFixtureAllowed(
        { ENVIRONMENT: "preview", EMAIL_SINK: "1" },
        request("127.0.0.1"),
      ),
    ).toBe(false);
    expect(
      testFixtureAllowed(
        { ENVIRONMENT: "preview", EMAIL_SINK: "0" },
        request("127.0.0.1"),
      ),
    ).toBe(false);
  });
});
