import Link from "next/link";
import { LobbyClock } from "@/components/mw/lobby-clock";

export type LobbyRow = {
  key: string;
  label: string;
  adhan: string;
  iqamah: string | null;
  next: boolean;
};

/**
 * The entrance screen. Dark on purpose: it is a board, not a web page, and it does not follow
 * the site's light or dark theme.
 */
export function LobbyBoard({
  name,
  locality,
  dateLabel,
  hijri,
  timeZone,
  initialIso,
  hour12,
  reloadAt,
  rows,
  adhanLabel,
  iqamahLabel,
  prayerHeading,
  nextLabel,
  emptyIqamah,
  notice,
  noticeLabel,
  donationUrl,
  donationLabel,
  published,
  entitled,
  preview,
  previewHref,
  forCommittees,
}: {
  name: string;
  locality: string | null;
  dateLabel: string;
  hijri: string;
  timeZone: string;
  initialIso: string;
  hour12: boolean;
  reloadAt: string | null;
  rows: LobbyRow[];
  adhanLabel: string;
  iqamahLabel: string;
  prayerHeading: string;
  nextLabel: string;
  emptyIqamah: string;
  notice: string | null;
  noticeLabel: string;
  donationUrl: string | null;
  donationLabel: string;
  published: string;
  entitled: boolean;
  preview: string;
  previewHref: string;
  forCommittees: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#121110] text-[#f3f1ec]" data-testid="lobby-display" data-pro={entitled ? "on" : "preview"}>
      <header className="flex flex-wrap items-end justify-between gap-6 px-6 pt-7 pb-2 sm:px-10">
        <div className="max-w-[40rem]">
          <p className="text-xs font-bold tracking-[0.16em] text-[#34b98a] uppercase">{locality}</p>
          <h1 className="mt-2 text-[clamp(1.75rem,4vw,3.25rem)] leading-[1.05] font-extrabold tracking-[-0.03em]">{name}</h1>
          <p className="mt-2 text-sm text-[#a9a399]">
            {dateLabel}
            {hijri ? ` · ${hijri}` : ""}
          </p>
        </div>
        <LobbyClock timeZone={timeZone} initialIso={initialIso} hour12={hour12} reloadAt={reloadAt} />
      </header>

      {notice ? (
        <p className="mx-6 mt-4 border-s-2 border-[#34b98a] px-4 py-1 sm:mx-10" data-testid="lobby-notice">
          <span className="block text-[11px] font-bold tracking-[0.14em] text-[#a9a399] uppercase">{noticeLabel}</span>
          <span className="mt-1 block text-lg leading-snug font-semibold">{notice}</span>
        </p>
      ) : null}

      <table className="mx-auto mt-6 w-full max-w-[1100px] flex-1 border-separate border-spacing-0 px-4 sm:px-8">
        <caption className="sr-only">{name}</caption>
        <thead>
          <tr className="text-xs font-bold tracking-[0.14em] text-[#a9a399] uppercase">
            <th scope="col" className="px-4 py-2 text-start font-bold">
              <span className="sr-only">{prayerHeading}</span>
            </th>
            <th scope="col" className="px-4 py-2 text-end font-bold">
              {adhanLabel}
            </th>
            <th scope="col" className="px-4 py-2 text-end font-bold">
              {iqamahLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-prayer={row.key} data-next={row.next ? "true" : undefined} className={row.next ? "text-[#34b98a]" : undefined}>
              <th scope="row" className="border-t border-[#2e2b27] px-4 py-3 text-start text-lg font-bold sm:text-2xl">
                {row.label}
                {row.next ? <span className="ms-3 text-[11px] font-bold tracking-[0.14em] uppercase">{nextLabel}</span> : null}
              </th>
              <td className="tabular border-t border-[#2e2b27] px-4 py-3 text-end text-lg sm:text-2xl">{row.adhan}</td>
              <td className="tabular border-t border-[#2e2b27] px-4 py-3 text-end text-2xl font-extrabold sm:text-4xl">{row.iqamah ?? emptyIqamah}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 text-sm sm:px-10">
        {donationUrl ? (
          <a href={donationUrl} className="text-base font-bold text-[#34b98a] underline underline-offset-4" rel="noopener noreferrer" target="_blank">
            {donationLabel}
          </a>
        ) : (
          <span className="text-[#a9a399]">{entitled ? published : ""}</span>
        )}
        <span className="text-[#a9a399]">mosques.world</span>
      </footer>

      {entitled ? null : (
        <p className="bg-[#f3f1ec] px-6 py-3 text-sm text-[#1f1d1a] sm:px-10" data-testid="lobby-preview">
          {preview}{" "}
          <Link href={previewHref} className="font-bold text-[#0b6e4f] underline">
            {forCommittees}
          </Link>
        </p>
      )}
    </div>
  );
}
