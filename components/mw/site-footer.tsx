import Link from "next/link";

const links = [
  ["About", "/about"],
  ["Guidelines", "/guidelines"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Attribution", "/attribution"],
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <p>© {new Date().getFullYear()} mosques.world · Prayer times you can trust.</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
