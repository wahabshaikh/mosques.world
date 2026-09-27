import Link from "next/link";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-4 px-4 lg:h-20 lg:px-6">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          <LogoMark />
          <span>mosques.world</span>
        </Link>
        {compact ? (
          <Link href="/search" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
            Search mosques
          </Link>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/about" className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-muted">
            About
          </Link>
        </div>
      </div>
    </header>
  );
}
