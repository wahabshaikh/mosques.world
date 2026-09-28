"use client";

import { MapPin, Search } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { track } from "@/lib/analytics";
import type { NearbyPlace } from "@/lib/places/create";
import type { PlaceDetails, PlaceSuggestion } from "@/lib/places/google";
import { AMENITIES, IQAMAH_PRAYERS } from "@/lib/trust/facts";
import { cn } from "@/lib/utils";

const PinMap = lazy(() => import("./pin-map"));

type Kind = "mosque" | "prayer_room" | "musalla" | "eidgah";
const KINDS: Array<[Kind, string]> = [
  ["mosque", "Mosque"],
  ["prayer_room", "Prayer room"],
  ["musalla", "Musalla"],
  ["eidgah", "Eidgah"],
];

type Draft = {
  name: string;
  kind: Kind;
  lat: number;
  lng: number;
  address: string;
  locality: string | null;
  region: string | null;
  country: string | null;
  accessNotes: string;
  googlePlaceId: string | null;
};

async function json<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

export function AddPlace({ initialCenter }: { initialCenter: { lat: number; lng: number } }) {
  const session = useRef(crypto.randomUUID());
  const started = useRef(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [duplicates, setDuplicates] = useState<NearbyPlace[] | null>(null);
  const [cleared, setCleared] = useState(false);
  const [iqamah, setIqamah] = useState<Record<string, string>>({});
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = () => {
    if (started.current) return;
    started.current = true;
    track("place_add_started", {});
  };

  async function search(text: string) {
    begin();
    setQuery(text);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const response = await fetch(`/api/v1/places/lookup?q=${encodeURIComponent(text)}&session=${session.current}`);
    const body = await json<{ suggestions: PlaceSuggestion[]; available?: boolean }>(response);
    if (!response.ok) {
      setSearchNote(body.error ?? "Search is unavailable. Add the place on the map instead.");
      return;
    }
    setSearchNote(body.available === false ? "Place search isn't available here. Add the place on the map instead." : null);
    setSuggestions(body.suggestions ?? []);
  }

  async function checkDuplicates(next: Draft) {
    const response = await fetch("/api/v1/places/duplicates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat: next.lat, lng: next.lng, name: next.name }),
    });
    const body = await json<{ places: NearbyPlace[] }>(response);
    const places = response.ok ? (body.places ?? []) : [];
    setDuplicates(places);
    setCleared(places.length === 0);
    if (places.length > 0) track("duplicate_detected", { count: places.length });
  }

  async function choose(item: PlaceSuggestion) {
    setSuggestions([]);
    const response = await fetch(`/api/v1/places/lookup/details?id=${encodeURIComponent(item.placeId)}&session=${session.current}`);
    session.current = crypto.randomUUID();
    const body = await json<{ details: PlaceDetails }>(response);
    if (!response.ok || !body.details) {
      setSearchNote(body.error ?? "That place could not be loaded.");
      return;
    }
    const details = body.details;
    const next: Draft = {
      name: details.name,
      kind: /prayer room|musalla/i.test(details.name) ? "prayer_room" : "mosque",
      lat: details.lat,
      lng: details.lng,
      address: details.address ?? "",
      locality: details.locality,
      region: details.region,
      country: details.country,
      accessNotes: "",
      googlePlaceId: details.placeId,
    };
    setDraft(next);
    await checkDuplicates(next);
  }

  function manual() {
    begin();
    const next: Draft = {
      name: query.trim(),
      kind: "mosque",
      lat: initialCenter.lat,
      lng: initialCenter.lng,
      address: "",
      locality: null,
      region: null,
      country: null,
      accessNotes: "",
      googlePlaceId: null,
    };
    setDraft(next);
    setDuplicates(null);
    setCleared(false);
  }

  async function submit() {
    if (!draft) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/v1/places", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...draft,
        iqamah,
        amenities,
        notDuplicateOf: (duplicates ?? []).map((place) => place.id),
      }),
    });
    const body = await json<{ slug: string; status: string }>(response);
    if (!response.ok) {
      setPending(false);
      setError(body.error ?? "Could not add the place.");
      return;
    }
    track("place_added", { kind: draft.kind, country: draft.country ?? "" });
    window.location.assign(`/m/${body.slug}?added=1`);
  }

  const update = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  return (
    <div className="mt-8 flex flex-col gap-8">
      <section aria-labelledby="find">
        <h2 id="find" className="text-lg font-bold">
          1. Find it
        </h2>
        <div className="relative mt-3">
          <label className="flex items-center gap-2 rounded-[12px] border border-input px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search for the place</span>
            <input
              value={query}
              onChange={(event) => void search(event.target.value)}
              placeholder="Mosque name or address"
              className="h-12 min-w-0 flex-1 bg-transparent outline-none"
              autoComplete="off"
            />
          </label>
          {suggestions.length > 0 ? (
            <ul className="absolute top-full right-0 left-0 z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-lg" aria-label="Places">
              {suggestions.map((item) => (
                <li key={item.placeId}>
                  <button type="button" className="flex w-full flex-col px-4 py-3 text-start hover:bg-muted" onClick={() => void choose(item)}>
                    <span className="text-sm font-semibold">{item.label}</span>
                    {item.secondary ? <span className="text-xs text-muted-foreground">{item.secondary}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {searchNote ? <p className="mt-2 text-sm text-muted-foreground">{searchNote}</p> : null}
        <button type="button" className="mt-3 text-sm font-semibold underline" onClick={manual}>
          Can&apos;t find it? Add it on the map
        </button>
      </section>

      {draft && duplicates && duplicates.length > 0 && !cleared ? (
        <section aria-labelledby="dupes" className="rounded-2xl border border-warning/40 bg-warning-soft p-5" data-testid="duplicates">
          <h2 id="dupes" className="text-lg font-bold">
            Is it one of these?
          </h2>
          <p className="mt-1 text-sm">We already list these places within 150 m.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {duplicates.map((place) => (
              <li key={place.id} className="flex items-center justify-between gap-3 rounded-xl bg-background px-4 py-3 text-sm">
                <span>
                  <strong>{place.name}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {place.locality ?? ""} · {place.distanceM} m away
                  </span>
                </span>
                <a href={`/m/${place.slug}`} className="font-semibold underline">
                  Yes, it&apos;s this one
                </a>
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" className="mt-4" onClick={() => setCleared(true)}>
            It&apos;s new
          </Button>
        </section>
      ) : null}

      {draft && (cleared || duplicates === null) ? (
        <>
          <section aria-labelledby="details" className="flex flex-col gap-4">
            <h2 id="details" className="text-lg font-bold">
              2. Confirm details
            </h2>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Name
              <Input value={draft.name} onChange={(event) => update({ name: event.target.value })} required maxLength={120} />
            </label>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Type</legend>
              <div className="grid grid-cols-2 overflow-hidden rounded-[12px] border border-border-strong sm:grid-cols-4">
                {KINDS.map(([value, label], index) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={draft.kind === value}
                    onClick={() => update({ kind: value })}
                    className={cn("py-3 text-sm font-semibold", index > 0 && "border-s border-border-strong", draft.kind === value && "bg-secondary text-secondary-foreground")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4" aria-hidden="true" /> Drag the pin to the entrance
              </p>
              <Suspense fallback={<div className="h-72 rounded-2xl bg-muted" />}>
                <PinMap lat={draft.lat} lng={draft.lng} onChange={(lat, lng) => update({ lat, lng })} />
              </Suspense>
              <p className="mt-1 text-xs text-muted-foreground tabular">
                {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
              </p>
              {duplicates === null ? (
                <Button type="button" variant="outline" size="sm" className="mt-2" disabled={draft.name.trim().length < 2} onClick={() => void checkDuplicates(draft)}>
                  Check for duplicates here
                </Button>
              ) : null}
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Address
              <Input value={draft.address} onChange={(event) => update({ address: event.target.value })} maxLength={200} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Access notes <span className="font-normal text-muted-foreground">e.g. &ldquo;inside Terminal 5, airside&rdquo;</span>
              <Input value={draft.accessNotes} onChange={(event) => update({ accessNotes: event.target.value })} maxLength={200} />
            </label>
          </section>

          {cleared ? (
            <>
              <section aria-labelledby="optional" className="flex flex-col gap-4">
                <h2 id="optional" className="text-lg font-bold">
                  3. Optional: times and facilities
                </h2>
                <p className="text-sm text-muted-foreground">Only add what you&apos;ve seen yourself. You can add photos on the next page.</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {IQAMAH_PRAYERS.map((prayer) => (
                    <label key={prayer} className="flex flex-col gap-1 text-sm font-semibold capitalize">
                      {prayer} iqamah
                      <input
                        type="time"
                        value={iqamah[prayer] ?? ""}
                        onChange={(event) =>
                          setIqamah((all) => {
                            const next = { ...all };
                            if (event.target.value) next[prayer] = event.target.value;
                            else delete next[prayer];
                            return next;
                          })
                        }
                        className="h-11 rounded-[10px] border border-input bg-background px-2"
                      />
                    </label>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AMENITIES.map((amenity) => (
                    <div key={amenity.key} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                      <span>{amenity.label}</span>
                      <select
                        aria-label={amenity.label}
                        value={amenities[amenity.key] === undefined ? "" : amenities[amenity.key] ? "yes" : "no"}
                        onChange={(event) =>
                          setAmenities((all) => {
                            const next = { ...all };
                            if (event.target.value === "") delete next[amenity.key];
                            else next[amenity.key] = event.target.value === "yes";
                            return next;
                          })
                        }
                        className="h-9 rounded-[10px] border border-input bg-background px-2"
                      >
                        <option value="">Not sure</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                  ))}
                </div>
              </section>
              <section aria-labelledby="review" className="flex flex-col gap-3 border-t border-border pt-6">
                <h2 id="review" className="text-lg font-bold">
                  4. Review and add
                </h2>
                <p className="text-sm">
                  <strong>{draft.name || "Unnamed place"}</strong> · {KINDS.find(([value]) => value === draft.kind)?.[1]}
                  {draft.address ? ` · ${draft.address}` : ""} · {Object.keys(iqamah).length} times · {Object.keys(amenities).length} facilities
                </p>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button type="button" variant="secondary" className="self-start" disabled={pending || draft.name.trim().length < 2} onClick={() => void submit()}>
                  {pending ? "Adding…" : "Add this place"}
                </Button>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
