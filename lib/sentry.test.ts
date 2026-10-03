import { describe, expect, it } from "vitest";
import { SENTRY_TRACES_SAMPLE_RATE, browserSentryOptions, captureClientException, sentryDataCollection, sentryOptions, setClientExceptionCapture } from "./sentry";

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
    expect(options.dataCollection).toEqual(sentryDataCollection);
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
    });
  });
});

describe("browserSentryOptions", () => {
  it("stays uninitialized when the public DSN is missing or blank", () => {
    expect(browserSentryOptions({})).toBeNull();
    expect(browserSentryOptions({ dsn: "   ", environment: "preview" })).toBeNull();
  });

  it("reuses the worker privacy settings and sample rate", () => {
    const options = browserSentryOptions({
      dsn: " https://example@o1.ingest.us.sentry.io/1 ",
      environment: " production ",
    });
    expect(options).toEqual({
      dsn: "https://example@o1.ingest.us.sentry.io/1",
      enabled: true,
      tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
      environment: "production",
      dataCollection: sentryDataCollection,
    });
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(options).not.toHaveProperty("replaysOnErrorSampleRate");
  });

  it("records client exceptions only after the browser SDK installs a capture", () => {
    expect(() => captureClientException(new Error("before init"))).not.toThrow();
    const seen: unknown[] = [];
    setClientExceptionCapture((error) => {
      seen.push(error);
    });
    try {
      const error = new Error("after init");
      captureClientException(error);
      expect(seen).toEqual([error]);
    } finally {
      setClientExceptionCapture(() => {});
    }
  });

  it("omits a blank environment", () => {
    const options = browserSentryOptions({ dsn: "https://example@o1.ingest.sentry.io/1", environment: "  " });
    expect(options?.environment).toBeUndefined();
    expect(options?.tracesSampleRate).toBeLessThan(1);
  });
});
