import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SpecialForm } from "@/components/mw/special-form";
import { appEnv } from "@/lib/db/client";
import { placeBySlug } from "@/lib/db/queries";
import { civilDate } from "@/lib/prayer/times";
import { requireUser } from "@/lib/session";
import { stewardStatus } from "@/lib/stewards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add Eid or Taraweeh times", robots: { index: false } };

export default async function SpecialPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = await placeBySlug(slug);
  if (!place || place.status !== "active") notFound();
  const user = await requireUser(`/m/${slug}/special`);
  const steward = (await stewardStatus(appEnv().DB, place.id, user.id)) === "approved";
  const civil = civilDate(new Date(), place.timezone);
  const today = `${civil.year}-${String(civil.month).padStart(2, "0")}-${String(civil.day).padStart(2, "0")}`;
  return (
    <div className="mx-auto max-w-[720px] px-4 py-10 lg:px-6">
      <Link href={`/m/${place.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {place.name}
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Eid, Taraweeh and Tahajjud</h1>
      <p className="mt-2 text-muted-foreground">Add times the mosque has announced. The latest entry for a prayer and date replaces the one before.</p>
      <div className="mt-8">
        {user.trustLevel >= 1 || steward ? (
          <SpecialForm placeId={place.id} slug={place.slug} today={today} />
        ) : (
          <p className="rounded-2xl bg-muted p-5 text-sm">
            Special prayers can be added by contributors and stewards. Confirm a few times on mosque pages first, or ask to look after this mosque.
          </p>
        )}
      </div>
    </div>
  );
}
