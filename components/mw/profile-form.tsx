"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HomeCityField, type HomeCity } from "./home-city-field";

type Initial = { username: string; name: string; bio: string; homeCityLabel: string | null; homeCountry: string | null };

export function ProfileForm({ initial, usernameLocked, lockDays }: { initial: Initial; usernameLocked: boolean; lockDays: number }) {
  const [username, setUsername] = useState(initial.username);
  const [name, setName] = useState(initial.name);
  const [bio, setBio] = useState(initial.bio);
  const [home, setHome] = useState<HomeCity | null>(initial.homeCityLabel ? { label: initial.homeCityLabel, country: initial.homeCountry } : null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const response = await fetch("/api/v1/account/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, name, bio, homeCityLabel: home?.label ?? null, homeCountry: home?.country ?? null }),
        });
        setPending(false);
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          setError(body?.error ?? "Could not save.");
          return;
        }
        toast.success("Profile saved");
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="username" className="text-sm font-semibold">
          Username
        </label>
        <Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={usernameLocked} aria-describedby="username-note" />
        <p id="username-note" className="text-xs text-muted-foreground">
          {usernameLocked ? `You changed your username recently. You can change it again ${lockDays} days after the last change.` : `You can change it once every ${lockDays} days.`}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-semibold">
          Display name
        </label>
        <Input id="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="bio" className="text-sm font-semibold">
          Bio
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={280}
          rows={3}
          className="rounded-[12px] border border-input bg-background px-3 py-2"
        />
        <p className="text-xs text-muted-foreground">{280 - bio.length} characters left</p>
      </div>
      <HomeCityField value={home} onChange={setHome} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
