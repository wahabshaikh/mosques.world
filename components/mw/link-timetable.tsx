"use client";

import { CalendarPlus, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Paste a mosque's Mawaqit or Masjidal link; the server checks it's this mosque and fetches the times. */
export function LinkTimetable({ placeId, labels }: { placeId: string; labels: { title: string; hint: string; button: string; linked: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" } | { kind: "error"; message: string }>({ kind: "idle" });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary underline" data-testid="link-timetable-open">
        <CalendarPlus className="size-4" aria-hidden="true" /> {labels.title}
      </button>
    );
  }
  return (
    <form
      className="mt-3 rounded-2xl bg-muted p-4"
      data-testid="link-timetable"
      onSubmit={async (event) => {
        event.preventDefault();
        setState({ kind: "busy" });
        const response = await fetch(`/api/v1/places/${placeId}/source`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        }).catch(() => null);
        const body = (await response?.json().catch(() => null)) as { error?: string } | null;
        if (!response?.ok) {
          setState({ kind: "error", message: body?.error ?? "That didn't work. Try again." });
          return;
        }
        setState({ kind: "done" });
        router.refresh();
      }}
    >
      <label className="block text-sm font-bold" htmlFor="timetable-url">
        {labels.title}
      </label>
      <p className="mt-1 text-xs text-muted-foreground">{labels.hint}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="timetable-url"
          type="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://mawaqit.net/en/your-mosque"
          className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm"
        />
        <button type="submit" disabled={state.kind === "busy"} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
          {state.kind === "busy" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {labels.button}
        </button>
      </div>
      {state.kind === "error" ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.kind === "done" ? (
        <p role="status" className="mt-2 text-sm font-semibold text-primary">
          {labels.linked}
        </p>
      ) : null}
    </form>
  );
}
