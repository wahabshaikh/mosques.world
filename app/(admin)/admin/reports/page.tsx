import type { Metadata } from "next";
import Link from "next/link";
import { AdminAction } from "@/components/mw/admin-action";
import { appEnv } from "@/lib/db/client";
import { publicHandle } from "@/lib/people";
import { requireModerator } from "@/lib/session";
import { relativeAge } from "@/lib/trust/summary";
import { AdminShell } from "../shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports", robots: { index: false } };

export default async function ReportsPage() {
  await requireModerator("/admin/reports");
  const rows = await appEnv()
    .DB.prepare(
      `SELECT report.id, report.target_type, report.reason, report.note, report.created_at, place.name AS place_name, place.slug,
         user.username, user.deleted_at
       FROM report LEFT JOIN place ON place.id = report.place_id LEFT JOIN user ON user.id = report.reporter_id
       WHERE report.status = 'open' ORDER BY report.created_at LIMIT 100`,
    )
    .all<{ id: string; target_type: string; reason: string; note: string | null; created_at: number; place_name: string | null; slug: string | null; username: string | null; deleted_at: number | null }>();
  const items = rows.results ?? [];
  const now = Date.now();
  return (
    <AdminShell active="/admin/reports" title="Open reports">
      {items.length === 0 ? (
        <p className="rounded-2xl bg-muted p-6 text-sm">No open reports.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex-1 text-sm">
                <p className="font-bold">
                  {item.slug ? (
                    <Link href={`/m/${item.slug}`} className="underline">
                      {item.place_name}
                    </Link>
                  ) : (
                    "Unknown place"
                  )}{" "}
                  · {item.reason === "burst" ? "Burst of new accounts" : item.reason === "timing" ? "Timing problem" : "Other"}
                </p>
                {item.note ? <p>{item.note}</p> : null}
                <p className="text-muted-foreground">
                  {item.username || item.deleted_at ? publicHandle({ username: item.username, deletedAt: item.deleted_at }) : "system"} ·{" "}
                  {relativeAge(item.created_at, now)}
                </p>
              </div>
              <div className="flex gap-2">
                <AdminAction url={`/api/v1/admin/reports/${item.id}`} body={{ status: "resolved" }} label="Resolve" done="Resolved" variant="secondary" />
                <AdminAction url={`/api/v1/admin/reports/${item.id}`} body={{ status: "dismissed" }} label="Dismiss" done="Dismissed" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
