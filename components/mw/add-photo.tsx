"use client";

import { ImagePlus } from "lucide-react";
import { lazy, Suspense, useState } from "react";

const PhotoUploadDialog = lazy(() => import("./photo-upload-dialog"));

export function AddPhotoButton({ placeId, label, turnstileSiteKey }: { placeId: string; label: string; turnstileSiteKey?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-foreground bg-background px-3.5 text-sm font-semibold"
      >
        <ImagePlus className="size-4" aria-hidden="true" /> {label}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <PhotoUploadDialog placeId={placeId} open={open} onOpenChange={setOpen} turnstileSiteKey={turnstileSiteKey} />
        </Suspense>
      ) : null}
    </>
  );
}
