"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const VISITS = "mw:visits";
const DISMISSED = "mw:install-dismissed";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode: the prompt simply shows less often.
  }
}

/**
 * Registers the service worker and offers installation from the second visit on (spec P5 PWA).
 * Visits are counted once per browser session.
 */
export function Pwa() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    if (!navigator.onLine) track("offline_open");
    const from = new URLSearchParams(window.location.search).get("from");
    if (from === "push" || from === "email") track("notification_opened", { channel: from });
    let visits = Number(read(VISITS) ?? "0");
    try {
      if (!window.sessionStorage.getItem(VISITS)) {
        visits += 1;
        write(VISITS, String(visits));
        window.sessionStorage.setItem(VISITS, "1");
      }
    } catch {
      // Storage unavailable.
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      if (visits >= 2 && !read(DISMISSED)) setVisible(true);
    };
    const onInstalled = () => {
      track("pwa_installed");
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible || !installEvent) return null;
  return (
    <div
      role="dialog"
      aria-label="Install mosques.world"
      className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-background p-3 shadow-lg"
    >
      <img src="/icons/icon-192.png" alt="" className="size-10 rounded-xl" />
      <span className="flex-1 text-sm">
        <strong className="block">Add mosques.world to your home screen</strong>
        Times for your saved mosques, even offline.
      </span>
      <button
        type="button"
        className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-sm font-bold text-primary-foreground"
        onClick={async () => {
          await installEvent.prompt();
          const choice = await installEvent.userChoice;
          if (choice.outcome === "dismissed") write(DISMISSED, "1");
          setVisible(false);
        }}
      >
        <Download className="size-4" aria-hidden="true" /> Install
      </button>
      <button
        type="button"
        aria-label="Not now"
        className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
        onClick={() => {
          write(DISMISSED, "1");
          setVisible(false);
        }}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
