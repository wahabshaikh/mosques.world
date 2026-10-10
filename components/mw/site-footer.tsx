import Link from "next/link";
import { LanguageSwitcher } from "@/components/mw/language-switcher";
import type { MessageKey } from "@/lib/i18n/messages/en";
import { getTranslator } from "@/lib/i18n/server";

const links: Array<[MessageKey, string]> = [
  ["footer.about", "/about"],
  ["footer.guidelines", "/guidelines"],
  ["footer.privacy", "/privacy"],
  ["footer.terms", "/terms"],
  ["footer.attribution", "/attribution"],
];

const open: Array<[MessageKey, string]> = [
  ["footer.openData", "/open-data"],
  ["footer.developers", "/developers"],
];

export async function SiteFooter() {
  const l = await getTranslator();
  return (
    <footer className="pb-tabbar border-t border-border bg-muted/50">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <p>
          © {new Date().getFullYear()} mosques.world · {l.t("footer.tagline")}
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {[...links, ...(open)].map(([key, href]) => (
            <Link key={href} href={l.href(href)} className="hover:text-foreground">
              {l.t(key)}
            </Link>
          ))}
          <LanguageSwitcher locale={l.locale} label={l.t("footer.language")} />
        </nav>
      </div>
    </footer>
  );
}
