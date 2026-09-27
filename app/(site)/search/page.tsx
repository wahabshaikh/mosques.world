import type { Metadata } from "next";
import { ExplorePage } from "../explore-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  alternates: { canonical: "/search" },
};

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ExplorePage searchParams={searchParams} />;
}
