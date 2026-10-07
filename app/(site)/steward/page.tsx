import type { Metadata } from "next";
import Link from "next/link";
import { StewardDashboard } from "@/components/mw/steward-dashboard";
import { appEnv } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { stewardQueue } from "@/lib/stewards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Steward", robots: { index: false } };

export default async function StewardPage() {
  const user = await requireUser("/steward");
  const places = await stewardQueue(appEnv().DB, user.id);
  return (
    <div className="mx-auto max-w-[900px] px-4 py-10 lg:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Your mosques</h1>
      <p className="mt-2 text-muted-foreground">What needs you at the places you look after. Your confirmations here count extra.</p>
      <div className="mt-8">
        {places.length === 0 ? (
          <p className="rounded-2xl bg-muted p-6 text-sm">
            You don&apos;t look after a mosque yet. On a mosque page, choose <strong>Are you involved with this mosque?</strong> to ask.{" "}
            <Link href="/" className="underline">
              Find your mosque
            </Link>
          </p>
        ) : (
          <StewardDashboard places={places} />
        )}
      </div>
    </div>
  );
}
