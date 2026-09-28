"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { uploadPhoto } from "./photo-upload-dialog";

const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
type Prayer = (typeof PRAYERS)[number];
type Row = { date: string } & Partial<Record<Prayer, string>>;
const LABELS: Record<Prayer, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

function days(month: string): string[] {
  const [year, index] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year ?? 2000, index ?? 1, 0)).getUTCDate();
  return Array.from({ length: count }, (_, day) => `${month}-${String(day + 1).padStart(2, "0")}`);
}

/** Photo → timetable (spec P7): upload, let the model read it, fix anything in the grid, then import. */
export function TimetableImport({ placeId, slug, initialMonth }: { placeId: string; slug: string; initialMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [step, setStep] = useState<"start" | "reading" | "review">("start");
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [grid, setGrid] = useState<Record<string, Partial<Record<Prayer, string>>>>({});
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dates = useMemo(() => days(month), [month]);
  const filled = dates.reduce((total, date) => total + PRAYERS.filter((prayer) => grid[date]?.[prayer]).length, 0);

  const read = async (file: File) => {
    setStep("reading");
    const uploaded = await uploadPhoto({ file, placeId, purpose: "evidence", category: "timetable" });
    if (!uploaded.ok || !uploaded.id) {
      toast.error(uploaded.error ?? "Could not upload that photo.");
      setStep("start");
      return;
    }
    setPhoto({ id: uploaded.id, url: URL.createObjectURL(file) });
    let rows: Row[] = [];
    let manual = true;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(`/api/v1/places/${placeId}/timetable/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoId: uploaded.id, month }),
      });
      if (response.status === 409) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }
      const body = (await response.json().catch(() => null)) as { rows?: Row[]; manual?: boolean } | null;
      rows = body?.rows ?? [];
      manual = body?.manual ?? rows.length === 0;
      break;
    }
    setGrid(Object.fromEntries(rows.map(({ date, ...times }) => [date, times])));
    setNote(manual ? "We couldn't read this photo automatically. Type the iqamah times from it below." : "Check each time against the photo, then import.");
    setStep("review");
  };

  return (
    <div className="flex flex-col gap-6">
      {step === "start" ? (
        <div className="flex flex-col gap-5">
          <label className="flex max-w-xs flex-col gap-1 text-sm font-semibold">
            Month
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-11 rounded-[10px] border border-input bg-background px-3 font-normal" />
          </label>
          <label className="flex max-w-md cursor-pointer flex-col items-start gap-2 rounded-2xl border border-dashed border-input p-6">
            <span className="inline-flex items-center gap-2 font-bold">
              <Camera className="size-5" aria-hidden="true" /> Photo of the timetable board
            </span>
            <span className="text-sm text-muted-foreground">We read the iqamah times for you. Location data is removed from the photo.</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Timetable photo"
              className="text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void read(file);
              }}
            />
          </label>
          <button type="button" className="self-start text-sm font-semibold underline" onClick={() => {
            setNote("Type the iqamah times for each day.");
            setStep("review");
          }}>
            No photo? Type the times in
          </button>
        </div>
      ) : null}
      {step === "reading" ? (
        <p role="status" className="rounded-2xl bg-muted p-5 font-semibold">
          Reading the timetable…
        </p>
      ) : null}
      {step === "review" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const rows = dates
              .map((date) => ({ date, ...Object.fromEntries(PRAYERS.filter((prayer) => grid[date]?.[prayer]).map((prayer) => [prayer, grid[date]?.[prayer]])) }))
              .filter((row) => Object.keys(row).length > 1);
            if (rows.length === 0) {
              toast.error("Add at least one time.");
              return;
            }
            setPending(true);
            const response = await fetch(`/api/v1/places/${placeId}/timetable`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ month, photoId: photo?.id, rows }),
            });
            setPending(false);
            const body = (await response.json().catch(() => null)) as { values?: number; error?: string } | null;
            if (!response.ok) {
              toast.error(body?.error ?? "Could not import the timetable.");
              return;
            }
            track("timetable_imported", { rows: body?.values ?? filled });
            toast.success(`Imported ${body?.values ?? filled} times. JazakAllahu khayran!`);
            router.push(`/m/${slug}/timetable?month=${month}`);
          }}
        >
          {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[560px] text-sm" data-testid="review-grid">
                <caption className="sr-only">Iqamah times to import for {month}</caption>
                <thead className="bg-muted text-xs text-muted-foreground uppercase">
                  <tr>
                    <th scope="col" className="px-2 py-2 text-left">
                      Day
                    </th>
                    {PRAYERS.map((prayer) => (
                      <th key={prayer} scope="col" className="px-2 py-2 text-left">
                        {LABELS[prayer]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((date) => (
                    <tr key={date} className="border-t border-border">
                      <th scope="row" className="px-2 py-1 text-left font-semibold">
                        {Number(date.slice(8))}
                      </th>
                      {PRAYERS.map((prayer) => (
                        <td key={prayer} className="px-1 py-1">
                          <input
                            type="time"
                            aria-label={`${LABELS[prayer]} on ${Number(date.slice(8))}`}
                            value={grid[date]?.[prayer] ?? ""}
                            onChange={(event) => setGrid((current) => ({ ...current, [date]: { ...current[date], [prayer]: event.target.value || undefined } }))}
                            className="h-9 w-full rounded-md border border-input bg-background px-1.5 tabular"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {photo ? (
              <img src={photo.url} alt="Your timetable photo" className="sticky top-24 w-full rounded-2xl border border-border" />
            ) : null}
          </div>
          <Button type="submit" disabled={pending || filled === 0} className="h-12 self-start rounded-[12px] px-6 font-bold">
            {pending ? "Importing…" : `Import ${filled} times`}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
