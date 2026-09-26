import handler from "vinext/server/fetch-handler";

type Env = {
  DB: D1Database;
  PUBLIC_BASE_URL?: string;
};

const CITY_RECOUNT = `UPDATE city SET place_count = (
  SELECT COUNT(*) FROM place
  WHERE place.country_code = city.country_code
    AND place.city_slug = city.city_slug
    AND place.status = 'active'
)`;

export default {
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
};
