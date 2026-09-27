import type { Metadata } from "next";
import { AdminAction, BanForm } from "@/components/mw/admin-action";
import { appEnv } from "@/lib/db/client";
import { requireModerator } from "@/lib/session";
import { asTrustLevel, TRUST_NAMES } from "@/lib/trust/engine";
import { AdminShell } from "../shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Members", robots: { index: false } };

type UserRow = {
  id: string;
  username: string | null;
  email: string;
  role: string;
  trust_level: number;
  trust_override: number | null;
  accepted_count: number;
  rejected_count: number;
  banned: number | null;
  ban_reason: string | null;
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModerator("/admin/users");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase().replace(/^@/, "") : "";
  const database = appEnv().DB;
  const rows = q
    ? await database
        .prepare(
          `SELECT id, username, email, role, trust_level, trust_override, accepted_count, rejected_count, banned, ban_reason FROM user
           WHERE deleted_at IS NULL AND (username LIKE ? OR email = ?) ORDER BY username LIMIT 50`,
        )
        .bind(`${q.replaceAll("%", "")}%`, q)
        .all<UserRow>()
    : await database
        .prepare(
          `SELECT id, username, email, role, trust_level, trust_override, accepted_count, rejected_count, banned, ban_reason FROM user
           WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,
        )
        .all<UserRow>();
  const items = rows.results ?? [];
  return (
    <AdminShell active="/admin/users" title="Members">
      <form className="mb-4 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Username or email
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="@username or email" className="h-11 w-72 rounded-[12px] border border-input bg-background px-3" />
        <button type="submit" className="h-11 rounded-[12px] bg-secondary px-4 text-sm font-semibold text-secondary-foreground">
          Search
        </button>
      </form>
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center" data-user={item.username ?? item.id}>
            <div className="flex-1 text-sm">
              <p className="font-bold">
                {item.username ? `@${item.username}` : "(no username yet)"} <span className="font-normal text-muted-foreground">{item.email}</span>
              </p>
              <p className="text-muted-foreground">
                {TRUST_NAMES[asTrustLevel(item.trust_level)]}
                {item.trust_override !== null ? " (override)" : ""} · {item.role} · {item.accepted_count} accepted · {item.rejected_count} rejected
                {item.banned ? ` · suspended: ${item.ban_reason ?? ""}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[0, 1, 2, 3].map((level) => (
                <AdminAction
                  key={level}
                  url={`/api/v1/admin/users/${item.id}`}
                  body={{ trustOverride: level }}
                  label={`L${level}`}
                  done={`Trust set to ${TRUST_NAMES[asTrustLevel(level)]}`}
                  variant={item.trust_override === level ? "secondary" : "outline"}
                />
              ))}
              {item.trust_override !== null ? (
                <AdminAction url={`/api/v1/admin/users/${item.id}`} body={{ trustOverride: null }} label="Auto" done="Trust level is automatic again" />
              ) : null}
              {item.banned ? (
                <AdminAction url={`/api/v1/admin/users/${item.id}`} body={{ ban: false }} label="Unsuspend" done="Unsuspended" />
              ) : (
                <BanForm userId={item.id} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
