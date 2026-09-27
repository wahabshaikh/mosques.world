import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  ["Profile", "/settings/profile"],
  ["Account", "/settings/account"],
] as const;

export function SettingsShell({ active, title, children }: { active: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1120px] gap-8 px-4 py-10 md:grid-cols-[200px_minmax(0,1fr)] lg:px-6">
      <nav aria-label="Settings" className="flex gap-2 md:flex-col">
        {ITEMS.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            aria-current={active === href ? "page" : undefined}
            className={cn("rounded-full px-4 py-2 text-sm font-semibold hover:bg-muted", active === href && "bg-muted")}
          >
            {label}
          </Link>
        ))}
      </nav>
      <section className="max-w-xl">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
