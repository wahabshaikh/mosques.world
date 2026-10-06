import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { TrackView } from "@/components/mw/track-view";
import { appEnv } from "@/lib/db/client";
import { findProfile, mapHeadline, pinTotals, profilePins } from "@/lib/profile/read";
import { currentUser } from "@/lib/session";
import { GlobeLoader } from "./globe-loader";

export const dynamic = "force-dynamic";

type Params = { username: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)}'s map`, robots: { index: false } };
}

/** `/@username/map`: full-screen globe; `?embed=1` drops the chrome for iframes (spec P4). */
export default async function ProfileMapPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { username } = await params;
  const embed = (await searchParams).embed === "1";
  const found = await findProfile(appEnv().DB, decodeURIComponent(username));
  if (!found) notFound();
  if ("redirect" in found) permanentRedirect(`/@${found.redirect}/map${embed ? "?embed=1" : ""}`);
  const user = found.user;
  const viewer = await currentUser();
  const own = viewer?.id === user.id;
  // Only fully public check-ins are drawn; anything else links back to the profile.
  const visible = own || (user.profilePublic && user.checkinsVisibility === "public");
  const pins = visible ? await profilePins(appEnv().DB, user.id, "all", "") : [];
  const totals = pinTotals(pins);
  return (
    <div className="fixed inset-0 bg-[#0E2A22] text-white">
      <TrackView goal={embed ? "map_embed_view" : "profile_view"} props={embed ? undefined : { own: own ? "true" : "false" }} />
      <GlobeLoader pins={pins} embed={embed} />
      <div className="pointer-events-none absolute top-4 left-4 flex flex-col gap-1 sm:top-6 sm:left-6">
        <Link
          href={`/@${user.username}`}
          target={embed ? "_blank" : undefined}
          className="pointer-events-auto w-fit text-xs font-bold tracking-[1px] text-[#E9B949] uppercase"
        >
          mosques.world/@{user.username}
        </Link>
        <h1 className="text-2xl font-extrabold tracking-[-0.5px] sm:text-[34px] sm:leading-10">
          {visible ? mapHeadline(totals.places, totals.countries) : "This map is private."}
        </h1>
        {!embed ? (
          <Link href={`/@${user.username}`} className="pointer-events-auto mt-2 w-fit rounded-full bg-white px-4 py-2 text-sm font-bold text-[#1F1D1A]">
            Back to profile
          </Link>
        ) : null}
      </div>
    </div>
  );
}
