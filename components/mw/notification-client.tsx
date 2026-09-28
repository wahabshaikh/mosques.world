"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import type { NotificationChannel, NotificationTopic } from "@/lib/notifications";

/** Marks the inbox read once it has been seen. */
export function MarkAllRead({ unread }: { unread: number }) {
  const router = useRouter();
  useEffect(() => {
    if (unread === 0) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/v1/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) }).then(() =>
        router.refresh(),
      );
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [unread, router]);
  return null;
}

export function TrackOpen({ href, topic, children, className }: { href: string; topic: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} className={className} onClick={() => track("notification_opened", { channel: "inbox", topic })}>
      {children}
    </a>
  );
}

export function PrefToggle({ channel, topic, initial, label }: { channel: NotificationChannel; topic: NotificationTopic; initial: boolean; label: string }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={enabled}
        disabled={pending}
        className="size-4 accent-primary"
        onChange={async (event) => {
          const next = event.target.checked;
          setEnabled(next);
          setPending(true);
          const response = await fetch("/api/v1/notifications/prefs", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ channel, topic, enabled: next }),
          });
          setPending(false);
          if (!response.ok) {
            setEnabled(!next);
            toast.error("Could not save that setting.");
            return;
          }
          if (!next) track("unsubscribe", { channel, topic, from: "settings" });
        }}
      />
      {label}
    </label>
  );
}

function base64Key(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let index = 0; index < bytes.length; index += 1) out[index] = bytes.charCodeAt(index);
  return out;
}

/** Turns on push for this browser (the permission prompt only ever follows this tap). */
export function EnablePush({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<"unknown" | "on" | "off" | "blocked" | "unsupported">("unknown");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);
  if (state === "unknown") return null;
  if (state === "unsupported") return <p className="text-sm text-muted-foreground">This browser can&apos;t show notifications. Email still works.</p>;
  if (state === "blocked") return <p className="text-sm text-muted-foreground">Notifications are blocked for this site in your browser settings.</p>;
  if (state === "on") return <p className="text-sm font-semibold text-primary">Notifications are on for this browser.</p>;
  return (
    <button
      type="button"
      className="inline-flex h-11 items-center rounded-[12px] border border-foreground px-4 text-sm font-bold"
      onClick={async () => {
        if ((await Notification.requestPermission()) !== "granted") {
          setState("blocked");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64Key(vapidKey) });
        const response = await fetch("/api/v1/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
        setState(response.ok ? "on" : "off");
      }}
    >
      Turn on notifications in this browser
    </button>
  );
}
