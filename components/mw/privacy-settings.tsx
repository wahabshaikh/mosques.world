"use client";

import { MapPinCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CHECKIN_PRAYER_LABELS, type CheckinPrayer, type CheckinVisibility } from "@/lib/checkin-options";

const VISIBILITY: Array<{ value: CheckinVisibility; label: string; help: string }> = [
  { value: "public", label: "Public", help: "Your map shows every mosque you checked in at." },
  { value: "countries", label: "Countries only", help: "People see your counts and countries, not the mosques." },
  { value: "private", label: "Private", help: "Only you see your map and check-ins." },
];

export function PrivacyForm({ initial, username }: { initial: { profilePublic: boolean; checkinsVisibility: CheckinVisibility }; username: string }) {
  const router = useRouter();
  const [profilePublic, setProfilePublic] = useState(initial.profilePublic);
  const [visibility, setVisibility] = useState(initial.checkinsVisibility);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const response = await fetch("/api/v1/account/privacy", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profilePublic, checkinsVisibility: visibility }),
        });
        setPending(false);
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          toast.error(body?.error ?? "Could not save your privacy settings.");
          return;
        }
        toast.success("Privacy settings saved.");
        router.refresh();
      }}
    >
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={profilePublic} onChange={(event) => setProfilePublic(event.target.checked)} className="mt-1 size-4 accent-primary" />
        <span>
          <span className="font-semibold">Public profile</span>
          <span className="block text-sm text-muted-foreground">
            When off, <Link href={`/@${username}`} className="underline">mosques.world/@{username}</Link> shows only your name and contributions.
          </span>
        </span>
      </label>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Who can see your check-ins</legend>
        {VISIBILITY.map((option) => (
          <label key={option.value} className="flex items-start gap-3 rounded-2xl border border-input p-4 has-[:checked]:border-foreground">
            <input
              type="radio"
              name="checkins"
              value={option.value}
              checked={visibility === option.value}
              onChange={() => setVisibility(option.value)}
              className="mt-1 size-4 accent-primary"
            />
            <span>
              <span className="font-semibold">{option.label}</span>
              <span className="block text-sm text-muted-foreground">{option.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending} className="h-11 self-start rounded-[12px] px-5 font-bold">
        {pending ? "Saving…" : "Save privacy settings"}
      </Button>
    </form>
  );
}

type CheckinItem = { id: string; prayer: string; localDate: string; geoVerified: boolean; placeName: string; placeSlug: string; locality: string | null };

export function CheckinList({ checkins, more }: { checkins: CheckinItem[]; more: string | null }) {
  const router = useRouter();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const visible = checkins.filter((item) => !removed.has(item.id));
  if (visible.length === 0) return <p className="mt-4 text-sm text-muted-foreground">No check-ins yet. Tap “I prayed here” on a mosque page.</p>;
  return (
    <>
      <ul className="mt-4 flex flex-col">
        {visible.map((item) => (
          <li key={item.id} className="flex items-center gap-3 border-b border-border py-3" data-checkin={item.id}>
            <span className="flex min-w-0 flex-1 flex-col">
              <Link href={`/m/${item.placeSlug}`} className="truncate font-semibold hover:underline">
                {item.placeName}
              </Link>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {CHECKIN_PRAYER_LABELS[item.prayer as CheckinPrayer] ?? "Prayed"} · {item.localDate}
                {item.geoVerified ? (
                  <span className="inline-flex items-center gap-1 text-primary">
                    · <MapPinCheck className="size-3.5" aria-hidden="true" /> Location verified
                  </span>
                ) : null}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Delete check-in at ${item.placeName} on ${item.localDate}`}
              className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
              onClick={async () => {
                const response = await fetch(`/api/v1/checkins/${item.id}`, { method: "DELETE" });
                if (!response.ok) {
                  toast.error("Could not delete that check-in.");
                  return;
                }
                setRemoved((current) => new Set(current).add(item.id));
                toast.success("Check-in deleted.");
                router.refresh();
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {more ? (
        <Link href={more} className="mt-4 inline-block text-sm font-bold underline">
          Show more
        </Link>
      ) : null}
    </>
  );
}
