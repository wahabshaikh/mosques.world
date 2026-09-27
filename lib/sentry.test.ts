import { describe, expect, it } from "vitest";
import { SENTRY_TRACES_SAMPLE_RATE, sentryOptions } from "./sentry";

describe("sentryOptions", () => {
  it("stays disabled when the DSN is missing or blank", () => {
    expect(sentryOptions({})).toEqual({ enabled: false, tracesSampleRate: 0 });
    expect(sentryOptions({ SENTRY_DSN: "   " })).toEqual({ enabled: false, tracesSampleRate: 0 });
  });

  it("reports with a low trace sample rate when the DSN is set", () => {
    const options = sentryOptions({ SENTRY_DSN: " https://example@o1.ingest.sentry.io/1 ", ENVIRONMENT: "preview" });
    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe("https://example@o1.ingest.sentry.io/1");
    expect(options.tracesSampleRate).toBe(SENTRY_TRACES_SAMPLE_RATE);
    expect(options.tracesSampleRate).toBeLessThan(1);
    expect(options.environment).toBe("preview");
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
  });
});
