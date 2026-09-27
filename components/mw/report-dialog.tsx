"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { track } from "@/lib/analytics";

/** Loaded on demand from ReportProblem so the mosque page does not ship the dialog up front. */
export default function ReportDialog({
  placeId,
  facts,
  open,
  onOpenChange,
}: {
  placeId: string;
  facts: Array<{ key: string; label: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [factKey, setFactKey] = useState(facts[0]?.key ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 pt-16">
        <DialogTitle className="text-lg font-bold">Report a timing problem</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          A moderator will look at it. If you know the new time, use Update timings instead so others can confirm it.
        </DialogDescription>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            const response = await fetch("/api/v1/reports", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ placeId, factKey: factKey || null, reason: "timing", note }),
            });
            setPending(false);
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            if (!response.ok) {
              setError(body?.error ?? "Could not send the report.");
              return;
            }
            track("report_created", { place_id: placeId });
            toast.success("Thanks, a moderator will take a look.");
            onOpenChange(false);
            setNote("");
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Which time?
            <select
              value={factKey}
              onChange={(event) => setFactKey(event.target.value)}
              className="h-11 rounded-[12px] border border-input bg-background px-3 font-normal"
            >
              {facts.map((fact) => (
                <option key={fact.key} value={fact.key}>
                  {fact.label}
                </option>
              ))}
              <option value="">Something else</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            What&apos;s wrong?
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={500}
              required
              className="rounded-[12px] border border-input bg-background px-3 py-2 font-normal"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={pending}>
            Send report
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
