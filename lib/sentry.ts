export const SENTRY_TRACES_SAMPLE_RATE = 0.1;

type HttpBody = "incomingRequest" | "outgoingRequest" | "incomingResponse" | "outgoingResponse";

export type SentryRuntimeEnv = {
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
};

export type WorkerSentryOptions = {
  dsn?: string;
  enabled: boolean;
  tracesSampleRate: number;
  environment?: string;
  dataCollection?: {
    userInfo: false;
    cookies: false;
    httpBodies: HttpBody[];
    databaseQueryData: false;
    queues: false;
    stackFrameVariables: false;
  };
};

export function sentryOptions(env: SentryRuntimeEnv): WorkerSentryOptions {
  const dsn = env.SENTRY_DSN?.trim() || undefined;
  if (!dsn) return { enabled: false, tracesSampleRate: 0 };
  return {
    dsn,
    enabled: true,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    environment: env.ENVIRONMENT,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
  };
}
