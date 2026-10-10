import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaceRowContent } from "@/components/mw/place-row";
import { cityBySlug, placesInCity } from "@/lib/db/queries";
import { REWARD } from "@/lib/hasanat";
import { areaTimes } from "@/lib/places/area-times";
import { toCard } from "@/lib/places/present";
import { reminderFor } from "@/lib/reminders";
import { cn, countryName } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { country: string; city: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { country, city: citySlug } = await params;
  const city = await cityBySlug(country, citySlug);
  if (!city) return { title: "City" };
  return {
    title: `Mosques in ${city.name}: prayer and iqamah times`,
    description: `${city.placeCount} mosques and prayer spaces in ${city.name}, ${countryName(country)}, with today's jamā'ah (iqamah) times kept up to date by the community.`,
    alternates: { canonical: `/cities/${country.toLowerCase()}/${city.citySlug}` },
  };
}

export default async function CityPage({ params }: { params: Promise<Params> }) {
  const { country, city: citySlug } = await params;
  const city = await cityBySlug(country, citySlug);
  if (!city) notFound();
  const places = await placesInCity(country, citySlug);
  const now = new Date();
  const cards = places.map((place) => toCard(place, now, { photos: true }));
  const withTimes = cards.filter((card) => card.timeSource !== "calculated");
  const without = cards.filter((card) => card.timeSource === "calculated");
  const anchor = places[0];
  const times = anchor ? areaTimes(anchor.lat, anchor.lng, now, { method: anchor.calcMethod, madhab: anchor.asrMadhab }) : null;
  const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
  const countryLabel = countryName(country);
  const faq = [
    {
      q: `How many mosques are in ${city.name}?`,
      a: `mosques.world lists ${places.length} ${places.length === 1 ? "mosque or prayer space" : "mosques and prayer spaces"} in ${city.name}, ${countryLabel}.`,
    },
    {
      q: `Which mosques in ${city.name} have iqamah times?`,
      a:
        withTimes.length > 0
          ? `${withTimes.length} have jamā'ah times added by the community or published by the mosque: ${withTimes
              .slice(0, 5)
              .map((card) => card.name)
              .join(", ")}${withTimes.length > 5 ? " and more" : ""}.`
          : `None yet. If you pray at a mosque in ${city.name}, you can add its iqamah times in a minute for the next person.`,
    },
    ...(times
      ? [
          {
            q: `What are the prayer times in ${city.name} today?`,
            a: `Calculated start times today (${times.method}): ${times.rows.map((row) => `${row.label} ${row.time}`).join(", ")}. Each mosque sets its own iqamah.`,
          },
        ]
      : []),
  ];
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Mosques in ${city.name}`,
      numberOfItems: places.length,
      itemListElement: places.slice(0, 50).map((place, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${base}/m/${place.slug}`,
        name: place.name,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: countryLabel, item: `${base}/countries/${country.toLowerCase()}` },
        { "@type": "ListItem", position: 2, name: city.name, item: `${base}/cities/${country.toLowerCase()}/${city.citySlug}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
    },
  ];
  const reminder = reminderFor("add", city.citySlug);
  const row = (card: (typeof cards)[number]) => (
    <li key={card.id}>
      <Link href={`/m/${card.slug}`} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-muted sm:gap-4" data-place-card={card.id}>
        <PlaceRowContent place={card} showDistance={false} />
      </Link>
    </li>
  );
  return (
    <div className="mx-auto max-w-[800px] px-4 pt-4 pb-12 lg:px-6 lg:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href={`/countries/${country.toLowerCase()}`} className="hover:text-foreground">
          {countryLabel}
        </Link>
      </nav>
      <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight lg:text-[32px]">Mosques in {city.name}</h1>
      <p className="mt-2 text-muted-foreground">
        {places.length} {places.length === 1 ? "place" : "places"} · {withTimes.length} with jamā&apos;ah times
      </p>

      {times ? (
        <section className="mt-6 rounded-3xl bg-muted p-4" aria-labelledby="city-times">
          <h2 id="city-times" className="text-[15px] font-bold">
            Prayer times in {city.name} today
          </h2>
          <ol className="mt-3 grid grid-cols-5 gap-1.5 text-center">
            {times.rows.map((item) => (
              <li key={item.key} className={cn("rounded-2xl px-0.5 py-2", item.next ? "bg-primary text-primary-foreground" : "bg-card")}>
                <span className={cn("block text-[11px] font-semibold", item.next ? "text-primary-foreground/85" : "text-muted-foreground")}>{item.label}</span>
                <span className="tabular block text-[13px] font-extrabold whitespace-nowrap sm:text-sm">{item.time}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">Calculated start times ({times.method}). Each masjid&apos;s jamā&apos;ah times are on its page.</p>
        </section>
      ) : null}

      {withTimes.length > 0 ? (
        <section className="mt-8" aria-labelledby="with-times">
          <h2 id="with-times" className="text-xl font-bold">
            With jamā&apos;ah times
          </h2>
          <ul className="-mx-2 mt-2 flex flex-col">{withTimes.map(row)}</ul>
        </section>
      ) : null}

      {without.length > 0 ? (
        <section className="mt-8" aria-labelledby="need-times">
          <h2 id="need-times" className="text-xl font-bold">
            Waiting for their times
          </h2>
          <div className="mt-3 flex items-start gap-3 rounded-3xl border border-border p-4">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm">
              <span className="font-semibold">Pray at one of these?</span> Add its iqamah times (+{REWARD.addTimes} hasanat) so the next person can join the jamā&apos;ah.
              <span className="mt-1 block text-xs text-muted-foreground italic">
                “{reminder.text}” <span className="not-italic">— {reminder.source}</span>
              </span>
            </p>
          </div>
          <ul className="-mx-2 mt-2 flex flex-col">{without.map(row)}</ul>
        </section>
      ) : null}

      <section className="mt-10 border-t border-border pt-8" aria-labelledby="city-faq">
        <h2 id="city-faq" className="text-xl font-bold">
          Questions people ask
        </h2>
        <dl className="mt-4 divide-y divide-border">
          {faq.map((item) => (
            <div key={item.q} className="py-3">
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-1 text-[15px] text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
