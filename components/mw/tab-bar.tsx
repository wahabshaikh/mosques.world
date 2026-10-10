"use client";

import { Bookmark, Search, Trophy, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useText } from "./text";
import { useSessionUser } from "./use-session";

/** Pages with their own bottom bar (the mosque page's "next prayer" bar) hide the tab bar, as native apps do. */
const OWN_BAR = /^\/(?:[a-z]{2}\/)?m\/[^/]+\/?$/;

/**
 * The phone tab bar: Explore, Saved, Hasanat, You. Most visitors are on phones, so the four things
 * people come back for sit under their thumb; wide screens use the header instead.
 */
export function TabBar() {
  const pathname = usePathname() || "/";
  const text = useText();
  const user = useSessionUser();
  if (OWN_BAR.test(pathname)) return null;
  const strip = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";
  const you = user?.username ? `/@${user.username}` : user ? "/onboarding" : `/sign-in?next=${encodeURIComponent(pathname)}`;
  const tabs = [
    { href: "/", label: text("Explore"), icon: Search, active: strip === "/" || strip.startsWith("/search") || strip.startsWith("/cities") || strip.startsWith("/countries") },
    { href: user === null ? `/sign-in?next=${encodeURIComponent("/saved")}` : "/saved", label: text("Saved"), icon: Bookmark, active: strip.startsWith("/saved") },
    { href: "/leaderboard", label: text("Hasanat"), icon: Trophy, active: strip.startsWith("/leaderboard") },
    { href: you, label: text(user ? "You" : "Sign in"), icon: UserRound, active: strip.startsWith("/u/") || strip.startsWith("/@") || strip.startsWith("/settings") || strip.startsWith("/sign-in") },
  ];
  return (
    <nav
      aria-label={text("Main")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      data-testid="tab-bar"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
        {tabs.map(({ href, label, icon: Icon, active }) => (
          <li key={label}>
            <Link
              href={href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
