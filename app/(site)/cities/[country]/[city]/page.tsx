import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cityBySlug, placesInCity } from "@/lib/db/queries";
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
      <p className="mt-2 text-muted-foreground">{places.length} places from OpenStreetMap, with calculated adhan times.</p>
      <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
        {places.map((place) => (
          <li key={place.id}>
            <Link href={`/m/${place.slug}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted">
              <span>
                <span className="font-semibold">{place.name}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{place.locality}</span>
              </span>
              <span className="text-sm text-primary">Times</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
