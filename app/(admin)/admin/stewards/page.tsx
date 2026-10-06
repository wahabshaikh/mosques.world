import type { Metadata } from "next";
import Link from "next/link";
import { AdminAction } from "@/components/mw/admin-action";
import { appEnv } from "@/lib/db/client";
import { requireModerator } from "@/lib/session";
import { relativeAge } from "@/lib/trust/summary";
import { AdminShell } from "../shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stewards", robots: { index: false } };

type Row = { id: string; status: string; evidence: string; contact: string | null; created_at: number; name: string; slug: string; username: string | null; email: string; trust_level: number };

export default async function StewardsAdminPage() {
  await requireModerator("/admin/stewards");
  const database = appEnv().DB;
  const query = (status: string, limit: number) =>
    database
      .prepare(
        `SELECT steward.id, steward.status, steward.evidence, steward.contact, steward.created_at, place.name, place.slug, user.username, user.email, user.trust_level
         FROM steward JOIN place ON place.id = steward.place_id JOIN user ON user.id = steward.user_id
         WHERE steward.status = ? ORDER BY steward.created_at LIMIT ?`,
      )
      .bind(status, limit)
      .all<Row>();
  const [requested, approved] = await Promise.all([query("requested", 100), query("approved", 200)]);
  const now = Date.now();
  const row = (item: Row, actions: React.ReactNode) => (
    <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start" data-steward={item.id}>
      <div className="flex-1 text-sm">
        <p className="font-bold">
          @{item.username ?? "?"} ·{" "}
          <Link href={`/m/${item.slug}`} className="underline">
            {item.name}
          </Link>
        </p>
        <p className="mt-1 whitespace-pre-line">{item.evidence}</p>
        <p className="mt-1 text-muted-foreground">
          {item.contact ? `Check: ${item.contact} · ` : ""}
          {item.email} · trust {item.trust_level} · {relativeAge(item.created_at, now)}
        </p>
      </div>
      <div className="flex gap-2">{actions}</div>
    </li>
  );
  return (
    <AdminShell active="/admin/stewards" title="Stewards">
      <h2 className="text-lg font-bold">Requests</h2>
      {(requested.results ?? []).length === 0 ? (
        <p className="mt-3 rounded-2xl bg-muted p-6 text-sm">No steward requests.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border rounded-2xl border border-border">
          {(requested.results ?? []).map((item) =>
            row(
              item,
              <>
                <AdminAction url={`/api/v1/admin/stewards/${item.id}`} body={{ action: "approve" }} label="Approve" done="Approved" variant="secondary" />
                <AdminAction url={`/api/v1/admin/stewards/${item.id}`} body={{ action: "reject" }} label="Reject" done="Rejected" />
              </>,
            ),
          )}
        </ul>
      )}
      <h2 className="mt-10 text-lg font-bold">Approved</h2>
      <ul className="mt-3 flex flex-col divide-y divide-border rounded-2xl border border-border">
        {(approved.results ?? []).map((item) =>
          row(item, <AdminAction url={`/api/v1/admin/stewards/${item.id}`} body={{ action: "revoke" }} label="Revoke" done="Revoked" confirm="Revoke this steward?" />),
        )}
      </ul>
    </AdminShell>
  );
}
