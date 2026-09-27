import * as Sentry from "@sentry/cloudflare";
import handler from "vinext/server/fetch-handler";
import { sentryOptions } from "@/lib/sentry";

type Env = {
  DB: D1Database;
  CACHE?: KVNamespace;
  EMAIL?: SendEmail;
  PUBLIC_BASE_URL?: string;
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
};

const MAIL_FROM = "no-reply@mail.mosques.world";

function asMail(body: unknown): { to: string; subject: string; text: string } | null {
  if (!body || typeof body !== "object") return null;
  const mail = body as { to?: unknown; subject?: unknown; text?: unknown };
  if (typeof mail.to !== "string" || typeof mail.subject !== "string" || typeof mail.text !== "string") return null;
  return { to: mail.to, subject: mail.subject, text: mail.text };
}

const CITY_RECOUNT = `UPDATE city SET place_count = (
  SELECT COUNT(*) FROM place
  WHERE place.country_code = city.country_code
    AND place.city_slug = city.city_slug
    AND place.status = 'active'
)`;

export default Sentry.withSentry((env) => sentryOptions(env), {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.hostname === "www.mosques.world") {
      url.hostname = "mosques.world";
      return Promise.resolve(Response.redirect(url, 308));
    }
    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(env.DB.prepare(CITY_RECOUNT).run());
  },
  async queue(batch: MessageBatch, env: Env) {
    for (const message of batch.messages) {
      const mail = asMail(message.body);
      if (mail && env.EMAIL) {
        await env.EMAIL.send({ from: MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
      } else if (env.CACHE) {
        await env.CACHE.put(`queue:${batch.queue}:${message.id}`, JSON.stringify(message.body).slice(0, 20_000), {
          expirationTtl: 60 * 60 * 24 * 7,
        });
      }
      message.ack();
    }
  },
});
