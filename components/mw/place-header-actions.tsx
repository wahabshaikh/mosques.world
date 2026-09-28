"use client";

import { Bookmark, Share } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { useViewer } from "./place-actions";
import { useText } from "./text";

const action = "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold underline underline-offset-2 hover:bg-muted";

/** Web Share where available, otherwise copy the link. Returns the channel for analytics. */
export async function shareLink(input: { title: string; url: string }): Promise<"native" | "copy" | null> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(input);
      return "native";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
    }
  }
  try {
    await navigator.clipboard.writeText(input.url);
    toast.success("Link copied");
    return "copy";
  } catch {
    toast.error("Could not copy the link.");
    return null;
  }
}

export function ShareButton({ title, path }: { title: string; path: string }) {
  const text = useText();
  return (
    <button type="button" className={action} onClick={() => void shareLink({ title, url: new URL(path, window.location.origin).toString() })}>
      <Share className="size-4" aria-hidden="true" /> {text("Share")}
    </button>
  );
}

/** Save to `/saved` (spec P4); signed-out viewers are sent to sign in first. */
export function SaveButton({ placeId }: { placeId: string }) {
  const { viewer, loaded, saved, setSaved, signInHref } = useViewer();
  const text = useText();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={action}
      aria-pressed={saved}
      disabled={pending || !loaded}
      onClick={async () => {
        if (!viewer) {
          window.location.assign(signInHref());
          return;
        }
        setPending(true);
        const next = !saved;
        const response = await fetch("/api/v1/saved", {
          method: next ? "POST" : "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ placeId }),
        });
        setPending(false);
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          toast.error(body?.error ?? "Could not update your saved places.");
          return;
        }
        setSaved(next);
        if (next) track("place_saved");
        toast.success(text(next ? "Saved. Find it any time in Saved." : "Removed from Saved."));
      }}
    >
      <Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden="true" /> {text(saved ? "Saved" : "Save")}
    </button>
  );
}
