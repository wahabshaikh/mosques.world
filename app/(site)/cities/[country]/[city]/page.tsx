import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaceRowContent } from "@/components/mw/place-row";
import { cityBySlug, placesInCity } from "@/lib/db/queries";
import { toCard } from "@/lib/places/present";
import { countryName } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { country: string; city: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { country, city: citySlug } = await params;
  const city = await cityBySlug(country, citySlug);
  if (!city) return { title: "City" };
  return {
    title: `Mosques in ${city.name}`,
    description: `${city.placeCount} mosques and prayer spaces in ${city.name}.`,
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
  const iqamahCount = cards.filter((card) => card.verifiers > 0).length;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Mosques in ${city.name}`,
    numberOfItems: places.length,
    itemListElement: places.slice(0, 50).map((place, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `https://mosques.world/m/${place.slug}`,
      name: place.name,
    })),
  };
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 lg:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="text-sm text-muted-foreground">
        <Link href={`/countries/${country.toLowerCase()}`}>{countryName(country)}</Link>
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Mosques in {city.name}</h1>
      <p className="mt-2 text-muted-foreground">
        {places.length} {places.length === 1 ? "place" : "places"}
        {iqamahCount > 0 ? `, ${iqamahCount} with iqamah times from the community` : ""}. Adhan times are calculated.
      </p>
      <ul className="mt-6 flex flex-col">
        {cards.map((card) => (
          <li key={card.id}>
            <Link href={`/m/${card.slug}`} className="flex items-center gap-4 rounded-2xl p-2.5 hover:bg-muted">
              <PlaceRowContent place={card} showDistance={false} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
