import type { Metadata } from "next";
import { AdminAction } from "@/components/mw/admin-action";
import { appEnv } from "@/lib/db/client";
import { publicHandle } from "@/lib/people";
import { requireModerator } from "@/lib/session";
import { describeValue, factLabel } from "@/lib/trust/facts";
import { relativeAge } from "@/lib/trust/summary";
import { AdminShell } from "../shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit log", robots: { index: false } };

type AuditRow = {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  after_json: string | null;
  reverted_at: number | null;
  created_at: number;
  username: string | null;
  deleted_at: number | null;
  actor_id: string | null;
  key: string | null;
  qualifier: string | null;
  place_name: string | null;
  value_json: string | null;
};

export default async function AuditPage() {
  await requireModerator("/admin/audit");
  const rows = await appEnv()
    .DB.prepare(
      `SELECT audit_log.id, audit_log.action, audit_log.target_type, audit_log.target_id, audit_log.after_json, audit_log.reverted_at,
         audit_log.created_at, audit_log.actor_id, user.username, user.deleted_at, fact.key, fact.qualifier, place.name AS place_name,
         promoted.value_json
       FROM audit_log
       LEFT JOIN user ON user.id = audit_log.actor_id
       LEFT JOIN fact ON audit_log.target_type = 'fact' AND fact.id = audit_log.target_id
       LEFT JOIN place ON place.id = fact.place_id
       LEFT JOIN fact_candidate AS promoted ON promoted.id = json_extract(audit_log.after_json, '$.candidateId')
       ORDER BY audit_log.created_at DESC LIMIT 100`,
    )
    .all<AuditRow>();
  const items = rows.results ?? [];
  const now = Date.now();
  return (
    <AdminShell active="/admin/audit" title="Audit log">
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center" data-audit={item.action}>
            <div className="flex-1 text-sm">
              <p>
                <strong>{item.action.replaceAll("_", " ")}</strong>
                {item.key ? ` · ${item.place_name} · ${factLabel(item.key, item.qualifier ?? "")}` : ` · ${item.target_type}`}
                {item.key && item.value_json ? ` → ${describeValue(item.key, JSON.parse(item.value_json))}` : ""}
              </p>
              <p className="text-muted-foreground">
                {item.actor_id ? publicHandle({ username: item.username, deletedAt: item.deleted_at }) : "consensus engine"} ·{" "}
                {relativeAge(item.created_at, now)}
                {item.reverted_at ? " · reverted" : ""}
              </p>
            </div>
            {item.action === "promote" && !item.reverted_at ? (
              <AdminAction
                url={`/api/v1/admin/audit/${item.id}/revert`}
                label="Revert"
                done="Reverted to the previous value"
                confirm="Restore the previous value? The author's contribution counts as rejected."
              />
            ) : null}
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
