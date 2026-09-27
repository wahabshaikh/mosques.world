import type { Metadata } from "next";
import Link from "next/link";
import { AdminAction } from "@/components/mw/admin-action";
import { appEnv } from "@/lib/db/client";
import { publicHandle } from "@/lib/people";
import { requireModerator } from "@/lib/session";
import { asTrustLevel, TRUST_NAMES } from "@/lib/trust/engine";
import { describeValue, factLabel } from "@/lib/trust/facts";
import { relativeAge } from "@/lib/trust/summary";
import { AdminShell } from "../shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderation queue", robots: { index: false } };

type HeldRow = {
  id: string;
  value_json: string;
  effective_from: string;
  created_at: number;
  key: string;
  qualifier: string;
  place_name: string;
  slug: string;
  username: string | null;
  deleted_at: number | null;
  trust_level: number;
  current_json: string | null;
  disputes: number;
  confirms: number;
};

export default async function QueuePage() {
  await requireModerator("/admin/queue");
  const rows = await appEnv()
    .DB.prepare(
      `SELECT held.id, held.value_json, held.effective_from, held.created_at, fact.key, fact.qualifier,
         place.name AS place_name, place.slug, user.username, user.deleted_at, user.trust_level,
         current.value_json AS current_json,
         (SELECT COUNT(*) FROM vote WHERE vote.candidate_id = held.id AND vote.polarity < 0) AS disputes,
         (SELECT COUNT(*) FROM vote WHERE vote.candidate_id = held.id AND vote.polarity > 0) AS confirms
       FROM fact_candidate AS held
       JOIN fact ON fact.id = held.fact_id
       JOIN place ON place.id = fact.place_id
       LEFT JOIN user ON user.id = held.created_by
       LEFT JOIN fact_candidate AS current ON current.id = fact.current_candidate_id
       WHERE held.status = 'held'
       ORDER BY held.created_at LIMIT 100`,
    )
    .all<HeldRow>();
  const items = rows.results ?? [];
  const now = Date.now();
  return (
    <AdminShell active="/admin/queue" title="Held contributions">
      <p className="mb-4 text-sm text-muted-foreground">
        Changes to established times from new accounts wait here until a trusted member confirms them, 48 hours pass without a dispute,
        or a moderator decides.
      </p>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-muted p-6 text-sm">Nothing waiting. JazakAllahu khayran.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border" aria-label="Held contributions">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-held={item.id}>
              <div className="flex-1 text-sm">
                <p className="font-bold">
                  <Link href={`/m/${item.slug}`} className="underline">
                    {item.place_name}
                  </Link>{" "}
                  · {factLabel(item.key, item.qualifier)}
                </p>
                <p>
                  {item.current_json ? `${describeValue(item.key, JSON.parse(item.current_json))} → ` : ""}
                  <strong>{describeValue(item.key, JSON.parse(item.value_json))}</strong> from {item.effective_from}
                </p>
                <p className="text-muted-foreground">
                  {publicHandle({ username: item.username, deletedAt: item.deleted_at })} ({TRUST_NAMES[asTrustLevel(item.trust_level)]}) ·{" "}
                  {relativeAge(item.created_at, now)} · {item.confirms} confirm · {item.disputes} dispute
                </p>
              </div>
              <div className="flex gap-2">
                <AdminAction url={`/api/v1/admin/held/${item.id}`} body={{ action: "approve" }} label="Approve" done="Approved and live" variant="secondary" />
                <AdminAction url={`/api/v1/admin/held/${item.id}`} body={{ action: "reject" }} label="Reject" done="Rejected" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
