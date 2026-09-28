"use client";

import { Share } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { shareLink } from "./place-header-actions";

function profileUrl(username: string) {
  return new URL(`/@${username}`, window.location.origin).toString();
}

/** "Share my map" on the profile hero (spec P4 sharing): Web Share, else copy. */
export function ShareMapButton({ username, label = "Share my map", compact = false }: { username: string; label?: string; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-label={compact ? label : undefined}
      onClick={async () => {
        const channel = await shareLink({ title: `@${username} on mosques.world`, url: profileUrl(username) });
        if (channel) track("profile_shared", { channel });
      }}
      className={
        compact
          ? "flex size-9 items-center justify-center rounded-full bg-white text-[#1F1D1A]"
          : "inline-flex h-11 w-fit items-center gap-2 rounded-[12px] bg-white px-4 text-sm font-bold text-[#1F1D1A]"
      }
    >
      <Share className="size-4" aria-hidden="true" />
      {compact ? null : label}
    </button>
  );
}

export function CopyLinkField({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] border border-input py-2.5 pr-2.5 pl-4">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">mosques.world/@{username}</span>
      <button
        type="button"
        className="rounded-[10px] bg-foreground px-3.5 py-2 text-[13px] font-bold text-background"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(profileUrl(username));
            setCopied(true);
            track("profile_shared", { channel: "copy" });
            toast.success("Link copied");
          } catch {
            toast.error("Could not copy the link.");
          }
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
