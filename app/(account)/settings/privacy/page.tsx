import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckinList, PrivacyForm } from "@/components/mw/privacy-settings";
import { appEnv } from "@/lib/db/client";
import { asCheckinVisibility } from "@/lib/checkin-options";
import { phase4Enabled } from "@/lib/phase";
import { requireUser } from "@/lib/session";
import { SettingsShell } from "../settings-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy settings", robots: { index: false } };

export default async function PrivacySettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await phase4Enabled())) notFound();
  const user = await requireUser("/settings/privacy");
  const shown = Math.min(Math.max(Number((await searchParams).n) || 50, 50), 500);
  const rows = await appEnv()
    .DB.prepare(
      `SELECT checkin.id, checkin.prayer, checkin.local_date, checkin.geo_verified, place.name, place.slug, place.locality
       FROM checkin JOIN place ON place.id = checkin.place_id WHERE checkin.user_id = ? ORDER BY checkin.local_date DESC, checkin.created_at DESC LIMIT ?`,
    )
    .bind(user.id, shown + 1)
    .all<{ id: string; prayer: string; local_date: string; geo_verified: number; name: string; slug: string; locality: string | null }>();
  const checkins = (rows.results ?? []).map((row) => ({
    id: row.id,
    prayer: row.prayer,
    localDate: row.local_date,
    geoVerified: row.geo_verified === 1,
    placeName: row.name,
    placeSlug: row.slug,
    locality: row.locality,
  }));
  return (
    <SettingsShell active="/settings/privacy" title="Privacy">
      <PrivacyForm initial={{ profilePublic: user.profilePublic, checkinsVisibility: asCheckinVisibility(user.checkinsVisibility) }} username={user.username ?? ""} />
      <section className="mt-12">
        <h2 className="text-xl font-bold">Your check-ins</h2>
        <p className="mt-1 text-sm text-muted-foreground">Delete any check-in and it disappears from your map and stats.</p>
        <CheckinList checkins={checkins.slice(0, shown)} more={checkins.length > shown ? `/settings/privacy?n=${shown + 50}` : null} />
      </section>
    </SettingsShell>
  );
}
