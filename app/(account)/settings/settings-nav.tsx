import Link from "next/link";
import { phase4Enabled, phase6Enabled, phase8Enabled } from "@/lib/phase";
import { cn } from "@/lib/utils";

export async function SettingsShell({ active, title, children }: { active: string; title: string; children: React.ReactNode }) {
  const ITEMS = [
    ["Profile", "/settings/profile"],
    ...((await phase4Enabled().catch(() => false)) ? [["Privacy", "/settings/privacy"] as const] : []),
    ...((await phase6Enabled().catch(() => false)) ? [["Notifications", "/settings/notifications"] as const] : []),
    ...((await phase8Enabled().catch(() => false)) ? [["API keys", "/settings/developers"] as const] : []),
    ["Account", "/settings/account"],
  ] as const;
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
