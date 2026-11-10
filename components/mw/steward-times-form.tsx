"use client";

import { useState, type FormEvent } from "react";
import { track } from "@/lib/analytics";

type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
type Mode = "fixed" | "offset";

export type StewardPrayer = {
  key: PrayerKey;
  label: string;
  adhanLabel: string;
  on: boolean;
  mode: Mode;
  time: string;
  minutes: number;
};

export type StewardJumuah = { slot: number; time: string; khutbah: string };

/**
 * Committee form for the lobby's iqamah. A fixed clock time, or minutes after today's adhan,
 * plus Jumu'ah. Empty rows are left as they are.
 */
export function StewardTimesForm({ placeId, prayers, jumuah, lobbyHref }: { placeId: string; prayers: StewardPrayer[]; jumuah: StewardJumuah[]; lobbyHref: string }) {
  const [rows, setRows] = useState(prayers);
  const [friday, setFriday] = useState(jumuah);
  const [visible, setVisible] = useState(() => Math.max(3, jumuah.filter((row) => row.time).length));
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  function updatePrayer(key: PrayerKey, patch: Partial<StewardPrayer>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function updateJumuah(slot: number, patch: Partial<StewardJumuah>) {
    setFriday((current) => current.map((row) => (row.slot === slot ? { ...row, ...patch } : row)));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessages(null);
    const chosen = rows.filter((row) => row.on);
    for (const row of chosen) {
      if (row.mode === "fixed" && !row.time) {
        setError(`Enter a clock time for ${row.label}.`);
        return;
      }
      if (row.mode === "offset" && (row.minutes < 0 || row.minutes > 90)) {
        setError(`Minutes after adhan for ${row.label} have to be from 0 to 90.`);
        return;
      }
    }
    const jumuahRows = friday.filter((row) => row.slot <= visible && row.time);
    if (chosen.length + jumuahRows.length === 0) {
      setError("Set at least one time.");
      return;
    }
    setPending(true);
    const response = await fetch(`/api/v1/places/${placeId}/pro/times`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prayers: chosen.map((row) => (row.mode === "fixed" ? { prayer: row.key, mode: "fixed", time: row.time } : { prayer: row.key, mode: "offset", minutes: row.minutes })),
        jumuah: jumuahRows.map((row) => ({ slot: row.slot, time: row.time, khutbah: row.khutbah || null })),
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; results?: Array<{ message: string }> } | null;
    setPending(false);
    if (!response.ok) {
      setError(body?.error ?? "Those times could not be saved.");
      return;
    }
    track("pro_times_saved");
    setMessages(body?.results?.map((result) => result.message) ?? ["Saved."]);
  }

  return (
    <form className="mt-8 flex flex-col gap-8" onSubmit={(event) => void save(event)} data-testid="steward-times">
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        A fixed time stays on the clock. Minutes after adhan follow the adhan through the year. These are the mosque page&apos;s times, not a separate board, and they show who set them.
      </p>
      {error ? (
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <fieldset key={row.key} className="rounded-2xl border border-border p-4" data-testid={`prayer-${row.key}`}>
            <legend className="px-1 text-sm font-extrabold">
              {row.label}
              <span className="ms-2 font-semibold text-muted-foreground">Adhan {row.adhanLabel}</span>
            </legend>
            <label className="mt-2 flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={row.on} onChange={(event) => updatePrayer(row.key, { on: event.target.checked })} />
              Set this prayer
            </label>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name={`${row.key}-mode`} checked={row.mode === "fixed"} onChange={() => updatePrayer(row.key, { mode: "fixed", on: true })} />
                Fixed time
              </label>
              <label className="text-sm font-semibold">
                <span className="sr-only">{row.label} clock time</span>
                <input
                  type="time"
                  value={row.time}
                  aria-label={`${row.label} clock time`}
                  onChange={(event) => updatePrayer(row.key, { time: event.target.value, mode: "fixed", on: true })}
                  className="rounded-xl border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name={`${row.key}-mode`} checked={row.mode === "offset"} onChange={() => updatePrayer(row.key, { mode: "offset", on: true })} />
                Minutes after adhan
              </label>
              <label className="text-sm font-semibold">
                <span className="sr-only">{row.label} minutes after adhan</span>
                <input
                  type="number"
                  min={0}
                  max={90}
                  inputMode="numeric"
                  value={row.minutes}
                  aria-label={`${row.label} minutes after adhan`}
                  onChange={(event) => updatePrayer(row.key, { minutes: Number(event.target.value), mode: "offset", on: true })}
                  className="w-24 rounded-xl border border-input bg-background px-3 py-2"
                />
              </label>
            </div>
          </fieldset>
        ))}
      </div>

      <fieldset className="rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-extrabold">Jumu&apos;ah</legend>
        <div className="mt-3 flex flex-col gap-4">
          {friday
            .filter((row) => row.slot <= visible)
            .map((row) => (
              <div key={row.slot} className="flex flex-wrap items-end gap-4" data-testid={`jumuah-${row.slot}`}>
                <p className="w-full text-sm font-bold">Jamā&apos;ah {row.slot}</p>
                <label className="text-sm">
                  Iqamah
                  <input
                    type="time"
                    value={row.time}
                    aria-label={`Jumu'ah ${row.slot} iqamah`}
                    onChange={(event) => updateJumuah(row.slot, { time: event.target.value })}
                    className="mt-1 block rounded-xl border border-input bg-background px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  Khutbah
                  <input
                    type="time"
                    value={row.khutbah}
                    aria-label={`Jumu'ah ${row.slot} khutbah`}
                    onChange={(event) => updateJumuah(row.slot, { khutbah: event.target.value })}
                    className="mt-1 block rounded-xl border border-input bg-background px-3 py-2"
                  />
                </label>
              </div>
            ))}
        </div>
        {visible < friday.length ? (
          <button type="button" className="mt-4 text-sm font-bold underline" onClick={() => setVisible((count) => Math.min(friday.length, count + 1))}>
            Add another Jumu&apos;ah
          </button>
        ) : null}
      </fieldset>

      <button type="submit" className="h-11 w-fit rounded-full bg-secondary px-5 text-sm font-bold text-secondary-foreground" disabled={pending}>
        {pending ? "Saving…" : "Save times"}
      </button>
      {messages ? (
        <div role="status" className="text-sm font-semibold text-primary">
          {messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
          <p className="mt-2 font-bold">
            <a href={lobbyHref} className="underline">
              Open the lobby screen
            </a>
          </p>
        </div>
      ) : null}
    </form>
  );
}
