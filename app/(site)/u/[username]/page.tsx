import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { MapFilterPills, MapStatTiles, ProfileHeroMap } from "@/components/mw/profile-hero-map";
import { BadgeTile, ContributionList, ProfileAvatar, ProfileCard, RecentVisits, TrustBadge } from "@/components/mw/profile-sections";
import { CopyLinkField, ShareMapButton } from "@/components/mw/profile-share";
import { TrackView } from "@/components/mw/track-view";
import { appEnv } from "@/lib/db/client";
import { isNonProductionHost } from "@/lib/environment";
import { readNow } from "@/lib/places/present";
import { phase4Enabled } from "@/lib/phase";
import { civilDate } from "@/lib/prayer/times";
import {
  asContributionFilter,
  asMapFilter,
  contributionCounts,
  contributions,
  findProfile,
  mapHeadline,
  mostPrayedIn,
  pinTotals,
  profileBadges,
  profilePins,
  recentVisits,
  tenure,
  userStat,
  visitedCountries,
  type ProfileUser,
} from "@/lib/profile/read";
import { currentUser } from "@/lib/session";
import { countryName } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { username: string };
type Search = Record<string, string | string[] | undefined>;

async function load(username: string): Promise<ProfileUser> {
  if (!(await phase4Enabled())) notFound();
  const found = await findProfile(appEnv().DB, decodeURIComponent(username));
  if (!found) notFound();
  if ("redirect" in found) permanentRedirect(`/@${found.redirect}`);
  return found.user;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { username } = await params;
  const found = (await phase4Enabled()) ? await findProfile(appEnv().DB, decodeURIComponent(username)) : null;
  if (!found || "redirect" in found) return { title: "Profile" };
  const user = found.user;
  const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
  return {
    title: `${user.name} (@${user.username})`,
    description: `Mosques ${user.name} has prayed in, and their contributions to mosques.world.`,
    alternates: { canonical: `/@${user.username}` },
    openGraph: { images: [`${base}/og/u/${user.username}`] },
    twitter: { card: "summary_large_image" },
    robots: user.profilePublic ? undefined : { index: false },
  };
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { username } = await params;
  const search = await searchParams;
  const user = await load(username);
  const viewer = await currentUser();
  const own = viewer?.id === user.id;
  const database = appEnv().DB;
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const now = readNow(headerList.get("x-mw-now"), isNonProductionHost(host));
  const nowMs = now.getTime();
  const civil = civilDate(now, "UTC");
  const today = `${civil.year}-${String(civil.month).padStart(2, "0")}-${String(civil.day).padStart(2, "0")}`;
  const year = String(civil.year);
  const basePath = `/@${user.username}`;
  const filter = asContributionFilter(one(search.c));
  const shown = Math.min(Math.max(Number(one(search.n)) || 20, 20), 200);
  const firstName = user.name.split(/\s+/)[0] || user.name;

  const [counts, rows, stat] = await Promise.all([
    contributionCounts(database, user.id),
    contributions(database, user.id, filter, shown + 1),
    userStat(database, user.id),
  ]);
  const more = rows.length > shown ? `${basePath}?${filter === "all" ? "" : `c=${filter}&`}n=${shown + 20}#contributions` : null;
  const contributionSection = (
    <section id="contributions" className="flex scroll-mt-24 flex-col gap-4">
      <h2 className="text-[22px] font-bold">Contributions</h2>
      <ContributionList rows={rows.slice(0, shown)} counts={counts} active={filter} basePath={basePath} now={nowMs} more={more} />
    </section>
  );

  // Private profiles: name and contributions only (spec P4 privacy).
  if (!user.profilePublic && !own) {
    return (
      <div className="mx-auto flex max-w-[800px] flex-col gap-10 px-4 py-10 lg:px-6">
        <TrackView goal="profile_view" props={{ own: "false" }} />
        <div className="flex items-center gap-4">
          <ProfileAvatar id={user.id} name={user.name} avatarKey={null} verified={false} size="md" />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-extrabold">{user.name}</h1>
            <p className="text-sm text-muted-foreground">@{user.username} · This profile is private.</p>
          </div>
        </div>
        {contributionSection}
      </div>
    );
  }

  const visibility = own ? "public" : user.checkinsVisibility;
  const mapFilter = asMapFilter(one(search.map));
  const [pins, recent, badges, countries, city] = await Promise.all([
    visibility === "public" ? profilePins(database, user.id, mapFilter, year) : Promise.resolve([]),
    visibility === "public" ? recentVisits(database, user.id) : Promise.resolve([]),
    profileBadges(database, user.id, stat, own),
    visibility === "countries" ? visitedCountries(database, user.id) : Promise.resolve([]),
    visibility === "public" ? mostPrayedIn(database, user.id) : Promise.resolve(null),
  ]);
  const totals = mapFilter === "all" || visibility !== "public" ? { places: stat.places, countries: stat.countries } : pinTotals(pins);
  const filterHref = (value: string) => (value === "all" ? basePath : `${basePath}?map=${value}`);
  const years = tenure(user.createdAt, nowMs);
  const showMap = visibility !== "private";
  const AboutHeading = showMap ? "h2" : "h1";

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-12 pb-20 sm:px-4 sm:pt-8 lg:px-6">
      <TrackView goal="profile_view" props={{ own: own ? "true" : "false" }} />
      {showMap ? (
        <ProfileHeroMap
          pins={pins}
          showPins={visibility === "public"}
          overline={`mosques.world/@${user.username}`}
          title={`${mapHeadline(totals.places, totals.countries)} One ummah.`}
          filters={
            visibility === "public" ? (
              <MapFilterPills
                items={[
                  { label: "All time", href: filterHref("all"), active: mapFilter === "all" },
                  { label: year, href: filterHref("year"), active: mapFilter === "year" },
                  { label: "Jumu'ah only", href: filterHref("jumuah"), active: mapFilter === "jumuah" },
                ]}
              />
            ) : null
          }
          empty={
            stat.places === 0 ? (
              <p className="max-w-sm text-sm text-[#D5E3DC]">
                {own ? "Your map starts with your first check-in. Tap “I prayed here” on any mosque page." : `${firstName} hasn't added any mosques yet.`}
              </p>
            ) : visibility === "countries" && countries.length > 0 ? (
              <ul aria-label="Countries prayed in" className="flex max-w-2xl flex-wrap gap-2">
                {countries.map((code) => (
                  <li key={code} className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white">
                    {countryName(code)}
                  </li>
                ))}
              </ul>
            ) : null
          }
          tiles={
            <MapStatTiles
              tiles={[
                { value: totals.places, label: totals.places === 1 ? "mosque" : "mosques" },
                { value: totals.countries, label: totals.countries === 1 ? "country" : "countries" },
                { value: stat.continents, label: stat.continents === 1 ? "continent" : "continents" },
                { value: stat.jumuahCountries, label: "countries for Jumu'ah" },
              ]}
            />
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {visibility === "public" && stat.places > 0 ? (
                <Link href={`${basePath}/map`} className="inline-flex h-11 items-center rounded-[12px] bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20">
                  Open globe
                </Link>
              ) : null}
              <ShareMapButton username={user.username} />
            </div>
          }
        />
      ) : null}

      <div className="flex flex-col gap-12 px-4 sm:px-0 lg:flex-row lg:items-start lg:gap-20">
        <aside className="flex w-full shrink-0 flex-col gap-6 lg:w-[340px]">
          <ProfileCard
            id={user.id}
            name={user.name}
            avatarKey={user.avatarKey}
            verified={user.emailVerified}
            trustLevel={user.trustLevel}
            own={own}
            stats={[
              // Every time added or confirmed counts: "0 verifications" right after adding five times read as nothing done.
              { value: counts.all, label: counts.all === 1 ? "Contribution" : "Contributions" },
              { value: stat.placesAdded, label: "Places added" },
              { value: years.value, label: years.label },
            ]}
          />
          <div className="flex flex-col gap-3.5 rounded-[20px] border border-input p-6">
            <h2 className="text-lg font-bold">{firstName}&apos;s confirmed information</h2>
            <ul className="flex flex-col gap-3 text-[15px]">
              {user.emailVerified ? <li>✓ Email address</li> : null}
              <li>{user.trustLevel >= 1 ? "✓ Contributions accepted by the community" : "New to mosques.world"}</li>
            </ul>
          </div>
          <CopyLinkField username={user.username} />
          {own ? (
            <Link href="/settings/privacy" className="text-sm font-semibold underline">
              Privacy and check-ins
            </Link>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-10">
          <section className="flex flex-col gap-3.5 border-b border-border pb-9">
            <AboutHeading className="text-[32px] font-extrabold tracking-[-0.5px]">About {firstName}</AboutHeading>
            <p className="text-sm text-muted-foreground">
              @{user.username}
              {!showMap ? (
                <>
                  {" · "}
                  <TrustBadge level={user.trustLevel} />
                </>
              ) : null}
            </p>
            <ul className="flex flex-wrap gap-x-6 gap-y-2.5 text-[15px]">
              {city ? <li>Most prayed in: {city}</li> : user.homeCityLabel ? <li>Based in {user.homeCityLabel}</li> : null}
              {visibility !== "private" && stat.fajrPlaces > 0 ? (
                <li>
                  Fajr in {stat.fajrPlaces} {stat.fajrPlaces === 1 ? "mosque" : "mosques"}
                </li>
              ) : null}
              {visibility !== "private" && stat.jumuahCountries > 0 ? (
                <li>
                  Jumu&apos;ah in {stat.jumuahCountries} {stat.jumuahCountries === 1 ? "country" : "countries"}
                </li>
              ) : null}
            </ul>
            {user.bio ? <p className="max-w-[640px] text-base leading-relaxed whitespace-pre-line">{user.bio}</p> : null}
          </section>

          {visibility === "public" && recent.length > 0 ? (
            <section className="flex flex-col gap-5 border-b border-border pb-9">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[22px] font-bold">Recently prayed in</h2>
                {stat.places > recent.length ? (
                  <Link href={`${basePath}/map`} className="text-sm font-bold underline">
                    Show all {stat.places}
                  </Link>
                ) : null}
              </div>
              <RecentVisits visits={recent} today={today} />
            </section>
          ) : null}

          {badges.length > 0 ? (
            <section className="flex flex-col gap-5 border-b border-border pb-9">
              <h2 className="text-[22px] font-bold">Badges</h2>
              <ul className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
                {badges.map((badge) => (
                  <BadgeTile key={badge.key} badge={badge} />
                ))}
              </ul>
            </section>
          ) : null}

          {contributionSection}
        </div>
      </div>
    </div>
  );
}
