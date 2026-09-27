import type { Metadata } from "next";
import { ExplorePage } from "./explore-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find a mosque",
  description: "Mosques and prayer spaces near you, with today's calculated adhan times.",
  alternates: { canonical: "/" },
};

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ExplorePage searchParams={searchParams} />;
}
