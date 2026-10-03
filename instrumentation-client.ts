import { browserSentryOptions, setClientExceptionCapture } from "@/lib/sentry";

// ENVIRONMENT is a Worker runtime var, so it is not inlined into the client.
// The root layout copies it onto <html data-mw-environment> before this module
// runs: vinext loads instrumentation-client ahead of hydration.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = typeof document === "undefined" ? undefined : document.documentElement.dataset.mwEnvironment;

// `dsn` is a build-time string literal. Guarding on it lets the bundler drop the SDK when it is empty.
if (dsn) {
  const options = browserSentryOptions({ dsn, environment });
  if (options) {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      ...options,
      integrations: [Sentry.browserTracingIntegration()],
    });
    setClientExceptionCapture((error) => {
      Sentry.captureException(error);
    });
  }
}
