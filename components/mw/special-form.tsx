"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Kind = "eid_fitr" | "eid_adha" | "taraweeh" | "tahajjud";
const KINDS: Array<[Kind, string]> = [
  ["eid_fitr", "Eid al-Fitr"],
  ["eid_adha", "Eid al-Adha"],
  ["taraweeh", "Taraweeh"],
  ["tahajjud", "Tahajjud"],
];
const field = "h-11 rounded-[10px] border border-input bg-background px-3 font-normal";

export function SpecialForm({ placeId, slug, today }: { placeId: string; slug: string; today: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("eid_fitr");
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [start, setStart] = useState("21:30");
  const [rakahs, setRakahs] = useState("8");
  const [jamaahs, setJamaahs] = useState([{ time: "07:30", location: "", language: "" }]);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const eid = kind === "eid_fitr" || kind === "eid_adha";
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const body = eid
          ? {
              kind,
              date,
              jamaahs: jamaahs.map((item) => ({ time: item.time, location: item.location || undefined, language: item.language || undefined })),
              notes: notes || undefined,
            }
          : { kind, date, endDate, start, rakahs: Number(rakahs) || undefined, notes: notes || undefined };
        const response = await fetch(`/api/v1/places/${placeId}/special`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        setPending(false);
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          toast.error(result?.error ?? "Could not save that.");
          return;
        }
        toast.success("Added. JazakAllahu khayran!");
        router.push(`/m/${slug}#special`);
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Which prayer?</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 rounded-full border border-input px-4 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:font-semibold">
              <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="accent-primary" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {eid ? "Date" : "First night"}
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={field} required />
        </label>
        {eid ? null : (
          <>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Last night
              <input type="date" value={endDate} min={date} onChange={(event) => setEndDate(event.target.value)} className={field} required />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Starts at
              <input type="time" value={start} onChange={(event) => setStart(event.target.value)} className={field} required />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Rakʿahs
              <select value={rakahs} onChange={(event) => setRakahs(event.target.value)} className={field}>
                <option value="8">8</option>
                <option value="20">20</option>
                <option value="">Not sure</option>
              </select>
            </label>
          </>
        )}
      </div>
      {eid ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-semibold">Jamā&apos;ahs</legend>
          {jamaahs.map((item, index) => (
            <div key={index} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Time
                <input
                  type="time"
                  value={item.time}
                  onChange={(event) => setJamaahs((list) => list.map((entry, at) => (at === index ? { ...entry, time: event.target.value } : entry)))}
                  className={field}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Where (optional)
                <input
                  value={item.location}
                  placeholder="e.g. Victoria Park"
                  maxLength={120}
                  onChange={(event) => setJamaahs((list) => list.map((entry, at) => (at === index ? { ...entry, location: event.target.value } : entry)))}
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Khutbah language (optional)
                <input
                  value={item.language}
                  maxLength={40}
                  onChange={(event) => setJamaahs((list) => list.map((entry, at) => (at === index ? { ...entry, language: event.target.value } : entry)))}
                  className={field}
                />
              </label>
              {jamaahs.length > 1 ? (
                <button type="button" aria-label={`Remove jamā'ah ${index + 1}`} className="flex size-11 items-center justify-center rounded-full hover:bg-muted" onClick={() => setJamaahs((list) => list.filter((_, at) => at !== index))}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
          {jamaahs.length < 6 ? (
            <button type="button" className="inline-flex items-center gap-1.5 self-start text-sm font-semibold underline" onClick={() => setJamaahs((list) => [...list, { time: "09:00", location: "", language: "" }])}>
              <Plus className="size-4" aria-hidden="true" /> Add another jamā&apos;ah
            </button>
          ) : null}
        </fieldset>
      ) : null}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Notes (optional)
        <input value={notes} maxLength={300} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Sisters' entrance on the side road" className={field} />
      </label>
      <Button type="submit" disabled={pending} className="h-12 self-start rounded-[12px] px-6 font-bold">
        {pending ? "Saving…" : "Add"}
      </Button>
    </form>
  );
}
