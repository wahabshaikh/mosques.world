import type { AppEnv } from "@/lib/db/client";
import { usesEmailSink } from "@/lib/email/send";
import type { PlacesContext } from "./google";

export function placesContext(env: AppEnv, host: string): PlacesContext {
  return { apiKey: env.GOOGLE_MAPS_API_KEY, cache: env.CACHE, mocks: usesEmailSink(env, host) };
}

export function placesDailyCap(env: AppEnv): number {
  const cap = Number(env.GOOGLE_PLACES_DAILY_CAP ?? "2000");
  return Number.isFinite(cap) && cap > 0 ? cap : 2000;
}
