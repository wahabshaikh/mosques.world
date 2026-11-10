import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { StewardTimesForm, type StewardJumuah, type StewardPrayer } from "@/components/mw/steward-times-form";
import { appEnv } from "@/lib/db/client";
import { resolvePlaceSlug } from "@/lib/db/queries";
import { isNonProductionHost } from "@/lib/environment";
import { entitled, readPro } from "@/lib/masjid-pro";
import { madhabOf, readNow } from "@/lib/places/present";
import { getPrayerDay, parseAdhanAdjust } from "@/lib/prayer/times";
import { requireUser } from "@/lib/session";
import { stewardStatus } from "@/lib/stewards";
import { formatTime12, IQAMAH_PRAYERS, iqamahValue, jumuahValue, type IqamahPrayer } from "@/lib/trust/facts";
import { placeFacts } from "@/lib/trust/read";

export const dynamic = "force-dynamic";

const LABEL: Record<IqamahPrayer, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: "Iqamah times", robots: { index: false, follow: false }, alternates: { canonical: `/m/${slug}/pro/times` } };
}

export default async function StewardTimesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/m/${slug}/pro/times`);
  const resolved = await resolvePlaceSlug(slug);
  if (!resolved) notFound();
  if ("redirect" in resolved) permanentRedirect(`/m/${resolved.redirect}/pro/times`);
  const place = resolved.place;
  if (place.status !== "active" && place.status !== "closed") notFound();

  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const now = readNow(headerList.get("x-mw-now"), isNonProductionHost(host));
  const day = getPrayerDay({
    lat: place.lat,
    lng: place.lng,
    timeZone: place.timezone,
    method: place.calcMethod,
    madhab: madhabOf(place.asrMadhab),
    highLat: place.highLatRule,
    adjust: parseAdhanAdjust(place.adhanAdjustJson),
    now,
  });
  const [status, pro, facts] = await Promise.all([
    stewardStatus(appEnv().DB, place.id, user.id),
    readPro(appEnv().DB, place.id, now.getTime()),
    placeFacts(appEnv().DB, place.id, day.date),
  ]);
  const active = Boolean(pro && entitled(pro.status, pro.periodEnd, now.getTime()));

  const prayers: StewardPrayer[] = IQAMAH_PRAYERS.map((prayer) => {
    const adhan = day.rows.find((row) => row.key === prayer)?.adhan ?? "12:00";
    const fact = facts.find((item) => item.key === `iqamah.${prayer}` && item.shown);
    const parsed = fact?.shown ? iqamahValue.safeParse(fact.shown.value) : null;
    if (parsed?.success && "t" in parsed.data) {
      return { key: prayer, label: LABEL[prayer], adhanLabel: formatTime12(adhan), on: true, mode: "fixed" as const, time: parsed.data.t, minutes: prayer === "maghrib" ? 5 : 15 };
    }
    if (parsed?.success && "min" in parsed.data) {
      return { key: prayer, label: LABEL[prayer], adhanLabel: formatTime12(adhan), on: true, mode: "offset" as const, time: adhan, minutes: parsed.data.min };
    }
    return { key: prayer, label: LABEL[prayer], adhanLabel: formatTime12(adhan), on: false, mode: prayer === "maghrib" ? "offset" : "fixed", time: adhan, minutes: prayer === "maghrib" ? 10 : 15 };
  });

  const jumuah: StewardJumuah[] = [1, 2, 3, 4, 5, 6].map((slot) => {
    const fact = facts.find((item) => item.key === "jumuah.jamaah" && item.qualifier === String(slot) && item.shown);
    const parsed = fact?.shown ? jumuahValue.safeParse(fact.shown.value) : null;
    return { slot, time: parsed?.success ? parsed.data.t : "", khutbah: parsed?.success ? (parsed.data.khutbah ?? "") : "" };
  });

  return (
    <article className="mx-auto max-w-[760px] px-4 py-10 lg:px-6">
      <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">Masjid Pro</p>
      <h1 className="mt-2 text-[2rem] leading-tight font-extrabold tracking-[-0.03em]">Iqamah times</h1>
      <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">
        Set the congregation times for {place.name}. The lobby screen and the mosque page both read these.
      </p>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold">
        <Link href={`/m/${place.slug}/pro`} className="underline">
          Notice and subscription
        </Link>
        <Link href={`/m/${place.slug}/display`} className="underline">
          Dark lobby
        </Link>
        <Link href={`/m/${place.slug}/display?theme=light`} className="underline">
          Light lobby
        </Link>
      </p>

      {status !== "approved" ? (
        <div className="mt-8 rounded-2xl border border-border p-5">
          <h2 className="text-lg font-extrabold tracking-tight">A steward sets the times</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {status === "requested"
              ? "Your request to look after this mosque is waiting for a moderator."
              : "Ask to look after this mosque first. A moderator checks that you are involved, and then you can set the times."}
          </p>
          {status === "requested" ? null : (
            <Link href={`/m/${place.slug}/steward`} className="mt-4 inline-flex h-11 items-center rounded-full bg-secondary px-5 text-sm font-bold text-secondary-foreground">
              Ask to look after this mosque
            </Link>
          )}
        </div>
      ) : !active ? (
        <div className="mt-8 rounded-2xl border border-border p-5" data-testid="times-locked">
          <h2 className="text-lg font-extrabold tracking-tight">Masjid Pro is not active</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Iqamah for the lobby is part of Masjid Pro. Checkout is not open on this site yet, so a subscription cannot be started from here.
          </p>
          <Link href={`/m/${place.slug}/pro`} className="mt-4 inline-flex text-sm font-bold underline">
            Back to Masjid Pro
          </Link>
        </div>
      ) : (
        <StewardTimesForm placeId={place.id} prayers={prayers} jumuah={jumuah} lobbyHref={`/m/${place.slug}/display`} />
      )}
    </article>
  );
}
