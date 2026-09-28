"use client";

import { Flag } from "lucide-react";
import { lazy, Suspense, useState } from "react";

const ReportDialog = lazy(() => import("./report-dialog"));

export function ReportPhoto({ placeId, photoId }: { placeId: string; photoId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Report this photo"
        onClick={() => setOpen(true)}
        className="inline-flex size-9 items-center justify-center rounded-full bg-background/90 shadow-sm"
      >
        <Flag className="size-4" aria-hidden="true" />
      </button>
      {open ? (
        <Suspense fallback={null}>
          <ReportDialog placeId={placeId} facts={[]} open={open} onOpenChange={setOpen} photoId={photoId} />
        </Suspense>
      ) : null}
    </>
  );
}
