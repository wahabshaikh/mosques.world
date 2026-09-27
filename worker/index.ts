import * as Sentry from "@sentry/cloudflare";
import handler from "vinext/server/fetch-handler";
import { asMail, MAIL_FROM } from "@/lib/email/send";
import { isRecomputeMessage, nightly, recomputeFacts } from "@/lib/jobs";
import { sentryOptions } from "@/lib/sentry";

type Env = {
  DB: D1Database;
  CACHE?: KVNamespace;
  EMAIL?: SendEmail;
  Q_RECOMPUTE?: Queue;
  PUBLIC_BASE_URL?: string;
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
};

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
    ctx.waitUntil(nightly(env));
  },
  async queue(batch: MessageBatch, env: Env) {
    for (const message of batch.messages) {
      try {
        const mail = asMail(message.body);
        if (isRecomputeMessage(message.body)) {
          await recomputeFacts(env.DB, message.body.ids);
        } else if (mail && env.EMAIL) {
          await env.EMAIL.send({ from: MAIL_FROM, ...mail });
        } else if (env.CACHE) {
          await env.CACHE.put(`queue:${batch.queue}:${message.id}`, JSON.stringify(message.body).slice(0, 20_000), {
            expirationTtl: 60 * 60 * 24 * 7,
          });
        }
        message.ack();
      } catch (error) {
        Sentry.captureException(error);
        message.retry({ delaySeconds: 60 });
      }
    }
  },
});
