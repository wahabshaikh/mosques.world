import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { citiesInCountry } from "@/lib/db/queries";
import { countryName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const { country } = await params;
  const name = countryName(country);
  return {
    title: `Mosques in ${name}`,
    description: `Find mosques and prayer spaces in ${name} by city, with jamā'ah (iqamah) times kept up to date by the community.`,
    alternates: { canonical: `/countries/${country.toLowerCase()}` },
  };
}

export default async function CountryPage({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  const cities = await citiesInCountry(country);
  if (cities.length === 0) notFound();
  const name = countryName(country);
  const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Mosques in ${name} by city`,
    itemListElement: cities.slice(0, 100).map((city, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `Mosques in ${city.name}`,
      url: `${base}/cities/${country.toLowerCase()}/${city.citySlug}`,
    })),
  };
  return (
    <div className="mx-auto max-w-[800px] px-4 pt-4 pb-12 lg:px-6 lg:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tight lg:text-[32px]">Mosques in {name}</h1>
      <p className="mt-2 text-muted-foreground">Choose a city to see its masajid and today&apos;s jamā&apos;ah times.</p>
      <ul className="mt-6 divide-y divide-border">
        {cities.map((city) => (
          <li key={city.citySlug}>
            <Link href={`/cities/${country.toLowerCase()}/${city.citySlug}`} className="flex items-center justify-between gap-3 py-4 hover:bg-muted/50">
              <span>
                <span className="font-semibold">{city.name}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {city.placeCount} {city.placeCount === 1 ? "place" : "places"}
                </span>
              </span>
              <ChevronRight className="size-5 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
