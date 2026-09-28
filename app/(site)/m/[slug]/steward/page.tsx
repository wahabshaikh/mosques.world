import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StewardRequestForm } from "@/components/mw/steward-forms";
import { appEnv } from "@/lib/db/client";
import { placeBySlug } from "@/lib/db/queries";
import { phase6Enabled } from "@/lib/phase";
import { requireUser } from "@/lib/session";
import { stewardStatus } from "@/lib/stewards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Look after this mosque", robots: { index: false } };

export default async function StewardRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await phase6Enabled())) notFound();
  const { slug } = await params;
  const place = await placeBySlug(slug);
  if (!place) notFound();
  const user = await requireUser(`/m/${slug}/steward`);
  const status = await stewardStatus(appEnv().DB, place.id, user.id);
  return (
    <div className="mx-auto max-w-[640px] px-4 py-10 lg:px-6">
      <Link href={`/m/${place.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {place.name}
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Are you involved with {place.name}?</h1>
      <p className="mt-3 text-muted-foreground">
        Stewards are imams, committee members and regular volunteers. Once a moderator approves you, your confirmations here count
        extra, you get told when someone disputes a time, and you have a list of what needs checking.
      </p>
      <div className="mt-8">
        {status === "approved" ? (
          <p className="rounded-2xl bg-primary-soft p-5 font-semibold text-primary">
            You look after this mosque. <Link href={`/steward/${place.slug}`} className="underline">Open your steward page</Link>
          </p>
        ) : status === "requested" ? (
          <p className="rounded-2xl bg-muted p-5 font-semibold">Your request is waiting for a moderator.</p>
        ) : (
          <StewardRequestForm placeId={place.id} placeName={place.name} />
        )}
      </div>
    </div>
  );
}
