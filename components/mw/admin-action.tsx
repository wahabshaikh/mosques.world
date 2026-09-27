"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AdminAction({
  url,
  body = {},
  label,
  done,
  variant = "outline",
  confirm,
}: {
  url: string;
  body?: unknown;
  label: string;
  done: string;
  variant?: "outline" | "secondary" | "default" | "warning";
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        setPending(true);
        const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        setPending(false);
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          toast.error(result?.error ?? "That did not work.");
          return;
        }
        toast.success(done);
        router.refresh();
      }}
    >
      {label}
    </Button>
  );
}

export function BanForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch(`/api/v1/admin/users/${userId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ban: { reason } }),
        });
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          toast.error(result?.error ?? "Could not suspend.");
          return;
        }
        toast.success("Suspended");
        setReason("");
        router.refresh();
      }}
    >
      <label className="sr-only" htmlFor={`ban-${userId}`}>
        Reason
      </label>
      <input
        id={`ban-${userId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason to suspend"
        className="h-9 w-40 rounded-[10px] border border-input bg-background px-2 text-sm"
        minLength={3}
        required
      />
      <Button type="submit" size="sm" variant="warning">
        Suspend
      </Button>
    </form>
  );
}
