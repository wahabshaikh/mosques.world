import type { Metadata } from "next";
import Link from "next/link";
import { appEnv } from "@/lib/db/client";
import { languageAlternates } from "@/lib/i18n/config";
import { MASJID_PRO_PRICES } from "@/lib/masjid-pro";
import { readPolarConfig } from "@/lib/polar";

export const dynamic = "force-dynamic";

const path = "/for-mosques";

export const metadata: Metadata = {
  title: "Masjid Pro",
  description: "A lobby screen and a website widget for one mosque. The directory stays free. Donations are paid on the mosque's own page.",
  alternates: { canonical: path, languages: languageAlternates(path) },
};

function checkoutOpen(): boolean {
  try {
    return readPolarConfig(appEnv()) !== null;
  } catch {
    return false;
  }
}

export default function ForMosquesPage() {
  const open = checkoutOpen();
  return (
    <article className="mx-auto max-w-[760px] px-4 py-12 lg:px-6">
      <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">For mosque committees</p>
      <h1 className="mt-3 max-w-[16ch] text-[2.6rem] leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-[3.25rem]">The board by the door, on the screen in the lobby.</h1>
      <p className="mt-6 max-w-[42rem] text-lg leading-8 text-foreground/90">
        Masjid Pro is a subscription for one mosque. It publishes a lobby screen and a widget for the mosque&apos;s own website from the times already listed here, plus one notice and a link to give. The directory stays free. We do not take donations.
      </p>
      <p className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm font-bold">
        <Link href="/m/east-london-mosque-whitechapel/display" className="text-primary underline">
          See a lobby screen
        </Link>
        <a href="#price" className="underline">
          {MASJID_PRO_PRICES.month.label}
        </a>
      </p>

      <section className="mt-14 border-t border-border pt-8" aria-labelledby="includes">
        <h2 id="includes" className="text-[1.7rem] font-extrabold tracking-tight">
          What the committee gets
        </h2>
        <dl className="mt-6 divide-y divide-border border-y border-border">
          <div className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
            <dt className="font-bold">Lobby screen</dt>
            <dd className="text-sm leading-6 text-muted-foreground">
              Today&apos;s adhan and iqamah, the next congregation, and a clock in the mosque&apos;s time zone. The times are the ones on the mosque&apos;s page. Large enough to read from the entrance. A preview bar stays on the screen until the mosque subscribes.
            </dd>
          </div>
          <div className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
            <dt className="font-bold">One notice</dt>
            <dd className="text-sm leading-6 text-muted-foreground">Janazah after Asr. The sisters&apos; entrance. Class cancelled. It shows on the screen, the widget, and the mosque&apos;s page.</dd>
          </div>
          <div className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
            <dt className="font-bold">A link to give</dt>
            <dd className="text-sm leading-6 text-muted-foreground">The page the mosque already uses. The gift is paid there. mosques.world never holds the money.</dd>
          </div>
          <div className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
            <dt className="font-bold">Website widget</dt>
            <dd className="text-sm leading-6 text-muted-foreground">A small frame of today&apos;s times for the mosque&apos;s own site. It updates with the directory. No account for the people reading it.</dd>
          </div>
        </dl>
      </section>

      <section className="mt-14" aria-labelledby="not">
        <h2 id="not" className="text-[1.7rem] font-extrabold tracking-tight">
          What it does not do
        </h2>
        <ul className="mt-4 max-w-[42rem] list-disc space-y-2 ps-5 text-sm leading-6 text-muted-foreground">
          <li>It does not replace the community. A time on the mosque page still shows who checked it and when.</li>
          <li>It does not charge the people who come to pray, and it does not sell a sponsorship beside a mosque.</li>
          <li>It does not rank, review, or label a mosque by school of thought.</li>
        </ul>
      </section>

      <section id="price" className="mt-14 scroll-mt-24 border-t border-border pt-8" aria-labelledby="price-heading">
        <h2 id="price-heading" className="text-[1.7rem] font-extrabold tracking-tight">
          One mosque, one subscription
        </h2>
        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
          <div className="bg-background p-6">
            <p className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Month</p>
            <p className="tabular mt-2 text-5xl font-extrabold tracking-[-0.04em]">$19</p>
            <p className="mt-2 text-sm text-muted-foreground">Per mosque. Cancel any time.</p>
          </div>
          <div className="bg-background p-6">
            <p className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Year</p>
            <p className="tabular mt-2 text-5xl font-extrabold tracking-[-0.04em]">$180</p>
            <p className="mt-2 text-sm text-muted-foreground">Two months less than paying monthly. The screen stays up until the year that was paid for ends.</p>
          </div>
        </div>
        <p className="mt-4 max-w-[42rem] text-sm leading-6 text-muted-foreground">
          A second mosque is a second subscription. Payment, when it is open, is taken by Polar, which handles tax. Card numbers are entered on Polar&apos;s page.
          {open
            ? " An approved steward starts it from the mosque's Masjid Pro page."
            : " Payment is not open on this site yet. The lobby preview works today."}
        </p>
      </section>

      <section id="start" className="mt-14 border-t border-border pt-8" aria-labelledby="start-heading">
        <h2 id="start-heading" className="text-[1.7rem] font-extrabold tracking-tight">
          How a committee starts
        </h2>
        <ol className="mt-4 max-w-[42rem] list-decimal space-y-2 ps-5 text-sm leading-6">
          <li>Open the mosque&apos;s page and ask to look after it. A moderator checks that you are involved.</li>
          <li>Open Masjid Pro on that mosque and choose a month or a year.</li>
          <li>Write the notice, paste the donation link, and put the lobby screen on the television by the door.</li>
        </ol>
        <p className="mt-6 text-sm">
          <Link href="/m/east-london-mosque-whitechapel" className="font-bold underline">
            East London Mosque
          </Link>
          <span className="text-muted-foreground"> is one place to see the directory, and its </span>
          <Link href="/m/east-london-mosque-whitechapel/display" className="font-bold underline">
            lobby screen
          </Link>
          <span className="text-muted-foreground">, before a committee subscribes.</span>
        </p>
      </section>
    </article>
  );
}
