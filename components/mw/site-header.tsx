import Link from "next/link";
import { phase2Enabled, phase3Enabled, phase4Enabled, phase6Enabled, phase7Enabled } from "@/lib/phase";
import { eidSeason } from "@/lib/special";
import { getTranslator } from "@/lib/i18n/server";
import { AccountMenu } from "./account-menu";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export async function SiteHeader({ compact = false }: { compact?: boolean }) {
  const accounts = await phase2Enabled().catch(() => false);
  const adding = accounts && (await phase3Enabled().catch(() => false));
  const profiles = adding && (await phase4Enabled().catch(() => false));
  const notifications = profiles && (await phase6Enabled().catch(() => false));
  const eid = notifications && eidSeason(new Date()) && (await phase7Enabled().catch(() => false));
  const l = await getTranslator();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-4 px-4 lg:h-20 lg:px-6">
        {/* No prefetch: it would pull the map bundle into every page (the map is lazy-loaded, spec 2 budgets). */}
        <Link href={l.href("/")} prefetch={false} className="flex items-center gap-2 font-extrabold tracking-tight">
          <LogoMark />
          <span>mosques.world</span>
        </Link>
        {compact ? (
          <Link href={l.href("/search")} className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
            {l.t("nav.search")}
          </Link>
        ) : null}
        <div className="ms-auto flex items-center gap-2">
          <ThemeToggle />
          {eid ? (
            <Link href={l.href("/eid")} className="rounded-full px-3 py-2 text-sm font-semibold text-primary hover:bg-muted">
              {l.t("nav.eid")}
            </Link>
          ) : null}
          {adding ? (
            <Link href={l.href("/add")} className="hidden rounded-full px-3 py-2 text-sm font-semibold hover:bg-muted sm:inline-flex">
              {l.t("nav.add")}
            </Link>
          ) : (
            <Link href={l.href("/about")} className="hidden rounded-full px-3 py-2 text-sm font-semibold hover:bg-muted sm:inline-flex">
              {l.t("nav.about")}
            </Link>
          )}
          {accounts ? <AccountMenu profiles={profiles} notifications={notifications} /> : null}
        </div>
      </div>
    </header>
  );
}

