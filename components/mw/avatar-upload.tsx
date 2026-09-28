"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { uploadPhoto } from "./photo-upload-dialog";

export function AvatarUpload({ avatarKey, initials, color }: { avatarKey: string | null; initials: string; color: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <div className="mb-6 flex items-center gap-4">
      {avatarKey ? (
        <img src={`/media/${avatarKey}/400.webp`} alt="Your profile photo" className="size-16 rounded-full object-cover" />
      ) : (
        <span className="flex size-16 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: color }}>
          {initials}
        </span>
      )}
      <label className="cursor-pointer rounded-[10px] border border-foreground px-3.5 py-2 text-sm font-semibold">
        {pending ? "Uploading…" : "Change profile photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          disabled={pending}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setPending(true);
            const result = await uploadPhoto({ file, placeId: null, purpose: "avatar", category: "other" });
            setPending(false);
            if (!result.ok) {
              toast.error(result.error ?? "Could not upload that photo.");
              return;
            }
            toast.success(result.status === "approved" ? "Profile photo updated" : "Thanks! Your photo will show after a quick review.");
            router.refresh();
          }}
        />
      </label>
    </div>
  );
}
