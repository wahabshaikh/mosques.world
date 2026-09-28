"use client";

import { MapPinCheck } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import type { CheckinPrayer } from "@/lib/checkin-options";
import { useViewer } from "./place-actions";

const CheckinDialog = lazy(() => import("./checkin-dialog"));

/** "I prayed here" on the next-prayer card (spec P4, flow F5). */
export function CheckinButton(props: { placeId: string; placeName: string; defaultPrayer: CheckinPrayer; jumuah: boolean; today: string }) {
  const { viewer, loaded, intent, signInHref } = useViewer();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (intent === "checkin" && viewer) setOpen(true);
  }, [intent, viewer]);
  return (
    <>
      <button
        type="button"
        disabled={!loaded}
        onClick={() => {
          if (!viewer) {
            window.location.assign(signInHref("checkin"));
            return;
          }
          if (!viewer.username) {
            window.location.assign(`/onboarding?next=${encodeURIComponent(window.location.pathname)}`);
            return;
          }
          setOpen(true);
        }}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-foreground font-bold"
      >
        <MapPinCheck className="size-[18px]" aria-hidden="true" /> I prayed here
      </button>
      {open && viewer?.username ? (
        <Suspense fallback={null}>
          <CheckinDialog {...props} username={viewer.username} open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : null}
    </>
  );
}
