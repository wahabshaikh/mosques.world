"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { asTrustLevel, confirmationsNeeded, shouldHold, voteWeight, type FactState } from "@/lib/trust/engine";
import { canonicalJson, formatTime12, fromMinutes, iqamahValue, jumuahValue, languageName, ordinal, resolveIqamah, toMinutes, type VoteSource } from "@/lib/trust/facts";
import { cn } from "@/lib/utils";
import { TimeStepper } from "./time-stepper";

export type CurrentValue = { candidateId: string; value: unknown; score: number; state: FactState; backers: number };

export type UpdateData = {
  placeId: string;
  slug: string;
  placeName: string;
  today: string;
  tomorrow: string;
  defaultFrom: string;
  trustLevel: number;
  prayers: Array<{ key: string; label: string; adhan: string; current: CurrentValue | null }>;
  jumuah: Array<{ qualifier: string; current: CurrentValue | null }>;
  dhuhrAdhan: string;
};

const SOURCES: Array<{ value: VoteSource; label: string }> = [
  { value: "board", label: "Timetable board" },
  { value: "announcement", label: "Mosque announcement" },
  { value: "imam", label: "Asked the imam or committee" },
  { value: "website", label: "Mosque website or socials" },
];

const LANGUAGES = ["en", "ar", "ur", "bn", "tr", "fr", "id", "ms", "so", "de"];

type Row = { set: boolean; mode: "clock" | "offset"; clock: number; offset: number };
type JumuahRow = { qualifier: string; time: number; khutbah: number | null; lang: string[]; current: CurrentValue | null; removed: boolean };

function rowFromCurrent(current: CurrentValue | null, adhan: string): Row {
  const parsed = current ? iqamahValue.safeParse(current.value) : null;
  if (parsed?.success) {
    if ("t" in parsed.data) return { set: true, mode: "clock", clock: toMinutes(parsed.data.t), offset: 5 };
    return { set: true, mode: "offset", clock: toMinutes(adhan) + parsed.data.min, offset: parsed.data.min };
  }
  const suggestion = Math.ceil((toMinutes(adhan) + 15) / 5) * 5;
  return { set: false, mode: "clock", clock: suggestion, offset: 5 };
}

function rowValue(row: Row): unknown {
  return row.mode === "clock" ? { t: fromMinutes(row.clock) } : { rule: "after_adhan", min: row.offset };
}

function jumuahValueOf(row: JumuahRow): unknown {
  return {
    t: fromMinutes(row.time),
    ...(row.khutbah !== null ? { khutbah: fromMinutes(row.khutbah) } : {}),
    ...(row.lang.length ? { lang: row.lang } : {}),
  };
}

function initialJumuah(data: UpdateData): JumuahRow[] {
  return data.jumuah
    .map((item) => {
      const parsed = item.current ? jumuahValue.safeParse(item.current.value) : null;
      if (!parsed?.success) return null;
      return {
        qualifier: item.qualifier,
        time: toMinutes(parsed.data.t),
        khutbah: parsed.data.khutbah ? toMinutes(parsed.data.khutbah) : null,
        lang: parsed.data.lang ?? [],
        current: item.current,
        removed: false,
      };
    })
    .filter((row): row is JumuahRow => row !== null);
}

export function UpdateTimes({ data, onDone }: { data: UpdateData; onDone?: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<"iqamah" | "jumuah">("iqamah");
  const [from, setFrom] = useState(data.defaultFrom);
  const [source, setSource] = useState<VoteSource | null>(null);
  const initialRows = useMemo(() => Object.fromEntries(data.prayers.map((prayer) => [prayer.key, rowFromCurrent(prayer.current, prayer.adhan)])), [data]);
  const [rows, setRows] = useState<Record<string, Row>>(initialRows);
  const [jumuah, setJumuah] = useState<JumuahRow[]>(() => initialJumuah(data));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ label: string; status: string; message: string }> | null>(null);
  const level = asTrustLevel(data.trustLevel);

  const changes: Array<{ key: string; qualifier: string; value: unknown; current: CurrentValue | null; label: string }> = [];
  const confirms: string[] = [];
  for (const prayer of data.prayers) {
    const row = rows[prayer.key];
    if (!row) continue;
    const value = rowValue(row);
    if (prayer.current && canonicalJson(prayer.current.value) === canonicalJson(value)) {
      confirms.push(prayer.current.candidateId);
    } else if (row.set) {
      changes.push({ key: prayer.key, qualifier: "", value, current: prayer.current, label: prayer.label });
    }
  }
  for (const row of jumuah) {
    if (row.removed) continue;
    const value = jumuahValueOf(row);
    if (row.current && canonicalJson(row.current.value) === canonicalJson(value)) {
      confirms.push(row.current.candidateId);
    } else {
      changes.push({ key: "jumuah.jamaah", qualifier: row.qualifier, value, current: row.current, label: `Jumu'ah ${row.qualifier}` });
    }
  }

  const weight = voteWeight({ trustLevel: level, source: source ?? "other" });
  const helper = (() => {
    if (changes.length === 0) return confirms.length > 0 ? "Your confirmation keeps these times fresh" : "Set at least one time";
    if (changes.some((change) => change.current && shouldHold({ trustLevel: level, currentState: change.current.state, currentConfirmations: change.current.backers }))) {
      return "A trusted member reviews changes to verified times from new accounts";
    }
    const needed = Math.max(
      0,
      ...changes.map((change) =>
        change.current
          ? confirmationsNeeded({ role: "challenger", score: weight, supporters: 1, currentScore: change.current.score })
          : confirmationsNeeded({ role: "first", score: weight, supporters: 1 }),
      ),
    );
    if (needed === 0) return "Goes live as soon as you submit";
    return `Goes live after ${needed} more ${needed === 1 ? "person confirms" : "people confirm"}`;
  })();

  const submitLabel = changes.length === 0 ? "Confirm times are correct" : `Submit ${changes.length} ${changes.length === 1 ? "change" : "changes"}`;

  async function submit() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/v1/places/${data.placeId}/contributions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        effectiveFrom: from,
        source: source ?? "other",
        changes: changes.map(({ key, qualifier, value }) => ({ key, qualifier, value })),
        confirms,
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; results?: Array<{ label: string; status: string; message: string }> } | null;
    setPending(false);
    if (!response.ok) {
      setError(body?.error ?? "Could not save those times.");
      return;
    }
    track("contribution_submitted", { changed_count: changes.length });
    setResults(body?.results ?? []);
    router.refresh();
  }

  if (results) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h3 className="text-lg font-bold">JazakAllahu khayran</h3>
        <ul className="flex flex-col gap-2" data-testid="update-results">
          {results.map((result, index) => (
            <li key={index} className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase",
                  result.status === "live" ? "bg-primary-soft text-primary" : result.status === "held" ? "bg-warning-soft text-warning" : "bg-muted",
                )}
              >
                {result.status === "live" ? "Live" : result.status === "held" ? "In review" : "Pending"}
              </span>
              <span>{result.message}</span>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (onDone) onDone();
            else router.push(`/m/${data.slug}`);
          }}
        >
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="What to update" className="flex shrink-0 gap-2 px-6 pt-4">
        {(
          [
            ["iqamah", "Iqamah times"],
            ["jumuah", "Jumu'ah"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={cn("rounded-full px-4 py-2.5 text-sm font-bold", tab === value ? "bg-secondary text-secondary-foreground" : "bg-muted")}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-5 pb-6">
        <label className="flex items-center justify-between gap-3 rounded-[12px] border border-input px-4 py-3">
          <span className="flex flex-col">
            <span className="text-xs font-extrabold tracking-wide">APPLIES FROM</span>
            <span className="text-sm text-muted-foreground">{from === data.today ? "Today" : from === data.tomorrow ? "Tomorrow" : "Chosen date"}</span>
          </span>
          <input
            type="date"
            aria-label="Applies from"
            value={from}
            min={data.today}
            onChange={(event) => setFrom(event.target.value || data.tomorrow)}
            className="rounded-[10px] border border-input bg-background px-2 py-1.5"
          />
        </label>

        {tab === "iqamah" ? (
          <ul className="flex flex-col" aria-label="Iqamah times">
            {data.prayers.map((prayer) => {
              const row = rows[prayer.key];
              if (!row) return null;
              const set = (next: Partial<Row>) => setRows((current) => ({ ...current, [prayer.key]: { ...row, ...next, set: true } }));
              const value = rowValue(row);
              const changed = row.set && (!prayer.current || canonicalJson(prayer.current.value) !== canonicalJson(value));
              const was = prayer.current ? iqamahValue.safeParse(prayer.current.value) : null;
              return (
                <li key={prayer.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-3.5" data-row={prayer.key}>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-base font-bold">
                      {prayer.label}
                      {changed && was?.success ? (
                        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-extrabold text-warning">
                          was {formatTime12(resolveIqamah(was.data, prayer.adhan))}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      Adhan {formatTime12(prayer.adhan)} ·{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => set(row.mode === "clock" ? { mode: "offset", offset: Math.max(0, row.clock - toMinutes(prayer.adhan)) || 5 } : { mode: "clock" })}
                      >
                        {row.mode === "clock" ? "Use minutes after adhan" : "Use a fixed time"}
                      </button>
                    </span>
                  </span>
                  {row.set ? (
                    row.mode === "clock" ? (
                      <TimeStepper label={`${prayer.label} iqamah`} value={row.clock} onChange={(clock) => set({ clock })} />
                    ) : (
                      <TimeStepper label={`${prayer.label} minutes after adhan`} mode="offset" min={0} max={90} value={row.offset} onChange={(offset) => set({ offset })} />
                    )
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => set({})}>
                      <Plus className="size-4" /> Add {prayer.label}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col gap-4">
            {jumuah.filter((row) => !row.removed).length === 0 ? (
              <p className="text-sm text-muted-foreground">No Jumu&apos;ah times yet. Add each jamā&apos;ah the mosque holds.</p>
            ) : null}
            {jumuah.map((row, index) =>
              row.removed ? null : (
                <div key={row.qualifier} className="flex flex-col gap-3 rounded-[14px] border border-input p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold tracking-wide text-muted-foreground">{ordinal(Number(row.qualifier)).toUpperCase()} JAMĀ&apos;AH</span>
                    {!row.current ? (
                      <button type="button" aria-label={`Remove jamā'ah ${row.qualifier}`} onClick={() => setJumuah((all) => all.map((item, i) => (i === index ? { ...item, removed: true } : item)))}>
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">Salah</span>
                    <TimeStepper label={`Jumu'ah ${row.qualifier} salah`} value={row.time} onChange={(time) => setJumuah((all) => all.map((item, i) => (i === index ? { ...item, time } : item)))} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={row.khutbah !== null}
                        onChange={(event) =>
                          setJumuah((all) => all.map((item, i) => (i === index ? { ...item, khutbah: event.target.checked ? item.time - 20 : null } : item)))
                        }
                      />
                      Khutbah time
                    </label>
                    {row.khutbah !== null ? (
                      <TimeStepper label={`Jumu'ah ${row.qualifier} khutbah`} value={row.khutbah} onChange={(khutbah) => setJumuah((all) => all.map((item, i) => (i === index ? { ...item, khutbah } : item)))} />
                    ) : null}
                  </div>
                  <fieldset className="flex flex-wrap gap-2">
                    <legend className="mb-2 text-sm font-semibold">Khutbah language</legend>
                    {LANGUAGES.map((code) => {
                      const on = row.lang.includes(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          aria-pressed={on}
                          className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", on ? "border-foreground bg-muted" : "border-border-strong")}
                          onClick={() =>
                            setJumuah((all) =>
                              all.map((item, i) =>
                                i === index ? { ...item, lang: on ? item.lang.filter((lang) => lang !== code) : [...item.lang, code].slice(0, 4) } : item,
                              ),
                            )
                          }
                        >
                          {languageName(code)}
                        </button>
                      );
                    })}
                  </fieldset>
                </div>
              ),
            )}
            {jumuah.length < 6 ? (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => {
                  const last = jumuah.filter((row) => !row.removed).at(-1);
                  const base = last ? last.time + 45 : Math.ceil((toMinutes(data.dhuhrAdhan) + 15) / 5) * 5;
                  setJumuah((all) => [...all, { qualifier: String(all.length + 1), time: base, khutbah: null, lang: [], current: null, removed: false }]);
                }}
              >
                <Plus className="size-4" /> Add a jamā&apos;ah
              </Button>
            ) : null}
          </div>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-base font-bold">How do you know?</legend>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={source === item.value}
                className={cn(
                  "rounded-full px-3.5 py-2.5 text-sm font-semibold",
                  source === item.value ? "border-2 border-foreground bg-muted" : "border border-border-strong",
                )}
                onClick={() => setSource(source === item.value ? null : item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Only mark what you&apos;ve seen yourself.</p>
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
        <button
          type="button"
          className="px-1 py-2 text-[15px] font-bold underline"
          onClick={() => {
            setRows(initialRows);
            setJumuah(initialJumuah(data));
          }}
        >
          Reset
        </button>
        <span className="hidden max-w-[220px] text-right text-[13px] text-muted-foreground sm:block" data-testid="update-helper">
          {helper}
        </span>
        <Button type="button" variant="secondary" disabled={pending || changes.length + confirms.length === 0} onClick={() => void submit()}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
