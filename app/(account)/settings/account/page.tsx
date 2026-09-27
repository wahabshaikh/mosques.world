import type { Metadata } from "next";
import { DeleteAccount } from "@/components/mw/delete-account";
import { appEnv } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { SettingsShell } from "../settings-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountSettingsPage() {
  const user = await requireUser("/settings/account");
  const providers = await appEnv()
    .DB.prepare(`SELECT provider_id FROM account WHERE user_id = ?`)
    .bind(user.id)
    .all<{ provider_id: string }>();
  const google = (providers.results ?? []).some((row) => row.provider_id === "google");
  return (
    <SettingsShell active="/settings/account" title="Account">
      <dl className="divide-y divide-border rounded-2xl border border-border text-sm">
        <div className="flex justify-between gap-4 p-4">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-semibold">{user.email}</dd>
        </div>
        <div className="flex justify-between gap-4 p-4">
          <dt className="text-muted-foreground">Google</dt>
          <dd className="font-semibold">{google ? "Connected" : "Not connected"}</dd>
        </div>
      </dl>
      <section className="mt-8">
        <h2 className="text-xl font-bold">Your data</h2>
        <p className="mt-2 text-sm text-muted-foreground">Download everything we hold about you as JSON.</p>
        <a href="/api/v1/account/export" className="mt-3 inline-flex h-11 items-center rounded-[12px] border border-foreground/80 px-4 text-sm font-semibold hover:bg-muted">
          Export my data
        </a>
      </section>
      <DeleteAccount />
    </SettingsShell>
  );
}
