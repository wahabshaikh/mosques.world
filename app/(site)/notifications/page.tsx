import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MarkAllRead, TrackOpen } from "@/components/mw/notification-client";
import { appEnv } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { relativeAge } from "@/lib/trust/summary";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsPage() {
  const user = await requireUser("/notifications");
  const rows = await appEnv()
    .DB.prepare(`SELECT id, topic, title, body, url, read_at, created_at FROM notification WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
    .bind(user.id)
    .all<{ id: string; topic: string; title: string; body: string; url: string; read_at: number | null; created_at: number }>();
  const items = rows.results ?? [];
  const unread = items.filter((item) => item.read_at === null).length;
  const now = Date.now();
  return (
    <div className="mx-auto max-w-[720px] px-4 py-10 lg:px-6">
      <MarkAllRead unread={unread} />
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <Link href="/settings/notifications" className="text-sm font-semibold underline">
          Settings
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-input p-10 text-center">
          <Bell className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">Nothing yet</p>
          <p className="text-sm text-muted-foreground">Save a mosque and we&apos;ll tell you when its times change.</p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} data-notification={item.topic} data-unread={item.read_at === null}>
              <TrackOpen href={item.url} topic={item.topic} className="flex gap-3 py-4 hover:bg-muted/40">
                <span className={cn("mt-2 size-2 shrink-0 rounded-full", item.read_at === null ? "bg-primary" : "bg-transparent")} aria-hidden="true" />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="font-bold">{item.title}</span>
                  <span className="text-sm">{item.body}</span>
                  <span className="text-xs text-muted-foreground">{relativeAge(item.created_at, now)}</span>
                </span>
              </TrackOpen>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
