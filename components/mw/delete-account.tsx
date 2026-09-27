"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DeleteAccount() {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <section className="mt-10 rounded-2xl border border-destructive/40 p-5">
      <h2 className="text-xl font-bold">Delete account</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        We delete your email, name and profile. Times you added or confirmed stay on the site as contributions from a
        &ldquo;former member&rdquo;, so the history of each mosque remains consistent. This cannot be undone.
      </p>
      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          const response = await fetch("/api/v1/account/delete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirm }),
          });
          if (!response.ok) {
            setPending(false);
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            setError(body?.error ?? "Could not delete your account.");
            return;
          }
          window.location.assign("/?deleted=1");
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Type delete to confirm</span>
          <Input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder='Type "delete"' />
        </label>
        <Button type="submit" className="bg-destructive text-white" disabled={pending || confirm !== "delete"}>
          Delete my account
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
