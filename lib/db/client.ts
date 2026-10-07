import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type AppEnv = {
  DB: D1Database;
  MEDIA: R2Bucket;
  CACHE: KVNamespace;
  ASSETS: Fetcher;
  PUBLIC_BASE_URL: string;
  EMAIL_SINK?: string;
  ENVIRONMENT?: string;
  GOOGLE_MAPS_API_KEY?: string;
  GOOGLE_PLACES_DAILY_CAP?: string;
  /** Web Push application server key (public half); push itself is sent in Phase 6. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  IMAGES?: ImagesBinding;
  AI?: Ai;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  DATAFAST_WEBSITE_ID?: string;
  DATAFAST_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  SENTRY_DSN?: string;
  EMAIL?: SendEmail;
  Q_EMAIL?: Queue;
  Q_RECOMPUTE?: Queue;
  Q_MEDIA?: Queue;
  RL_WRITE?: RateLimit;
  RL_AUTH?: RateLimit;
  /** Public read API: requests per minute per key (spec P8). */
  RL_API?: RateLimit;
};

export function appEnv(): AppEnv {
  return env as unknown as AppEnv;
}

export function db() {
  return drizzle(appEnv().DB, { schema });
}
