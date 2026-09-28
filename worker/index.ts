import * as Sentry from "@sentry/cloudflare";
import handler from "vinext/server/fetch-handler";
import { asMail, MAIL_FROM } from "@/lib/email/send";
import { isPhotoMessage, isRecomputeMessage, nightly, recomputeFacts } from "@/lib/jobs";
import { processPhoto } from "@/lib/media";
import { weeklyOsmSync } from "@/lib/osm";
import { placeSlugRedirect } from "@/lib/places/slug-redirect";
import { sentryOptions } from "@/lib/sentry";

type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  IMAGES?: ImagesBinding;
  AI?: Ai;
  CACHE?: KVNamespace;
  EMAIL?: SendEmail;
  Q_RECOMPUTE?: Queue;
  GOOGLE_MAPS_API_KEY?: string;
  PUBLIC_BASE_URL?: string;
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
};

/** Weekly OSM diff sync (new places only); must match wrangler.jsonc triggers. */
const WEEKLY_CRON = "30 3 * * 1";

const CITY_RECOUNT = `UPDATE city SET place_count = (
  SELECT COUNT(*) FROM place
  WHERE place.country_code = city.country_code
    AND place.city_slug = city.city_slug
    AND place.status = 'active'
)`;

/** Renders the app; a `/m/<old-slug>` 404 becomes a 301 when the slug is in place_slug_history. */
async function serve(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const response = await handler.fetch(request, env, ctx);
  if (response.status !== 404 || (request.method !== "GET" && request.method !== "HEAD")) return response;
  try {
    return (await placeSlugRedirect(env.DB, request.url)) ?? response;
  } catch (error) {
    Sentry.captureException(error);
    return response;
  }
}

export default Sentry.withSentry((env) => sentryOptions(env), {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.hostname === "www.mosques.world") {
      url.hostname = "mosques.world";
      return Promise.resolve(Response.redirect(url, 308));
    }
    return serve(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (controller.cron === WEEKLY_CRON) {
      ctx.waitUntil(weeklyOsmSync(env.DB, fetch, Date.now()));
      return;
    }
    ctx.waitUntil(env.DB.prepare(CITY_RECOUNT).run());
    ctx.waitUntil(nightly(env));
  },
  async queue(batch: MessageBatch, env: Env) {
    for (const message of batch.messages) {
      try {
        const mail = asMail(message.body);
        if (isRecomputeMessage(message.body)) {
          await recomputeFacts(env.DB, message.body.ids);
        } else if (isPhotoMessage(message.body)) {
          await processPhoto(env, message.body.id);
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
