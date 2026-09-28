"use client";

import { Bookmark, Globe, LogOut, Menu, Settings, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { avatarColor, initials } from "@/lib/people";

type MenuUser = { id: string; name: string; username?: string | null; role?: string | null };

/**
 * Header account menu. Deliberately free of the better-auth client and Radix so every page stays
 * inside the JS budget: one fetch for the session and a small disclosure menu.
 */
export function AccountMenu({ profiles = false }: { profiles?: boolean }) {
  const pathname = usePathname();
  const [user, setUser] = useState<MenuUser | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/get-session", { credentials: "same-origin" })
      .then((response) => (response.ok ? (response.json() as Promise<{ user?: MenuUser } | null>) : null))
      .then((body) => {
        if (!cancelled) setUser(body?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (user === undefined) return <span className="inline-block h-11 w-24" aria-hidden="true" />;
  if (!user) {
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(pathname || "/")}`}
        className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted"
      >
        Sign in
      </Link>
    );
  }
  const handle = user.username ? `@${user.username}` : user.name || "Your account";
  const moderator = user.role === "moderator" || user.role === "admin";
  const item = "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-muted focus-visible:bg-muted";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-border pr-1 pl-3 hover:shadow-md"
      >
        <Menu className="size-4" />
        <span
          className="inline-flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: avatarColor(user.id) }}
        >
          {initials(user.name || user.username || "?")}
        </span>
      </button>
      {open ? (
        <div id="account-menu" className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-border bg-popover p-1 shadow-lg">
          <p className="px-3 py-2 text-xs text-muted-foreground">Signed in as {handle}</p>
          <ul onClick={() => setOpen(false)}>
            {!user.username ? (
              <li>
                <Link className={item} href="/onboarding">
                  <UserRound className="size-4" /> Choose a username
                </Link>
              </li>
            ) : null}
            {profiles && user.username ? (
              <>
                <li>
                  <Link className={item} href={`/@${user.username}`}>
                    <Globe className="size-4" /> Your map and profile
                  </Link>
                </li>
                <li>
                  <Link className={item} href="/saved">
                    <Bookmark className="size-4" /> Saved
                  </Link>
                </li>
              </>
            ) : null}
            <li>
              <Link className={item} href="/settings/profile">
                <UserRound className="size-4" /> Profile settings
              </Link>
            </li>
            <li>
              <Link className={item} href="/settings/account">
                <Settings className="size-4" /> Account
              </Link>
            </li>
            {moderator ? (
              <li>
                <Link className={item} href="/admin/queue">
                  <Shield className="size-4" /> Moderation
                </Link>
              </li>
            ) : null}
            <li className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                className={`${item} w-full`}
                onClick={async () => {
                  await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
                  window.location.assign("/");
                }}
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
