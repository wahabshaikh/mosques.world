import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiKeys } from "@/components/mw/api-keys";
import { FREE_RATE_LIMIT, listApiKeys, MAX_ACTIVE_KEYS } from "@/lib/api-keys";
import { appEnv } from "@/lib/db/client";
import { phase2Enabled, phase8Enabled } from "@/lib/phase";
import { requireUser } from "@/lib/session";
import { SettingsShell } from "../settings-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "API keys", robots: { index: false } };

export default async function DeveloperSettingsPage() {
  if (!(await phase8Enabled()) || !(await phase2Enabled())) notFound();
  const user = await requireUser("/settings/developers");
  const keys = await listApiKeys(appEnv().DB, user.id);
  return (
    <SettingsShell active="/settings/developers" title="API keys">
      <p className="mb-6 text-sm text-muted-foreground">
        Keys for the public read API: {FREE_RATE_LIMIT} requests a minute each, up to {MAX_ACTIVE_KEYS} active keys.{" "}
        <Link href="/developers" className="font-semibold text-foreground underline">
          Read the API docs
        </Link>
        .
      </p>
      <ApiKeys initial={keys} />
    </SettingsShell>
  );
}
