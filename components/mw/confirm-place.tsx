"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ConfirmPlace({ placeId }: { placeId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const response = await fetch(`/api/v1/places/${placeId}/confirm`, { method: "POST" });
        setPending(false);
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          toast.error(body?.error ?? "Could not confirm.");
          return;
        }
        toast.success("Thanks! The place is now public.");
        router.refresh();
      }}
    >
      Confirm it exists
    </Button>
  );
}
