import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { MasjidProPanel } from "@/components/mw/masjid-pro-panel";
import { appEnv } from "@/lib/db/client";
import { resolvePlaceSlug } from "@/lib/db/queries";
import { isNonProductionHost, linkBase } from "@/lib/environment";
import { MASJID_PRO_PRICES, embedSnippet, readPro, type ProView } from "@/lib/masjid-pro";
import { readPolarConfig, type PolarInterval } from "@/lib/polar";
import { requireUser } from "@/lib/session";
import { stewardStatus } from "@/lib/stewards";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: "Masjid Pro", robots: { index: false, follow: false }, alternates: { canonical: `/m/${slug}/pro` } };
}

export default async function MasjidProPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/m/${slug}/pro`);
  const resolved = await resolvePlaceSlug(slug);
  if (!resolved) notFound();
  if ("redirect" in resolved) permanentRedirect(`/m/${resolved.redirect}/pro`);
  const place = resolved.place;
  if (place.status !== "active" && place.status !== "closed") notFound();
  const headerList = await headers();
  const host = headerList.get("host") ?? "mosques.world";
  const hostname = host.split(":")[0] ?? host;
  const origin = linkBase(`${isNonProductionHost(hostname) ? "http" : "https"}://${host}/`, appEnv().PUBLIC_BASE_URL);
  const now = Date.now();
  const [status, pro, query] = await Promise.all([stewardStatus(appEnv().DB, place.id, user.id), readPro(appEnv().DB, place.id, now), searchParams]);
  const polar = readPolarConfig(appEnv());
  const intervals = (["month", "year"] as PolarInterval[]).filter((interval) => polar?.products[interval]);
  const entitled = Boolean(pro?.entitled);

  return (
    <article className="mx-auto max-w-[720px] px-4 py-10 lg:px-6">
      <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">Masjid Pro</p>
      <h1 className="mt-2 text-[2rem] leading-tight font-extrabold tracking-[-0.03em]">{place.name}</h1>
      <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">
        The lobby screen and the website widget for this mosque. {MASJID_PRO_PRICES.month.label}, or {MASJID_PRO_PRICES.year.label}. The directory itself stays free.
      </p>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold">
        <Link href={`/m/${place.slug}/display`} className="underline">
          Open the lobby screen
        </Link>
        <Link href={`/m/${place.slug}`} className="underline">
          Mosque page
        </Link>
        <Link href="/for-mosques" className="text-muted-foreground underline">
          What this is
        </Link>
      </p>

      {status !== "approved" ? (
        <div className="mt-8 rounded-2xl border border-border p-5">
          <h2 className="text-lg font-extrabold tracking-tight">A steward subscribes</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {status === "requested"
              ? "Your request to look after this mosque is waiting for a moderator. Masjid Pro opens once that is approved."
              : "Ask to look after this mosque first. A moderator checks that you are involved, and then you can subscribe and publish the screen."}
          </p>
          {status === "requested" ? null : (
            <Link href={`/m/${place.slug}/steward`} className="mt-4 inline-flex h-11 items-center rounded-full bg-secondary px-5 text-sm font-bold text-secondary-foreground">
              Ask to look after this mosque
            </Link>
          )}
        </div>
      ) : (
        <MasjidProPanel
          placeId={place.id}
          intervals={intervals}
          prices={{ month: MASJID_PRO_PRICES.month.label, year: MASJID_PRO_PRICES.year.label }}
          checkoutServer={polar?.server ?? null}
          entitled={entitled}
          notice={pro?.notice ?? null}
          donationUrl={pro?.donationUrl ?? null}
          donationLabel={pro?.donationLabel ?? null}
          embed={entitled ? embedSnippet(origin, place.slug) : null}
          checkoutReturn={query.checkout === "return"}
        />
      )}
      <SubscriptionLine pro={pro} />
    </article>
  );
}

function SubscriptionLine({ pro }: { pro: ProView | null }) {
  if (!pro) return null;
  const when = pro.periodEnd ? new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(pro.periodEnd) : null;
  const sentence =
    pro.status === "active"
      ? when
        ? `Subscribed${pro.interval === "year" ? " for the year" : ""}. The current period runs to ${when}.`
        : "Subscribed. Polar has not sent a period end yet."
      : pro.status === "canceled" && pro.entitled
        ? `Canceled. The screen stays up until ${when ?? "the end of the period you paid for"}.`
        : pro.status === "past_due"
          ? "The last payment did not go through. The screen is off until Polar marks the subscription active again."
          : pro.status === "revoked"
            ? "This subscription has ended."
            : null;
  if (!sentence) return null;
  return <p className="mt-10 text-sm text-muted-foreground">{sentence}</p>;
}
