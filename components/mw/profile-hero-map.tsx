import Link from "next/link";
import type { ReactNode } from "react";
import { landSvgPath, MAP_WIDTH, pinSize, project, viewBoxFor, WORLD_VIEW } from "@/lib/profile/map";
import type { ProfilePin } from "@/lib/profile/read";
import { cn } from "@/lib/utils";

const OCEAN = "#0E2A22";
const LAND = "#1D4A3A";
const LAND_EDGE = "#2A5E4B";
const GOLD = "#E9B949";

/**
 * The night world map at the top of a profile (spec 3.5 ProfileHeroMap): server-rendered SVG, so it
 * paints with the HTML and costs no JavaScript. Pins are sized by visits; the full-screen globe
 * lives at `/@username/map`.
 */
export function ProfileHeroMap({
  pins,
  showPins,
  overline,
  title,
  filters,
  tiles,
  actions,
  empty,
}: {
  pins: ProfilePin[];
  showPins: boolean;
  overline: string;
  title: ReactNode;
  filters?: ReactNode;
  tiles?: ReactNode;
  actions?: ReactNode;
  empty?: ReactNode;
}) {
  const view = showPins && pins.length > 0 ? viewBoxFor(pins) : WORLD_VIEW;
  const scale = view.width / MAP_WIDTH;
  return (
    <section aria-label="Map of mosques prayed in" className="relative isolate overflow-hidden rounded-none sm:rounded-3xl" style={{ background: OCEAN }}>
      <svg
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 -z-10 size-full"
        role="group"
        aria-label={showPins ? `World map with ${pins.length} ${pins.length === 1 ? "pin" : "pins"}` : "World map"}
      >
        <rect x="0" y="0" width="1000" height="500" fill={OCEAN} />
        <g stroke="#FFFFFF" strokeOpacity="0.06" strokeWidth="1" vectorEffect="non-scaling-stroke">
          <path d="M0 83.3H1000M0 166.7H1000M0 250H1000M0 333.3H1000M0 416.7H1000" vectorEffect="non-scaling-stroke" />
          <path
            d="M83.3 0V500M166.7 0V500M250 0V500M333.3 0V500M416.7 0V500M500 0V500M583.3 0V500M666.7 0V500M750 0V500M833.3 0V500M916.7 0V500"
            vectorEffect="non-scaling-stroke"
          />
        </g>
        <path d={landSvgPath()} fill={LAND} stroke={LAND_EDGE} strokeWidth="0.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {showPins
          ? pins.map((pin) => {
              const point = project(pin.lat, pin.lng);
              const size = pinSize(pin.count);
              return (
                <a key={pin.id} href={`/m/${pin.slug}`} data-testid="profile-pin" aria-label={`${pin.name}, ${pin.count} ${pin.count === 1 ? "visit" : "visits"}`}>
                  <circle cx={point.x} cy={point.y} r={size.halo * scale} fill={GOLD} fillOpacity="0.22" />
                  <circle cx={point.x} cy={point.y} r={size.dot * scale} fill={GOLD} stroke={OCEAN} strokeWidth={1.5 * scale} />
                </a>
              );
            })
          : null}
      </svg>
      <div className="flex min-h-[320px] flex-col justify-between gap-6 p-5 sm:min-h-[460px] sm:p-7 lg:min-h-[540px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold tracking-[1px] uppercase sm:text-[13px]" style={{ color: GOLD }}>
              {overline}
            </span>
            <h1 className="max-w-[440px] text-[26px] leading-[32px] font-extrabold tracking-[-0.6px] text-white sm:text-[34px] sm:leading-[40px]">{title}</h1>
          </div>
          {filters}
        </div>
        {empty}
        <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between")}>
          {tiles}
          {actions}
        </div>
      </div>
    </section>
  );
}

export function MapFilterPills({ items }: { items: Array<{ label: string; href: string; active: boolean }> }) {
  return (
    <nav aria-label="Map filter" className="flex w-fit gap-1.5 rounded-full bg-white/10 p-1">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "true" : undefined}
          className={cn("rounded-full px-3.5 py-2 text-[13px] font-bold", item.active ? "bg-white text-[#1F1D1A]" : "text-white hover:bg-white/10")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function MapStatTiles({ tiles }: { tiles: Array<{ value: number | string; label: string }> }) {
  return (
    <dl className="flex flex-wrap gap-2.5">
      {tiles.map((tile, index) => (
        <div key={tile.label} className={cn("flex-col-reverse gap-0.5 rounded-[14px] bg-white/10 px-4 py-3", index < 2 ? "flex" : "hidden sm:flex")}>
          <dt className="text-xs text-[#D5E3DC]">{tile.label}</dt>
          <dd className="text-[22px] font-extrabold text-white">{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}
