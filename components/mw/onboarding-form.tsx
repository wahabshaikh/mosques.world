"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { track } from "@/lib/analytics";
import { normalizeUsername, usernameProblem } from "@/lib/username";
import { HomeCityField, type HomeCity } from "./home-city-field";

export function OnboardingForm({
  next,
  method,
  initialName,
  initialUsername,
  suggestions,
}: {
  next: string;
  method: "email" | "google";
  initialName: string;
  initialUsername: string;
  suggestions: string[];
}) {
  const [username, setUsername] = useState(initialUsername || suggestions[0] || "");
  const [name, setName] = useState(initialName);
  const [home, setHome] = useState<HomeCity | null>(null);
  const [agree, setAgree] = useState(false);
  const [availability, setAvailability] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const clean = normalizeUsername(username);
  const localProblem = clean ? usernameProblem(clean) : null;

  useEffect(() => {
    if (!clean || localProblem || clean === initialUsername) {
      setAvailability(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/v1/usernames?u=${encodeURIComponent(clean)}`, { signal: controller.signal }).catch(() => null);
      if (!response?.ok) return;
      const body = (await response.json()) as { available: boolean; problem?: string };
      setAvailability(body.available ? "Available" : (body.problem ?? "Taken"));
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [clean, localProblem, initialUsername]);

  return (
    <form
      className="w-full max-w-md rounded-[20px] border border-border p-6 shadow-[0_6px_20px_rgba(31,29,26,.12)] sm:p-8"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const response = await fetch("/api/v1/onboarding", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: clean,
            name,
            homeCityLabel: home?.label ?? null,
            homeCountry: home?.country ?? null,
            acceptGuidelines: agree,
          }),
        });
        const body = (await response.json().catch(() => null)) as { error?: string; first?: boolean } | null;
        if (!response.ok) {
          setPending(false);
          setError(body?.error ?? "Could not save your profile.");
          return;
        }
        if (body?.first) track("signup_completed", { method });
        track("onboarding_completed", {});
        window.location.assign(next);
      }}
    >
      <h1 className="text-2xl font-bold tracking-tight">Welcome to mosques.world</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your username appears next to the times you add and confirm.</p>
      <div className="mt-6 flex flex-col gap-2">
        <label htmlFor="username" className="text-sm font-semibold">
          Username
        </label>
        <div className="flex items-center rounded-[12px] border border-input focus-within:ring-2 focus-within:ring-ring">
          <span className="pl-3 text-muted-foreground" aria-hidden="true">
            @
          </span>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent px-1 outline-none"
            autoComplete="username"
            aria-describedby="username-help"
            required
          />
        </div>
        <p id="username-help" className="text-xs text-muted-foreground" aria-live="polite">
          {localProblem ?? availability ?? "3–30 lowercase letters, numbers, dots or underscores."}
        </p>
        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((item) => (
              <button key={item} type="button" className="rounded-full border border-border px-3 py-1 text-xs font-semibold" onClick={() => setUsername(item)}>
                @{item}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <label htmlFor="display-name" className="text-sm font-semibold">
          Display name
        </label>
        <Input id="display-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
      </div>
      <HomeCityField value={home} onChange={setHome} />
      <label className="mt-5 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} className="mt-1 size-4" required />
        <span>
          I agree to the <Link href="/guidelines" className="underline" target="_blank">community guidelines</Link>: I only mark what I&apos;ve seen myself.
        </span>
      </label>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" className="mt-6 w-full" disabled={pending || Boolean(localProblem) || !agree}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
