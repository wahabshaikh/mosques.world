import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TimetableImport } from "@/components/mw/timetable-import";
import { placeBySlug } from "@/lib/db/queries";
import { phase7Enabled } from "@/lib/phase";
import { civilDate } from "@/lib/prayer/times";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import a timetable", robots: { index: false } };

export default async function TimetableImportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await phase7Enabled())) notFound();
  const { slug } = await params;
  const place = await placeBySlug(slug);
  if (!place || place.status !== "active") notFound();
  const requested = (await searchParams).month;
  await requireUser(`/m/${slug}/timetable/import`);
  const civil = civilDate(new Date(), place.timezone);
  const month = typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : `${civil.year}-${String(civil.month).padStart(2, "0")}`;
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 lg:px-6">
      <Link href={`/m/${place.slug}/timetable`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {place.name} timetable
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Import a monthly timetable</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        One photo of the board fills a whole month. Each day&apos;s time goes through the same community checks as any other time.
      </p>
      <div className="mt-8">
        <TimetableImport placeId={place.id} slug={place.slug} initialMonth={month} />
      </div>
    </div>
  );
}
