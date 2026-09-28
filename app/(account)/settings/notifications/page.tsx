import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnablePush, PrefToggle } from "@/components/mw/notification-client";
import { appEnv } from "@/lib/db/client";
import { NOTIFICATION_TOPICS, TOPIC_LABELS } from "@/lib/notifications";
import { loadPrefs } from "@/lib/notify";
import { phase6Enabled } from "@/lib/phase";
import { requireUser } from "@/lib/session";
import { SettingsShell } from "../settings-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notification settings", robots: { index: false } };

export default async function NotificationSettingsPage() {
  if (!(await phase6Enabled())) notFound();
  const user = await requireUser("/settings/notifications");
  const env = appEnv();
  const enabled = await loadPrefs(env.DB, [user.id]);
  return (
    <SettingsShell active="/settings/notifications" title="Notifications">
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        {NOTIFICATION_TOPICS.map((topic) => (
          <li key={topic} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-topic={topic}>
            <span className="flex-1">
              <span className="block font-semibold">{TOPIC_LABELS[topic].title}</span>
              <span className="text-sm text-muted-foreground">{TOPIC_LABELS[topic].help}</span>
            </span>
            <span className="flex gap-5">
              <PrefToggle channel="email" topic={topic} initial={enabled(user.id, "email", topic)} label="Email" />
              {topic === "digest" ? null : <PrefToggle channel="push" topic={topic} initial={enabled(user.id, "push", topic)} label="Push" />}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">Everything also appears in your in-app inbox.</p>
      {env.VAPID_PUBLIC_KEY ? (
        <div className="mt-8">
          <EnablePush vapidKey={env.VAPID_PUBLIC_KEY} />
        </div>
      ) : null}
    </SettingsShell>
  );
}
