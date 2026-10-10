"use client";

import { useEffect, useState } from "react";

export type SessionUser = { id: string; name: string; username?: string | null; role?: string | null };

// One request per page load, shared by the header menu and the tab bar.
let pending: Promise<SessionUser | null> | null = null;

function loadSession(): Promise<SessionUser | null> {
  pending ??= fetch("/api/auth/get-session", { credentials: "same-origin" })
    .then((response) => (response.ok ? (response.json() as Promise<{ user?: SessionUser } | null>) : null))
    .then((body) => body?.user ?? null)
    .catch(() => null);
  return pending;
}

/** The signed-in person: undefined while loading, null when signed out. */
export function useSessionUser(): SessionUser | null | undefined {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void loadSession().then((value) => {
      if (!cancelled) setUser(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return user;
}
