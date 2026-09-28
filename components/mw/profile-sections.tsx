import { CalendarDays, Camera, Check, Clock, Globe, MapPin, Moon, Plane, ShieldCheck, Star, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { avatarColor, initials } from "@/lib/people";
import { photoUrl } from "@/lib/photos";
import {
  CONTRIBUTION_FILTERS,
  prayerLabel,
  type BadgeView,
  type ContributionFilter,
  type ContributionRow,
  type RecentVisit,
} from "@/lib/profile/read";
import { describeValue, factLabel } from "@/lib/trust/facts";
import { TRUST_NAMES, type TrustLevel } from "@/lib/trust/engine";
import { relativeAge } from "@/lib/trust/summary";
import { cn, coverTint } from "@/lib/utils";

export function ProfileAvatar({ id, name, avatarKey, verified, size }: { id: string; name: string; avatarKey: string | null; verified: boolean; size: "lg" | "md" }) {
  const box = size === "lg" ? "size-[104px] text-[34px]" : "size-[84px] text-[28px] border-4 border-background";
  const tick = size === "lg" ? "size-8" : "size-[26px]";
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center rounded-full font-extrabold text-white", box)} style={{ background: avatarColor(id) }}>
      {avatarKey ? (
        <img src={photoUrl(avatarKey, 400)} alt="" className="size-full rounded-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
      {verified ? (
        <span
          className={cn("absolute right-[-2px] bottom-0.5 flex items-center justify-center rounded-full border-[3px] border-background bg-primary", tick)}
          title="Verified email"
        >
          <Check className="size-3.5 text-white" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : null}
    </span>
  );
}

export function TrustBadge({ level }: { level: number }) {
  if (level < 1) return null;
  return (
    <span className="flex items-center gap-1.5 text-[13px] font-bold text-primary">
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      {TRUST_NAMES[Math.min(level, 3) as TrustLevel]}
    </span>
  );
}

export function ProfileCard(props: {
  id: string;
  name: string;
  avatarKey: string | null;
  verified: boolean;
  trustLevel: number;
  stats: Array<{ value: number | string; label: string }>;
  own: boolean;
}) {
  return (
    <div className="grid grid-cols-2 items-center gap-5 rounded-3xl p-7 shadow-[0_6px_24px_rgba(31,29,26,0.14)]">
      <div className="flex min-w-0 flex-col items-center gap-2.5 text-center">
        <ProfileAvatar id={props.id} name={props.name} avatarKey={props.avatarKey} verified={props.verified} size="lg" />
        <span className="w-full text-[26px] leading-tight font-extrabold [overflow-wrap:anywhere]">{props.name}</span>
        <TrustBadge level={props.trustLevel} />
        {props.own ? (
          <Link href="/settings/profile" className="text-sm font-semibold underline">
            Edit profile
          </Link>
        ) : null}
      </div>
      <dl className="flex flex-col">
        {props.stats.map((stat, index) => (
          <div
            key={stat.label}
            className={cn("flex flex-col-reverse", index > 0 && "pt-3", index < props.stats.length - 1 && "border-b border-border pb-3")}
          >
            <dt className="text-xs font-semibold">{stat.label}</dt>
            <dd className="text-[22px] font-extrabold">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MosqueThumb({ seed, className }: { seed: string; className?: string }) {
  const tint = coverTint(seed);
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" fill={tint.bg} />
      <g fill={tint.fg}>
        <rect x="10" y="22" width="4" height="34" />
        <rect x="50" y="22" width="4" height="34" />
        <path d="M18 56 V38 Q18 26 32 22 Q46 26 46 38 V56Z" />
        <rect x="6" y="50" width="52" height="14" />
      </g>
    </svg>
  );
}

function visitWhen(visit: RecentVisit, today: string): string {
  const label = prayerLabel(visit.prayer);
  if (visit.localDate === today) return `${label} · Today`;
  const [year, month] = visit.localDate.split("-").map(Number);
  const when = new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  return `${label} · ${when}`;
}

export function RecentVisits({ visits, today }: { visits: RecentVisit[]; today: string }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visits.map((visit) => (
        <li key={visit.slug}>
          <Link href={`/m/${visit.slug}`} className="flex items-center gap-3 rounded-2xl border border-input p-2.5 hover:bg-muted/50">
            <MosqueThumb seed={visit.slug} className="size-16 shrink-0 rounded-xl" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-bold">{visit.name}</span>
              <span className="truncate text-[13px] text-muted-foreground">{visit.locality ?? visit.country}</span>
              <span className="text-xs font-bold text-primary">{visitWhen(visit, today)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const BADGE_ICONS: Record<string, LucideIcon> = { shield: ShieldCheck, moon: Moon, globe: Globe, star: Star, plane: Plane, calendar: CalendarDays };
const BADGE_COLORS: Record<string, string> = {
  trusted_verifier: "#0B6E4F",
  fajr_regular: "#4B4F9C",
  jumuah_traveller: "#A4520A",
  founding_contributor: "#1F1D1A",
  timetable_keeper: "#7A5C12",
};

export function BadgeTile({ badge }: { badge: BadgeView }) {
  const Icon = BADGE_ICONS[badge.icon] ?? Star;
  return (
    <li className={cn("flex flex-col gap-2.5 rounded-2xl p-[18px]", badge.earned ? "bg-muted" : "border border-dashed border-input")} data-badge={badge.key} data-earned={badge.earned}>
      <span
        className="flex size-11 items-center justify-center rounded-full"
        style={{ background: badge.earned ? (BADGE_COLORS[badge.key] ?? "#2F6F8F") : "#8E8C87" }}
      >
        <Icon className="size-[22px] text-white" aria-hidden="true" />
      </span>
      <span className="text-[15px] font-bold">
        {badge.name}
        {badge.earned ? null : <span className="sr-only"> (not earned yet)</span>}
      </span>
      <span className="text-[13px] leading-snug text-muted-foreground">{badge.earned ? badge.description : (badge.progress ?? badge.description)}</span>
    </li>
  );
}

const TYPE_STYLE: Record<string, { icon: LucideIcon; tint: string; ink: string }> = {
  confirmed: { icon: Check, tint: "bg-primary-soft", ink: "text-primary" },
  proposed: { icon: Clock, tint: "bg-warning-soft", ink: "text-warning" },
  promoted: { icon: Clock, tint: "bg-warning-soft", ink: "text-warning" },
  reverted: { icon: Clock, tint: "bg-warning-soft", ink: "text-warning" },
  place_added: { icon: MapPin, tint: "bg-[#ECEBF5] dark:bg-[#2B2A44]", ink: "text-[#4B4F9C] dark:text-[#B9B7F0]" },
  place_confirmed: { icon: MapPin, tint: "bg-[#ECEBF5] dark:bg-[#2B2A44]", ink: "text-[#4B4F9C] dark:text-[#B9B7F0]" },
  photo_added: { icon: Camera, tint: "bg-muted", ink: "text-foreground" },
};

function contributionText(row: ContributionRow): { what: string; detail: string | null } {
  const key = row.payload.key ?? "";
  const label = key ? factLabel(key, row.payload.qualifier) : "";
  const value = key ? describeValue(key, row.payload.value) : "";
  switch (row.type) {
    case "confirmed":
      return { what: `Confirmed ${label} ${value}`.trim(), detail: null };
    case "proposed":
      return { what: `Suggested ${label}`.trim(), detail: row.payload.held ? `${value} · awaiting review` : value || null };
    case "promoted":
      return { what: row.payload.replaced ? `Updated ${label}` : `Added ${label}`, detail: value ? `Now ${value} after community confirmation` : null };
    case "reverted":
      return { what: `Restored ${label}`, detail: null };
    case "place_added":
      return { what: "Added a place", detail: null };
    case "place_confirmed":
      return { what: "Confirmed a new place", detail: null };
    case "photo_added":
      return { what: "Added a photo", detail: null };
    default:
      return { what: "Updated a place", detail: null };
  }
}

export function ContributionList({
  rows,
  counts,
  active,
  basePath,
  now,
  more,
}: {
  rows: ContributionRow[];
  counts: Record<ContributionFilter, number>;
  active: ContributionFilter;
  basePath: string;
  now: number;
  more: string | null;
}) {
  const filters = (Object.keys(CONTRIBUTION_FILTERS) as ContributionFilter[]).filter((key) => key === "all" || counts[key] > 0);
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Contribution type" className="flex flex-wrap gap-2">
        {filters.map((key) => (
          <Link
            key={key}
            href={key === "all" ? `${basePath}#contributions` : `${basePath}?c=${key}#contributions`}
            scroll={false}
            aria-current={active === key ? "true" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold whitespace-nowrap",
              active === key ? "bg-foreground text-background" : "border border-[#C9C3B8] bg-background dark:border-border",
            )}
          >
            {CONTRIBUTION_FILTERS[key].label} · {counts[key]}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contributions yet.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => {
            const style = TYPE_STYLE[row.type] ?? TYPE_STYLE.photo_added!;
            const Icon = style.icon;
            const text = contributionText(row);
            return (
              <li key={row.id} className="flex items-center gap-3.5 border-b border-border py-4" data-contribution={row.type}>
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", style.tint)}>
                  <Icon className={cn("size-5", style.ink)} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px]">
                    <strong>{text.what}</strong>
                    {row.placeSlug ? (
                      <>
                        {" · "}
                        <Link href={`/m/${row.placeSlug}`} className="hover:underline">
                          {row.placeName}
                        </Link>
                      </>
                    ) : null}
                  </span>
                  {text.detail ? <span className="text-[13px] text-muted-foreground">{text.detail}</span> : null}
                </span>
                <span className="text-[13px] whitespace-nowrap text-muted-foreground">{relativeAge(row.createdAt, now)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {more ? (
        <Link href={more} scroll={false} className="self-start text-sm font-bold underline">
          Show more
        </Link>
      ) : null}
    </div>
  );
}
