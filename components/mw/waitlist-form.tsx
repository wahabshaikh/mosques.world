"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { useText } from "./text";

export function WaitlistForm({ placeId }: { placeId: string }) {
  const [email, setEmail] = useState("");
  const text = useText();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="mt-4 flex flex-col gap-2 sm:flex-row"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage(null);
        const response = await fetch("/api/v1/waitlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, placeId }),
        });
        setPending(false);
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setMessage(body?.error ?? "Could not save that email.");
          return;
        }
        track("waitlist_joined", { place_id: placeId });
        setMessage("Check your email to confirm.");
        setEmail("");
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={text("Email for iqamah updates")}
          className="h-11 w-full rounded-[12px] border border-input bg-background px-3"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {text("Get notified")}
      </Button>
      {message ? <p className="text-sm text-muted-foreground sm:basis-full">{message}</p> : null}
    </form>
  );
}
