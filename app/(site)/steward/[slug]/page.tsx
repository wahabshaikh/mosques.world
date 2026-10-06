import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StewardDashboard } from "@/components/mw/steward-dashboard";
import { appEnv } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { stewardQueue } from "@/lib/stewards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Steward", robots: { index: false } };

export default async function StewardPlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/steward/${slug}`);
  const places = await stewardQueue(appEnv().DB, user.id, slug);
  if (places.length === 0) notFound();
  return (
    <div className="mx-auto max-w-[900px] px-4 py-10 lg:px-6">
      <Link href="/steward" className="text-sm text-muted-foreground hover:text-foreground">
        ← All your mosques
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Steward</h1>
      <div className="mt-8">
        <StewardDashboard places={places} />
      </div>
    </div>
  );
}
