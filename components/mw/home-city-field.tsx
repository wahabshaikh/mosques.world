"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export type HomeCity = { label: string; country: string | null };

/** Optional home city, stored only as a label and country (spec 4.3 onboarding). */
export function HomeCityField({ value, onChange }: { value: HomeCity | null; onChange: (value: HomeCity | null) => void }) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [suggestions, setSuggestions] = useState<Array<{ label: string; country?: string | null }>>([]);
  const latest = useRef("");

  async function search(text: string) {
    latest.current = text;
    setQuery(text);
    onChange(text.trim() ? { label: text.trim().slice(0, 80), country: null } : null);
    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const response = await fetch(`/api/v1/geocode/autocomplete?q=${encodeURIComponent(text)}&cities=1`).catch(() => null);
    if (!response?.ok || latest.current !== text) return;
    const body = (await response.json()) as { suggestions: Array<{ label: string; kind?: string; country?: string | null }> };
    setSuggestions(body.suggestions.filter((item) => item.kind !== "place").slice(0, 5));
  }

  return (
    <div className="relative mt-5 flex flex-col gap-2">
      <label htmlFor="home-city" className="text-sm font-semibold">
        Home city <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <Input id="home-city" value={query} onChange={(event) => void search(event.target.value)} autoComplete="off" placeholder="e.g. London" />
      {suggestions.length > 0 ? (
        <ul className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-2xl border border-border bg-popover shadow-lg">
          {suggestions.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                className="block w-full px-4 py-3 text-start text-sm hover:bg-muted"
                onClick={() => {
                  setQuery(item.label);
                  onChange({ label: item.label, country: item.country ?? null });
                  setSuggestions([]);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
