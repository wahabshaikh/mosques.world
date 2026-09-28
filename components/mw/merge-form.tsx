"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MergeForm() {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!window.confirm("Merge these places? The duplicate's times, votes and photos move over and its link redirects.")) return;
        setPending(true);
        const response = await fetch("/api/v1/admin/places/merge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source, target }),
        });
        setPending(false);
        const body = (await response.json().catch(() => null)) as { error?: string; targetSlug?: string } | null;
        if (!response.ok) {
          toast.error(body?.error ?? "Could not merge.");
          return;
        }
        toast.success(`Merged into /m/${body?.targetSlug}`);
        setSource("");
        setTarget("");
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Duplicate (goes away)
        <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="slug or /m/ link" required />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Place that stays
        <Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="slug or /m/ link" required />
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>
        Merge
      </Button>
    </form>
  );
}
