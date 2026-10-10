import { Plus } from "lucide-react";
import Link from "next/link";
import { eidSeason } from "@/lib/special";
import { getTranslator } from "@/lib/i18n/server";
import { AccountMenu } from "./account-menu";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export async function SiteHeader({ compact = false }: { compact?: boolean }) {
  const eid = eidSeason(new Date());
  const l = await getTranslator();
  const link = "hidden rounded-full px-3 py-2 text-sm font-semibold hover:bg-muted lg:inline-flex";
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 lg:h-20 lg:px-6">
        {/* No prefetch: it would pull the map bundle into every page (the map is lazy-loaded, spec 2 budgets). */}
        <Link href={l.href("/")} prefetch={false} className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight">
          <LogoMark className="size-8 lg:size-9" />
          <span>mosques.world</span>
        </Link>
        {compact ? (
          <Link href={l.href("/search")} className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
            {l.t("nav.search")}
          </Link>
        ) : null}
        <nav className="ms-auto flex items-center gap-1" aria-label="Site">
          {eid ? (
            <Link href={l.href("/eid")} className="rounded-full px-3 py-2 text-sm font-semibold text-primary hover:bg-muted">
              {l.t("nav.eid")}
            </Link>
          ) : null}
          <Link href="/leaderboard" prefetch={false} className={link}>
            Leaderboard
          </Link>
          <Link href={l.href("/add")} prefetch={false} className={link}>
            {l.t("nav.add")}
          </Link>
          <Link
            href={l.href("/add")}
            prefetch={false}
            aria-label={l.t("nav.add")}
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-muted lg:hidden"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Link>
          <span className="hidden lg:inline-flex">
            <ThemeToggle />
          </span>
          <AccountMenu />
        </nav>
      </div>
    </header>
  );
}
