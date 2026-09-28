import type { Metadata } from "next";
import Link from "next/link";
import { AdminAction } from "@/components/mw/admin-action";
import { MergeForm } from "@/components/mw/merge-form";
import { appEnv } from "@/lib/db/client";
import { requireModerator } from "@/lib/session";
import { AdminShell } from "../../shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Places", robots: { index: false } };

export default async function MergePage() {
  await requireModerator("/admin/places/merge");
  const database = appEnv().DB;
  const [pairs, reports] = await database.batch([
    database.prepare(
      `SELECT pair.a_id, pair.b_id, pair.distance_m, pair.name_similarity, a.name AS a_name, a.slug AS a_slug, b.name AS b_name, b.slug AS b_slug
       FROM place_duplicate_candidate AS pair JOIN place AS a ON a.id = pair.a_id JOIN place AS b ON b.id = pair.b_id
       WHERE pair.status = 'open' ORDER BY pair.created_at LIMIT 50`,
    ),
    database.prepare(
      `SELECT report.id, report.reason, report.note, place.id AS place_id, place.name, place.slug, place.status FROM report JOIN place ON place.id = report.place_id
       WHERE report.status = 'open' AND report.reason IN ('closed', 'duplicate', 'wrong_location') ORDER BY report.created_at LIMIT 50`,
    ),
  ]);
  const duplicatePairs = (pairs?.results ?? []) as Array<{ a_id: string; b_id: string; distance_m: number; name_similarity: number; a_name: string; a_slug: string; b_name: string; b_slug: string }>;
  const placeReports = (reports?.results ?? []) as Array<{ id: string; reason: string; note: string | null; place_id: string; name: string; slug: string; status: string }>;
  return (
    <AdminShell active="/admin/places/merge" title="Places">
      <h2 className="mb-3 text-xl font-bold">Merge duplicates</h2>
      <MergeForm />
      <h2 className="mt-10 mb-3 text-xl font-bold">Possible duplicates</h2>
      {duplicatePairs.length === 0 ? (
        <p className="rounded-2xl bg-muted p-6 text-sm">None flagged.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
          {duplicatePairs.map((pair) => (
            <li key={`${pair.a_id}-${pair.b_id}`} className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center">
              <p className="flex-1">
                <Link href={`/m/${pair.a_slug}`} className="font-bold underline">
                  {pair.a_name}
                </Link>{" "}
                and{" "}
                <Link href={`/m/${pair.b_slug}`} className="font-bold underline">
                  {pair.b_name}
                </Link>{" "}
                · {pair.distance_m} m apart · name {Math.round(pair.name_similarity * 100)}% similar
              </p>
              <AdminAction url={`/api/v1/admin/places/${pair.a_id}`} body={{ action: "keep_separate", otherId: pair.b_id }} label="Keep separate" done="Marked as different places" />
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-10 mb-3 text-xl font-bold">Reported places</h2>
      {placeReports.length === 0 ? (
        <p className="rounded-2xl bg-muted p-6 text-sm">No open place reports.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
          {placeReports.map((report) => (
            <li key={report.id} className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center">
              <p className="flex-1">
                <Link href={`/m/${report.slug}`} className="font-bold underline">
                  {report.name}
                </Link>{" "}
                · {report.reason.replace("_", " ")}
                {report.note ? ` · ${report.note}` : ""}
              </p>
              <div className="flex gap-2">
                {report.reason === "closed" && report.status !== "closed" ? (
                  <AdminAction url={`/api/v1/admin/places/${report.place_id}`} body={{ action: "close", reason: report.note ?? undefined }} label="Close place" done="Marked closed" variant="warning" />
                ) : null}
                {report.status === "closed" ? (
                  <AdminAction url={`/api/v1/admin/places/${report.place_id}`} body={{ action: "restore" }} label="Restore" done="Restored" />
                ) : null}
                <AdminAction url={`/api/v1/admin/reports/${report.id}`} body={{ status: "resolved" }} label="Resolve" done="Resolved" variant="secondary" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
