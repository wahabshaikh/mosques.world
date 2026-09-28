"use client";

import { Camera, Check, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { NearbyPlace, VerifyOption, VerifyQuestion } from "@/lib/verify";
import { uploadPhoto } from "./photo-upload-dialog";

type Location = { lat: number; lng: number };
type Started = {
  place: { id: string; slug: string; name: string };
  checkin: { label: string; created: boolean };
  questions: VerifyQuestion[];
};
type Stage =
  | { kind: "locating" }
  | { kind: "denied" }
  | { kind: "none" }
  | { kind: "pick"; places: NearbyPlace[] }
  | { kind: "starting" }
  | { kind: "asking"; index: number }
  | { kind: "done" };

function locate(): Promise<Location | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (value) => resolve({ lat: value.coords.latitude, lng: value.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}

function buzz() {
  try {
    navigator.vibrate?.(12);
  } catch {
    // Haptics are best-effort.
  }
}

async function postJson<T>(path: string, body: unknown): Promise<{ ok: boolean; body: (T & { error?: string }) | null }> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, body: (await response.json().catch(() => null)) as (T & { error?: string }) | null };
}

function base64Key(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let index = 0; index < bytes.length; index += 1) out[index] = bytes.charCodeAt(index);
  return out;
}

/** "I'm here" → nearest place → up to three one-tap questions → thanks (spec 4.3 Quick verify). */
export function QuickVerify({ placeHint, username, vapidKey }: { placeHint: string | null; username: string; vapidKey: string | null }) {
  const [stage, setStage] = useState<Stage>({ kind: "locating" });
  const [session, setSession] = useState<Started | null>(null);
  const [pending, setPending] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [verifications, setVerifications] = useState<number | null>(null);
  const [pushState, setPushState] = useState<"idle" | "done" | "hidden">("idle");
  const location = useRef<Location | null>(null);
  const camera = useRef<HTMLInputElement>(null);

  const start = useCallback(async (placeId: string) => {
    if (!location.current) return;
    setStage({ kind: "starting" });
    const result = await postJson<Started>("/api/v1/verify/start", { placeId, location: location.current });
    if (!result.ok || !result.body) {
      toast.error(result.body?.error ?? "Could not start. Try again.");
      setStage({ kind: "none" });
      return;
    }
    track("checkin_created", { geo_verified: true, prayer: result.body.checkin.label });
    setSession(result.body);
    setStage(result.body.questions.length > 0 ? { kind: "asking", index: 0 } : { kind: "done" });
  }, []);

  const find = useCallback(async () => {
    setStage({ kind: "locating" });
    const here = await locate();
    if (!here) {
      setStage({ kind: "denied" });
      return;
    }
    location.current = here;
    const result = await postJson<{ places: NearbyPlace[] }>("/api/v1/verify/nearby", here);
    const places = result.body?.places ?? [];
    const hinted = places.find((place) => place.id === placeHint);
    if (hinted) await start(hinted.id);
    else if (places.length === 1 && places[0]) await start(places[0].id);
    else if (places.length > 1) setStage({ kind: "pick", places });
    else setStage({ kind: "none" });
  }, [placeHint, start]);

  useEffect(() => {
    track("im_here_tapped", { from: placeHint ? "place" : "verify" });
    void find();
  }, [find, placeHint]);

  useEffect(() => {
    if (stage.kind === "done" && session) track("quick_verify_completed", { answers: answered });
  }, [stage.kind, session, answered]);

  const next = (index: number) => {
    const total = session?.questions.length ?? 0;
    setStage(index + 1 < total ? { kind: "asking", index: index + 1 } : { kind: "done" });
  };

  const choose = async (question: VerifyQuestion, option: VerifyOption, index: number) => {
    buzz();
    if (!session || !location.current) return;
    if (option.action === "update") {
      window.location.assign(`/m/${session.place.slug}/update`);
      return;
    }
    if (option.action === "photo") {
      camera.current?.click();
      return;
    }
    if (option.answer) {
      setPending(true);
      const result = await postJson<{ message: string; verifications: number }>("/api/v1/verify/answer", {
        placeId: session.place.id,
        location: location.current,
        answer: option.answer,
      });
      setPending(false);
      if (!result.ok || !result.body) {
        toast.error(result.body?.error ?? "Could not save that answer.");
        return;
      }
      track(question.kind === "amenity" ? "amenity_vote_cast" : "vote_cast", { source: "quick_verify" });
      setAnswered((count) => count + 1);
      setMessage(result.body.message);
      setVerifications(result.body.verifications);
    }
    next(index);
  };

  const onPhoto = async (file: File | undefined, index: number) => {
    if (!file || !session) return;
    setPending(true);
    const result = await uploadPhoto({ file, placeId: session.place.id, purpose: "place", category: "timetable" });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not upload that photo.");
      return;
    }
    track("photo_uploaded", { category: "timetable" });
    setAnswered((count) => count + 1);
    next(index);
  };

  const subscribe = async () => {
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("hidden");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushState("hidden");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64Key(vapidKey) });
    const saved = await postJson("/api/v1/push/subscribe", subscription.toJSON());
    setPushState(saved.ok ? "done" : "hidden");
    if (saved.ok) toast.success("We'll let you know when your saved mosques change.");
  };

  const canPush = pushState === "idle" && Boolean(vapidKey) && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default";
  const question = stage.kind === "asking" ? session?.questions[stage.index] : undefined;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#ECEEE7] text-[#1F1D1A]">
      <svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 size-full">
        <rect width="390" height="844" fill="#ECEEE7" />
        <path d="M-10 250 L400 200" stroke="#FFFFFF" strokeWidth="16" />
        <path d="M120 -10 L160 500" stroke="#FFFFFF" strokeWidth="8" />
        <path d="M300 -10 L270 500" stroke="#FFFFFF" strokeWidth="5" />
        <path d="M0 90 L390 120" stroke="#FFFFFF" strokeWidth="4" />
        <ellipse cx="330" cy="360" rx="80" ry="40" fill="#D3E4CF" />
      </svg>
      <span className="absolute top-[26%] left-1/2 size-[120px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(11,110,79,0.14)] motion-safe:animate-pulse" aria-hidden="true" />
      <span
        className="absolute top-[26%] left-1/2 flex size-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-[#0B6E4F] shadow-[0_3px_12px_rgba(0,0,0,0.25)]"
        aria-hidden="true"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 20v-6a6 6 0 0 1 12 0v6z" />
          <path d="M12 5v3" />
          <path d="M3 20h18" />
        </svg>
      </span>
      <Link
        href={session ? `/m/${session.place.slug}` : "/"}
        aria-label="Close"
        className="absolute top-4 left-4 flex size-10 items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.15)]"
      >
        <X className="size-4" strokeWidth={2.6} />
      </Link>

      <section
        aria-live="polite"
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[75vh] min-h-[46vh] max-w-[520px] flex-col gap-[18px] overflow-y-auto rounded-t-3xl bg-white px-5 pt-2.5 pb-[34px] shadow-[0_-6px_24px_rgba(0,0,0,0.12)]"
        data-testid="verify-sheet"
      >
        <span className="h-[5px] w-10 self-center rounded-full bg-[#D6D1C7]" aria-hidden="true" />
        {stage.kind === "locating" || stage.kind === "starting" ? (
          <p className="text-[15px] text-[#5E5A53]">{stage.kind === "locating" ? "Finding the mosque you're at…" : "Checking you in…"}</p>
        ) : null}
        {stage.kind === "denied" ? (
          <div className="flex flex-col gap-3.5">
            <h1 className="text-[22px] font-extrabold">We need your location</h1>
            <p className="text-sm text-[#5E5A53]">Quick verify only works at the mosque. Allow location access, then try again. We check it once and never store it.</p>
            <button type="button" onClick={() => void find()} className="rounded-[14px] bg-[#0B6E4F] p-4 text-base font-bold text-white">
              Try again
            </button>
          </div>
        ) : null}
        {stage.kind === "none" ? (
          <div className="flex flex-col gap-3.5">
            <h1 className="text-[22px] font-extrabold">No mosque within 150 m</h1>
            <p className="text-sm text-[#5E5A53]">Quick verify works when you're at a mosque or prayer room. Is this one missing?</p>
            <Link href="/add" className="rounded-[14px] bg-[#0B6E4F] p-4 text-center text-base font-bold text-white">
              Add this place
            </Link>
            <button type="button" onClick={() => void find()} className="p-1.5 text-sm font-bold underline">
              Try again
            </button>
          </div>
        ) : null}
        {stage.kind === "pick" ? (
          <div className="flex flex-col gap-3">
            <h1 className="text-[22px] font-extrabold">Which place are you at?</h1>
            {stage.places.map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => void start(place.id)}
                className="flex items-center justify-between rounded-[14px] border border-[#1F1D1A] p-4 text-start"
              >
                <span className="font-bold">{place.name}</span>
                <span className="text-sm text-[#5E5A53]">{place.distanceM} m</span>
              </button>
            ))}
          </div>
        ) : null}

        {session && (stage.kind === "asking" || stage.kind === "done") ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-extrabold tracking-[0.6px] text-[#0B6E4F]">YOU&apos;RE AT</span>
              <h1 className="text-[22px] font-extrabold tracking-[-0.3px]">{session.place.name}</h1>
              <span className="text-[13px] text-[#5E5A53]">
                {session.checkin.created ? `Checked in for ${session.checkin.label} · added to your map` : `Already checked in for ${session.checkin.label} today`}
              </span>
            </div>
            {session.questions.length > 0 ? (
              <div className="flex gap-1.5" aria-hidden="true">
                {session.questions.map((item, index) => (
                  <span
                    key={item.id}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      stage.kind === "done" || (stage.kind === "asking" && index <= stage.index) ? "bg-[#0B6E4F]" : "bg-[#E0DBD2]",
                    )}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {question && stage.kind === "asking" ? (
          <div className="flex flex-col gap-3.5" data-question={question.id}>
            <span className="text-[13px] text-[#5E5A53]">
              Quick check {stage.index + 1} of {session?.questions.length}
              {question.context ? ` · ${question.context}` : ""}
            </span>
            <h2 className="text-2xl leading-tight font-extrabold">
              {question.before}
              {question.highlight ? <span className="text-[#0B6E4F]">{question.highlight}</span> : null}
              {question.after}
            </h2>
            <span className="text-sm text-[#5E5A53]">{question.hint}</span>
            {question.options.map((option) => (
              <button
                key={option.label}
                type="button"
                disabled={pending}
                onClick={() => void choose(question, option, stage.index)}
                className={cn(
                  "flex items-center justify-center gap-2.5 font-bold disabled:opacity-60",
                  option.style === "primary" && "rounded-[14px] bg-[#0B6E4F] p-4 text-base text-white",
                  option.style === "secondary" && "rounded-[14px] border border-[#1F1D1A] bg-white p-[15px] text-base",
                  option.style === "tertiary" && "p-1.5 text-sm underline",
                )}
              >
                {option.action === "photo" ? <Camera className="size-[18px]" aria-hidden="true" /> : null}
                {option.label}
              </button>
            ))}
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Timetable photo"
              onChange={(event) => void onPhoto(event.target.files?.[0], stage.index)}
            />
          </div>
        ) : null}

        {stage.kind === "done" ? (
          <div className="flex flex-col items-center gap-3.5 pt-2.5 text-center">
            <span className="flex size-[72px] items-center justify-center rounded-full bg-[#E6F1EB]">
              <Check className="size-[34px] text-[#0B6E4F]" strokeWidth={2.4} aria-hidden="true" />
            </span>
            <h2 className="text-2xl font-extrabold">JazakAllahu khayran</h2>
            <p className="text-sm leading-normal text-[#5E5A53]">
              {message ?? "Your check-in is on your map."}
              {verifications !== null ? ` You've verified ${verifications} ${verifications === 1 ? "timing" : "timings"}.` : ""}
            </p>
            <Link href={`/@${username}`} className="self-stretch rounded-[14px] bg-[#1F1D1A] px-5 py-[15px] text-[15px] font-bold text-white">
              See your map
            </Link>
            {canPush ? (
              <button type="button" onClick={() => void subscribe()} className="p-1.5 text-sm font-bold underline">
                Tell me when my saved mosques change
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
