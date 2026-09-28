"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ApiKeyView } from "@/lib/api-keys";

function when(at: number | null) {
  return at ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never";
}

/** Create, copy (once) and revoke keys for the public read API (spec P8). */
export function ApiKeys({ initial }: { initial: ApiKeyView[] }) {
  const [keys, setKeys] = useState(initial);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          const response = await fetch("/api/v1/account/api-keys", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name }),
          }).catch(() => null);
          setPending(false);
          const body = (await response?.json().catch(() => null)) as { key?: string; view?: ApiKeyView; error?: string } | null;
          if (!response?.ok || !body?.key || !body.view) {
            toast.error(body?.error ?? "Could not create a key.");
            return;
          }
          setCreated(body.key);
          setKeys((current) => [body.view as ApiKeyView, ...current]);
          setName("");
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
          Key name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            placeholder="e.g. Masjid display screen"
            className="h-11 rounded-[12px] border border-input bg-background px-3 font-normal"
          />
        </label>
        <Button type="submit" disabled={pending}>
          Create key
        </Button>
      </form>

      {created ? (
        <div role="status" className="rounded-2xl bg-primary-soft p-4 text-sm">
          <p className="font-semibold">Copy your key now. It won&apos;t be shown again.</p>
          <code className="mt-2 block rounded-lg bg-background px-3 py-2 font-mono text-[13px] break-all" data-testid="new-api-key">
            {created}
          </code>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => void navigator.clipboard?.writeText(created).then(() => toast.success("Key copied"))}
          >
            Copy
          </Button>
        </div>
      ) : null}

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No keys yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center gap-3 p-4" data-api-key={key.id}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{key.name}</span>
                <span className="text-sm text-muted-foreground">
                  <code>{key.prefix}…</code> · created {when(key.createdAt)} · last used {when(key.lastUsedAt)}
                </span>
              </span>
              {key.revokedAt ? (
                <span className="text-sm text-muted-foreground">Revoked</span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const response = await fetch(`/api/v1/account/api-keys/${key.id}`, { method: "DELETE" }).catch(() => null);
                    if (!response?.ok) {
                      toast.error("Could not revoke the key.");
                      return;
                    }
                    setKeys((current) => current.map((item) => (item.id === key.id ? { ...item, revokedAt: Date.now() } : item)));
                    toast.success("Key revoked");
                  }}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
