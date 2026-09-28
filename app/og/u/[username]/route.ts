import { appEnv } from "@/lib/db/client";
import { renderProfileCard } from "@/lib/og/profile-card";
import { findProfile, profilePins, userStat } from "@/lib/profile/read";

export const dynamic = "force-dynamic";

/** 1200×630 share card for a profile (spec P4). Pins are drawn only when check-ins are public. */
export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  const database = appEnv().DB;
  const found = await findProfile(database, decodeURIComponent(username));
  if (!found) return new Response("Not found", { status: 404 });
  if ("redirect" in found) return Response.redirect(new URL(`/og/u/${found.redirect}`, _request.url), 308);
  const user = found.user;
  const open = user.profilePublic && user.checkinsVisibility !== "private";
  const [stat, pins] = await Promise.all([
    userStat(database, user.id),
    user.profilePublic && user.checkinsVisibility === "public" ? profilePins(database, user.id, "all", "") : Promise.resolve([]),
  ]);
  const png = renderProfileCard({
    name: user.name,
    username: user.username,
    places: open ? stat.places : null,
    countries: open ? stat.countries : null,
    pins,
  });
  return new Response(Buffer.from(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}
