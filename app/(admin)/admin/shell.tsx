import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const ITEMS = [
  ["Queue", "/admin/queue"],
  ["Reports", "/admin/reports"],
  ["Places", "/admin/places/merge"],
  ["Users", "/admin/users"],
  ["Audit log", "/admin/audit"],
] as const;

export function AdminShell({ active, title, children }: { active: string; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 lg:px-6">
      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Moderation</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
      <nav aria-label="Moderation" className="mt-4 flex flex-wrap gap-2">
        {ITEMS.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            aria-current={active === href ? "page" : undefined}
            className={cn("rounded-full px-4 py-2 text-sm font-semibold", active === href ? "bg-secondary text-secondary-foreground" : "bg-muted")}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
