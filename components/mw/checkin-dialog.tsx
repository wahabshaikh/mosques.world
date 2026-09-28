"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { track } from "@/lib/analytics";
import { CHECKIN_PRAYER_LABELS, type CheckinPrayer } from "@/lib/checkin-options";
import { cn } from "@/lib/utils";
import { shareLink } from "./place-header-actions";

type Result = {
  ok?: boolean;
  error?: string;
  checkin?: { geoVerified: boolean };
  newCountry?: boolean;
  newCity?: boolean;
  badges?: Array<{ key: string; name: string }>;
  stats?: { places: number; countries: number };
};

function position(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (value) => resolve({ lat: value.coords.latitude, lng: value.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export default function CheckinDialog({
  placeId,
  placeName,
  defaultPrayer,
  jumuah,
  today,
  username,
  open,
  onOpenChange,
}: {
  placeId: string;
  placeName: string;
  defaultPrayer: CheckinPrayer;
  jumuah: boolean;
  today: string;
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [prayer, setPrayer] = useState<CheckinPrayer>(defaultPrayer);
  const [before, setBefore] = useState(false);
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [verify, setVerify] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prayers: CheckinPrayer[] = ["fajr", jumuah ? "jumuah" : "dhuhr", "asr", "maghrib", "isha"];
  const extras: CheckinPrayer[] = [jumuah ? "dhuhr" : "jumuah", "taraweeh", "eid", "other"];
  const canVerify = !before && date === today;

  const chip = (value: CheckinPrayer) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={prayer === value}
      onClick={() => setPrayer(value)}
      className={cn(
        "h-10 rounded-full border px-4 text-sm font-semibold",
        prayer === value ? "border-foreground bg-foreground text-background" : "border-border bg-card",
      )}
    >
      {CHECKIN_PRAYER_LABELS[value]}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 pt-16">
        <DialogTitle className="text-lg font-bold">I prayed here</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">Add {placeName} to your map.</DialogDescription>
        <form
          className="mt-4 flex flex-col gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            const location = verify && canVerify ? await position() : null;
            if (verify && canVerify && !location) toast.message("We couldn't get your location, so this check-in isn't location-verified.");
            const response = await fetch("/api/v1/checkins", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ placeId, prayer, ...(before ? { month } : { date }), ...(location ? { location } : {}) }),
            });
            const body = (await response.json().catch(() => null)) as Result | null;
            setPending(false);
            if (!response.ok || !body?.ok) {
              setError(body?.error ?? "Could not add that check-in.");
              return;
            }
            track("checkin_created", { geo_verified: Boolean(body.checkin?.geoVerified), prayer });
            onOpenChange(false);
            const profile = `/@${username}`;
            const share = () =>
              void shareLink({ title: "My mosques.world map", url: new URL(profile, window.location.origin).toString() }).then((channel) => {
                if (channel) track("profile_shared", { channel });
              });
            if (body.newCountry || body.newCity) {
              toast.success(body.newCountry ? "A new country on your map!" : "A new city on your map!", {
                description: body.stats ? `${body.stats.places} mosques · ${body.stats.countries} countries` : undefined,
                action: { label: "Share your map", onClick: share },
              });
            } else {
              toast.success("Added to your map. JazakAllahu khayran!", { action: { label: "See your map", onClick: () => router.push(profile) } });
            }
            for (const badge of body.badges ?? []) {
              track("badge_earned", { badge: badge.key });
              toast.success(`Badge earned: ${badge.name}`, { action: { label: "Share", onClick: share } });
            }
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Which prayer?</legend>
            <div role="radiogroup" aria-label="Prayer" className="flex flex-wrap gap-2">
              {prayers.map(chip)}
            </div>
            <div role="radiogroup" aria-label="Other prayers" className="flex flex-wrap gap-2">
              {extras.map(chip)}
            </div>
          </fieldset>

          {before ? (
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Month
              <input
                type="month"
                value={month}
                max={today.slice(0, 7)}
                onChange={(event) => setMonth(event.target.value)}
                className="h-11 rounded-[10px] border border-input bg-background px-3 font-normal"
                required
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Date
              <input
                type="date"
                value={date}
                max={today}
                onChange={(event) => setDate(event.target.value)}
                className="h-11 rounded-[10px] border border-input bg-background px-3 font-normal"
                required
              />
            </label>
          )}
          <button type="button" className="-mt-2 self-start text-sm font-semibold underline" onClick={() => setBefore((value) => !value)}>
            {before ? "I prayed here recently" : "I prayed here before (pick a month)"}
          </button>

          {canVerify ? (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={verify} onChange={(event) => setVerify(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="font-semibold">Use my location to verify</span>
                <span className="block text-muted-foreground">Checked once against the mosque&apos;s location. We never store where you are.</span>
              </span>
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="h-12 rounded-[12px] font-bold">
            {pending ? "Adding…" : "Add to my map"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
