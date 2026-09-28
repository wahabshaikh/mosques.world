"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { track } from "@/lib/analytics";
import { PHOTO_CATEGORIES } from "@/lib/photos";
import { useTurnstile } from "./turnstile";

export async function uploadPhoto(input: { file: File; placeId: string | null; purpose: string; category: string; turnstile?: string | null }) {
  const form = new FormData();
  form.set("file", input.file);
  form.set("purpose", input.purpose);
  form.set("category", input.category);
  if (input.placeId) form.set("placeId", input.placeId);
  if (input.turnstile) form.set("turnstile", input.turnstile);
  const response = await fetch("/api/v1/uploads", { method: "POST", body: form });
  const body = (await response.json().catch(() => null)) as { id?: string; status?: string; error?: string } | null;
  return { ok: response.ok, httpStatus: response.status, id: body?.id, status: body?.status, error: body?.error };
}

export default function PhotoUploadDialog({
  placeId,
  open,
  onOpenChange,
  turnstileSiteKey,
}: {
  placeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turnstileSiteKey?: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("exterior");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstile = useTurnstile(turnstileSiteKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 pt-16">
        <DialogTitle className="text-lg font-bold">Add a photo</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          Photos help people recognise the entrance and facilities. Location data is removed from every photo. Please don&apos;t photograph people.
        </DialogDescription>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!file) return;
            setPending(true);
            setError(null);
            const result = await uploadPhoto({ file, placeId, purpose: "place", category, turnstile: turnstileSiteKey ? await turnstile.token() : null });
            setPending(false);
            if (!result.ok) {
              setError(result.error ?? "Could not upload that photo.");
              turnstile.reset();
              return;
            }
            track("photo_uploaded", { category });
            toast.success(result.status === "approved" ? "Photo added. JazakAllahu khayran!" : "Thanks! Your photo will appear after a quick review.");
            onOpenChange(false);
            router.refresh();
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="text-sm font-normal"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            What does it show?
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 rounded-[12px] border border-input bg-background px-3 font-normal">
              {PHOTO_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div ref={turnstile.ref} />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={pending || !file}>
            {pending ? "Uploading…" : "Upload photo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
