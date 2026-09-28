"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

const ROLES = [
  ["imam", "Imam"],
  ["committee", "Committee member"],
  ["volunteer", "Regular volunteer"],
  ["staff", "Staff"],
  ["other", "Other"],
] as const;

export function StewardRequestForm({ placeId, placeName }: { placeId: string; placeName: string }) {
  const [role, setRole] = useState<string>("committee");
  const [evidence, setEvidence] = useState("");
  const [contact, setContact] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sent) {
    return (
      <p role="status" className="rounded-2xl bg-primary-soft p-5 font-semibold text-primary">
        Thank you. A moderator will review your request and let you know.
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const response = await fetch(`/api/v1/places/${placeId}/steward`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role, evidence, contact: contact || undefined }),
        });
        setPending(false);
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          setError(body?.error ?? "Could not send your request.");
          return;
        }
        track("steward_requested");
        setSent(true);
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Your role at {placeName}</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 rounded-full border border-input px-4 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:font-semibold">
              <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="accent-primary" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        How are you involved?
        <textarea
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          rows={4}
          minLength={20}
          maxLength={1000}
          required
          placeholder="e.g. I'm on the committee and set the iqamah timetable each month."
          className="rounded-[10px] border border-input bg-background p-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        How can a moderator check? (optional)
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          maxLength={200}
          placeholder="The mosque's phone or email, or a page that lists you"
          className="h-11 rounded-[10px] border border-input bg-background px-3 font-normal"
        />
        <span className="font-normal text-muted-foreground">Only moderators see this.</span>
      </label>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="h-12 self-start rounded-[12px] px-6 font-bold">
        {pending ? "Sending…" : "Ask to look after this mosque"}
      </Button>
    </form>
  );
}

/** One-click confirm on the steward dashboard: a normal vote, which carries the steward's +2. */
export function StewardConfirm({ candidateId, label, factKey, primary = true }: { candidateId: string; label: string; factKey: string; primary?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? "default" : "outline"}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const response = await fetch("/api/v1/votes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateId, polarity: 1, source: "imam" }),
        });
        setPending(false);
        const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
        if (!response.ok) {
          toast.error(body?.error ?? "Could not confirm.");
          return;
        }
        track("vote_cast", { polarity: 1, fact_key: factKey, steward: true });
        toast.success(body?.message ?? "Confirmed.");
        router.refresh();
      }}
    >
      {label}
    </Button>
  );
}
