import type { DirectoryPlace } from "@/lib/db/queries";
import { madhabOf } from "@/lib/places/present";
import { getPrayerDay } from "@/lib/prayer/times";
import { IQAMAH_PRAYERS } from "@/lib/trust/facts";
import { iqamahToday, parseSummary } from "@/lib/trust/summary";

/**
 * iCalendar feeds (spec P7): iqamah events in the place's own time zone, with a VTIMEZONE built for
 * the feed's window so any RFC 5545 client (and parser) resolves the times correctly.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Offset of `timeZone` at `at`, in minutes east of UTC. */
export function offsetMinutes(timeZone: string, at: number): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(new Date(at)).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}${String(absolute % 60).padStart(2, "0")}`;
}

function localStamp(at: number, offset: number): string {
  return new Date(at + offset * 60_000).toISOString().replace(/[-:]/g, "").slice(0, 15);
}

/** VTIMEZONE covering [from, to]: one observance, plus one per UTC-offset change found (to the minute). */
export function vtimezone(timeZone: string, from: number, to: number): string[] {
  const start = offsetMinutes(timeZone, from);
  const lines = ["BEGIN:VTIMEZONE", `TZID:${timeZone}`];
  const observance = (kind: "STANDARD" | "DAYLIGHT", onset: string, fromOffset: number, toOffset: number) => [
    `BEGIN:${kind}`,
    `DTSTART:${onset}`,
    `TZOFFSETFROM:${formatOffset(fromOffset)}`,
    `TZOFFSETTO:${formatOffset(toOffset)}`,
    `END:${kind}`,
  ];
  lines.push(...observance("STANDARD", "19700101T000000", start, start));
  let previous = start;
  for (let at = from + DAY; at <= to + DAY; at += DAY) {
    const offset = offsetMinutes(timeZone, at);
    if (offset === previous) continue;
    // Narrow the change down to the minute between the two probes.
    let low = at - DAY;
    let high = at;
    while (high - low > 60_000) {
      const middle = Math.floor((low + high) / 2 / 60_000) * 60_000;
      if (offsetMinutes(timeZone, middle) === previous) low = middle;
      else high = middle;
    }
    lines.push(...observance(offset > previous ? "DAYLIGHT" : "STANDARD", localStamp(high, previous), previous, offset));
    previous = offset;
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds content lines at 75 octets (RFC 5545 §3.1). */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    if (size + length > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += length;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export type CalendarEvent = { uid: string; date: string; time: string; minutes: number; summary: string; description: string; location: string | null; url: string };

const LABELS: Record<string, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

/** Iqamah events for `days` days from `now` (timetable values for a date win over usual times). */
export function placeEvents(place: DirectoryPlace, now: number, days: number, base: string, timetable: Map<string, string> = new Map()): CalendarEvent[] {
  const summary = parseSummary(place.iqamahSummaryJson);
  const events: CalendarEvent[] = [];
  for (let index = 0; index < days; index += 1) {
    const day = getPrayerDay({
      lat: place.lat,
      lng: place.lng,
      timeZone: place.timezone,
      method: place.calcMethod,
      madhab: madhabOf(place.asrMadhab),
      highLat: place.highLatRule,
      now: new Date(now + index * DAY),
    });
    const iqamah = iqamahToday(summary, day);
    for (const prayer of IQAMAH_PRAYERS) {
      const time = timetable.get(`${day.date}|${prayer}`) ?? iqamah[prayer]?.time;
      if (!time) continue;
      const label = prayer === "dhuhr" && day.jumuah ? "Jumu'ah" : LABELS[prayer];
      events.push({
        uid: `${place.id}-${day.date}-${prayer}@mosques.world`,
        date: day.date,
        time,
        minutes: 15,
        summary: `${label} iqamah · ${place.name}`,
        description: `Community-verified iqamah time. Check ${base}/m/${place.slug} before you go.`,
        location: [place.name, place.address].filter(Boolean).join(", "),
        url: `${base}/m/${place.slug}`,
      });
    }
  }
  return events;
}

function eventLines(event: CalendarEvent, timeZone: string, stamp: string): string[] {
  const [hour, minute] = event.time.split(":").map(Number);
  const start = `${event.date.replace(/-/g, "")}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}00`;
  return [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${timeZone}:${start}`,
    `DURATION:PT${event.minutes}M`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    `URL:${event.url}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

/** A complete VCALENDAR; events are grouped by time zone, each with its own VTIMEZONE. */
export function calendar(input: { name: string; groups: Array<{ timeZone: string; events: CalendarEvent[] }>; now: number; days: number }): string {
  const stamp = new Date(input.now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const zones = [...new Set(input.groups.map((group) => group.timeZone))];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mosques.world//Iqamah times//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.name)}`,
    ...(zones.length === 1 ? [`X-WR-TIMEZONE:${zones[0]}`] : []),
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
    ...zones.flatMap((zone) => vtimezone(zone, input.now - DAY, input.now + (input.days + 1) * DAY)),
    ...input.groups.flatMap((group) => group.events.flatMap((event) => eventLines(event, group.timeZone, stamp))),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`calendar:${value}`)));
  let binary = "";
  for (const byte of mac.slice(0, 18)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Calendar apps can't sign in, so the personal feed URL carries a signed, revocable-by-rotation token. */
export async function feedToken(secret: string, userId: string): Promise<string> {
  return `${userId}.${await hmac(secret, userId)}`;
}

export async function readFeedToken(secret: string, token: string): Promise<string | null> {
  const [userId, mac] = token.split(".");
  if (!userId || !mac || !/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return null;
  return (await hmac(secret, userId)) === mac ? userId : null;
}
