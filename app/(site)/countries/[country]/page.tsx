import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { citiesInCountry } from "@/lib/db/queries";
import { countryName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const { country } = await params;
  return { title: countryName(country), alternates: { canonical: `/countries/${country.toLowerCase()}` } };
}

export default async function CountryPage({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  const cities = await citiesInCountry(country);
  if (cities.length === 0) notFound();
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 lg:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{countryName(country)}</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {cities.map((city) => (
          <li key={city.citySlug}>
            <Link
              href={`/cities/${country.toLowerCase()}/${city.citySlug}`}
              className="block rounded-2xl border border-border p-4 hover:bg-muted"
            >
              <span className="font-semibold">{city.name}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{city.placeCount} places</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
