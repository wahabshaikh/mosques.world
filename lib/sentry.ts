export const SENTRY_TRACES_SAMPLE_RATE = 0.1;

type HttpBody = "incomingRequest" | "outgoingRequest" | "incomingResponse" | "outgoingResponse";

/**
 * Shared by the Worker and the browser. @sentry/* 11 collects headers, query
 * strings and AI prompts unless each category is turned off (`sendDefaultPii`
 * was removed). Leave user info, cookies and bodies off.
 */
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as HttpBody[],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  genAI: { inputs: false, outputs: false },
};

export type SentryRuntimeEnv = {
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
};

export type WorkerSentryOptions = {
  dsn?: string;
  enabled: boolean;
  tracesSampleRate: number;
  environment?: string;
  dataCollection?: typeof sentryDataCollection;
};

export function sentryOptions(env: SentryRuntimeEnv): WorkerSentryOptions {
  const dsn = env.SENTRY_DSN?.trim() || undefined;
  if (!dsn) return { enabled: false, tracesSampleRate: 0 };
  return {
    dsn,
    enabled: true,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    environment: env.ENVIRONMENT,
    dataCollection: sentryDataCollection,
  };
}

export type BrowserSentryOptions = {
  dsn: string;
  enabled: true;
  tracesSampleRate: number;
  environment?: string;
  dataCollection: typeof sentryDataCollection;
};

type ClientExceptionCapture = (error: unknown) => void;

let captureClientError: ClientExceptionCapture = () => {};

/** Reports a browser error when the client SDK was initialised. No-op otherwise. */
export function captureClientException(error: unknown): void {
  captureClientError(error);
}

/** Installed by instrumentation-client after Sentry.init. */
export function setClientExceptionCapture(capture: ClientExceptionCapture): void {
  captureClientError = capture;
}

/** Browser init options, or null when the public DSN is missing so Sentry stays uninitialized. */
export function browserSentryOptions(input: { dsn?: string; environment?: string }): BrowserSentryOptions | null {
  const dsn = input.dsn?.trim();
  if (!dsn) return null;
  const environment = input.environment?.trim();
  return {
    dsn,
    enabled: true,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    ...(environment ? { environment } : {}),
    dataCollection: sentryDataCollection,
  };
}
