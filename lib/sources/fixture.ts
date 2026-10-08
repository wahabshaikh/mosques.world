import type { MawaqitConf } from "./mawaqit";

/**
 * E2E stand-in for Mawaqit and Masjidal (non-production only): every page is a mosque at the given
 * point with fixed times, Fajr iqamah 15 minutes after a 05:30 adhan and so on.
 */
export function sourceFixtureFetcher(at: { lat: number; lng: number }): typeof fetch {
  const month = (row: string[]) => Object.fromEntries(Array.from({ length: 31 }, (_, day) => [String(day + 1), row]));
  const conf: MawaqitConf = {
    name: "Fixture Mosque",
    latitude: at.lat,
    longitude: at.lng,
    iqamaEnabled: true,
    calendar: Array.from({ length: 12 }, () => month(["05:30", "07:00", "12:30", "15:45", "18:20", "19:40"])),
    iqamaCalendar: Array.from({ length: 12 }, () => month(["+15", "13:15", "+15", "+5", "+15"])),
    jumua: "13:30",
  };
  return (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("mawaqit.net")) return new Response(`<script>var confData = ${JSON.stringify(conf)};</script>`, { status: 200 });
    return new Response(JSON.stringify({ status: "error", data: [] }), { status: 200 });
  }) as typeof fetch;
}
