import type { AppEnv } from "@/lib/db/client";
import type { Mail } from "./templates";

/** Sends and receives: Email Routing forwards salam@mosques.world to the maintainer. */
export const MAIL_FROM = "salam@mosques.world";

export function usesEmailSink(env: Pick<AppEnv, "EMAIL_SINK">, host: string): boolean {
  return env.EMAIL_SINK === "1" || host === "localhost" || host === "127.0.0.1";
}

/**
 * Sends through `q-email` (retries + DLQ). Preview and localhost copy the message into KV
 * for the E2E sink at /api/v1/test/emails instead.
 */
export async function deliver(env: AppEnv, host: string, mail: Mail): Promise<void> {
  if (usesEmailSink(env, host)) {
    const stored = JSON.stringify(mail);
    await Promise.all([
      env.CACHE.put("email:latest", stored, { expirationTtl: 60 * 60 * 24 }),
      env.CACHE.put(`email:to:${mail.to}`, stored, { expirationTtl: 60 * 60 * 24 }),
    ]);
    return;
  }
  if (env.Q_EMAIL) {
    await env.Q_EMAIL.send(mail);
  } else if (env.EMAIL) {
    await env.EMAIL.send({ from: MAIL_FROM, ...mail });
  }
}

export function asMail(body: unknown): Mail | null {
  if (!body || typeof body !== "object") return null;
  const mail = body as Partial<Mail>;
  if (typeof mail.to !== "string" || typeof mail.subject !== "string" || typeof mail.text !== "string") return null;
  return {
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: typeof mail.html === "string" ? mail.html : undefined,
    headers: mail.headers && typeof mail.headers === "object" ? mail.headers : undefined,
  };
}
