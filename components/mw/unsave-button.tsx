"use client";

import { BookmarkX } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function UnsaveButton({ placeId, name }: { placeId: string; name: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={`Remove ${name} from Saved`}
      className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted"
      onClick={async () => {
        const response = await fetch("/api/v1/saved", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ placeId }),
        });
        if (!response.ok) {
          toast.error("Could not remove it.");
          return;
        }
        toast.success("Removed from Saved.");
        router.refresh();
      }}
    >
      <BookmarkX className="size-4" aria-hidden="true" />
    </button>
  );
}
