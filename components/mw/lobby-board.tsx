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
 * Television board for one mosque. It fills the screen, does not scroll, and has a dark and a light
 * variant (`?theme=`). The preview bar is the Masjid Pro gate: the times are the directory's times.
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
  countdownPrefix,
  nowLabel,
  rows,
  adhanLabel,
  iqamahLabel,
  prayerHeading,
  nextLabel,
  emptyIqamah,
  jumuahLabel,
  jumuahTimes,
  notice,
  noticeLabel,
  donationUrl,
  donationLabel,
  published,
  entitled,
  preview,
  previewHref,
  forCommittees,
  theme,
  lightLabel,
  darkLabel,
}: {
  name: string;
  locality: string | null;
  dateLabel: string;
  hijri: string;
  timeZone: string;
  initialIso: string;
  hour12: boolean;
  reloadAt: string | null;
  countdownPrefix: string;
  nowLabel: string;
  rows: LobbyRow[];
  adhanLabel: string;
  iqamahLabel: string;
  prayerHeading: string;
  nextLabel: string;
  emptyIqamah: string;
  jumuahLabel: string;
  jumuahTimes: string[];
  notice: string | null;
  noticeLabel: string;
  donationUrl: string | null;
  donationLabel: string;
  published: string;
  entitled: boolean;
  preview: string;
  previewHref: string;
  forCommittees: string;
  theme: "dark" | "light";
  lightLabel: string;
  darkLabel: string;
}) {
  const light = theme === "light";
  const muted = light ? "text-[#4f493f]" : "text-[#c8c2b6]";
  const line = light ? "border-[#e3dccf]" : "border-[#2e2b27]";
  const accent = light ? "text-[#0b6e4f]" : "text-[#7ddec0]";
  const meta = [locality, dateLabel, hijri].filter(Boolean).join(" · ");
  const jumuahLine = jumuahTimes.length ? `${jumuahLabel} ${jumuahTimes.join(" · ")}` : "";

  return (
    <div
      className={`fixed inset-0 flex flex-col overflow-hidden ${light ? "bg-[#f7f4ee] text-[#1a1814]" : "bg-[#121110] text-[#f4f1ea]"}`}
      data-testid="lobby-display"
      data-pro={entitled ? "on" : "preview"}
      data-theme={theme}
      data-reload-at={reloadAt ?? ""}
    >
      <header className="flex shrink-0 items-center justify-between gap-[2vw] px-[2.4vw] pt-[1.4vh] pb-[0.6vh]">
        <div className="min-w-0">
          <h1 className="truncate text-[clamp(1.6rem,4.8vh,3.6rem)] leading-none font-extrabold tracking-[-0.03em]">{name}</h1>
          <p className={`mt-[0.7vh] truncate text-[clamp(0.8rem,2vh,1.3rem)] leading-none ${muted}`}>{meta}</p>
        </div>
        <LobbyClock
          timeZone={timeZone}
          initialIso={initialIso}
          hour12={hour12}
          reloadAt={reloadAt}
          countdownPrefix={countdownPrefix}
          nowLabel={nowLabel}
          mutedClass={muted}
        />
      </header>

      <div className="min-h-0 flex-1 px-[1.6vw]" role="table" aria-label={name} style={{ display: "grid", gridTemplateRows: `auto repeat(${rows.length}, minmax(0, 1fr))` }}>
        <div role="row" className={`grid grid-cols-[1.15fr_0.85fr_1.15fr] items-end px-[0.8vw] pb-[0.3vh] text-[clamp(0.7rem,1.7vh,1.05rem)] font-bold tracking-[0.14em] uppercase ${muted}`}>
          <div role="columnheader">
            <span className="sr-only">{prayerHeading}</span>
          </div>
          <div role="columnheader" className="text-end">
            {adhanLabel}
          </div>
          <div role="columnheader" className="text-end">
            {iqamahLabel}
          </div>
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            role="row"
            data-prayer={row.key}
            data-next={row.next ? "true" : undefined}
            className={`grid grid-cols-[1.15fr_0.85fr_1.15fr] items-center overflow-hidden border-t px-[0.8vw] ${line} ${row.next ? (light ? "bg-[#e7f3ec]" : "bg-[#1a2e27]") : ""}`}
          >
            <div role="rowheader" className="truncate text-[clamp(1.35rem,4.6vh,3.4rem)] leading-none font-bold">
              {row.label}
              {row.next ? <span className={`ms-[0.6em] text-[0.42em] font-bold tracking-[0.14em] uppercase ${accent}`}>{nextLabel}</span> : null}
            </div>
            <div role="cell" className="tabular truncate text-end text-[clamp(1.35rem,4.8vh,3.6rem)] leading-none" data-testid={`adhan-${row.key}`}>
              {row.adhan}
            </div>
            <div role="cell" className="tabular truncate text-end text-[clamp(2.4rem,9.4vh,7.5rem)] leading-none font-extrabold" data-testid={`iqamah-${row.key}`}>
              {row.iqamah ?? emptyIqamah}
            </div>
          </div>
        ))}
      </div>

      <footer className={`flex shrink-0 items-center justify-between gap-[2vw] px-[2.4vw] py-[1vh] text-[clamp(0.85rem,2.1vh,1.35rem)] leading-none ${muted}`}>
        <p className={`min-w-0 truncate ${light ? "text-[#1a1814]" : "text-[#f4f1ea]"}`}>
          {jumuahLine ? <span data-testid="lobby-jumuah">{jumuahLine}</span> : null}
          {jumuahLine && notice ? <span className={muted}> · </span> : null}
          {notice ? (
            <span data-testid="lobby-notice">
              <span className={`font-bold tracking-[0.12em] uppercase ${muted}`}>{noticeLabel}. </span>
              {notice}
            </span>
          ) : null}
          {!jumuahLine && !notice && entitled ? <span className={muted}>{published}</span> : null}
        </p>
        <p className="flex shrink-0 items-center gap-[1.2vw]">
          {donationUrl ? (
            <a href={donationUrl} className={`font-bold underline underline-offset-4 ${accent}`} rel="noopener noreferrer" target="_blank">
              {donationLabel}
            </a>
          ) : null}
          <span>mosques.world</span>
          <a href="?theme=dark" aria-current={theme === "dark" ? "true" : undefined} className={`font-bold underline-offset-4 ${theme === "dark" ? accent : ""}`}>
            {darkLabel}
          </a>
          <a href="?theme=light" aria-current={theme === "light" ? "true" : undefined} className={`font-bold underline-offset-4 ${theme === "light" ? accent : ""}`}>
            {lightLabel}
          </a>
        </p>
      </footer>

      {entitled ? null : (
        <p className={`shrink-0 truncate px-[2.4vw] py-[0.9vh] text-[clamp(0.8rem,1.9vh,1.15rem)] leading-none ${light ? "bg-[#1a1814] text-[#f7f4ee]" : "bg-[#f4f1ea] text-[#1a1814]"}`} data-testid="lobby-preview">
          {preview}{" "}
          <Link href={previewHref} className={`font-bold underline ${light ? "text-[#7ddec0]" : "text-[#0b6e4f]"}`}>
            {forCommittees}
          </Link>
        </p>
      )}
    </div>
  );
}
