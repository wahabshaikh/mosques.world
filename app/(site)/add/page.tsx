import type { Metadata } from "next";
import { headers } from "next/headers";
import { AddPlace } from "@/components/mw/add-place";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add a mosque or prayer space", robots: { index: false } };

function coordinate(value: string | string[] | null | undefined, limit: number): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return value != null && Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
}

export default async function AddPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser("/add");
  const headerList = await headers();
  const lat = coordinate(params.lat, 90) ?? coordinate(headerList.get("x-mw-latitude"), 90) ?? 51.5074;
  const lng = coordinate(params.lng, 180) ?? coordinate(headerList.get("x-mw-longitude"), 180) ?? -0.1278;
  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 lg:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Add a mosque or prayer space</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Places you add go live as Unverified.{" "}
        {user.trustLevel === 0 ? "As a new member, yours is visible to you and trusted members until someone confirms it or 24 hours pass." : null}
      </p>
      <AddPlace initialCenter={{ lat, lng }} />
    </div>
  );
}
