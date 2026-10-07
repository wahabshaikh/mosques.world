import type { Metadata } from "next";
import Link from "next/link";
import { FREE_RATE_LIMIT, MAX_ACTIVE_KEYS } from "@/lib/api-keys";
import { ContentPage } from "../content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Developers",
  description: "A free, read-only API for mosques, adhan and community-verified iqamah times.",
  alternates: { canonical: "/developers" },
};

const ENDPOINTS = [
  {
    path: "GET /api/v1/public/places?lat=51.5155&lng=-0.0662&radius_km=2",
    text: "Places near a point (or pass bbox=west,south,east,north, at most 2° each way). GeoJSON, nearest first; kind and limit (≤ 500) are optional.",
  },
  { path: "GET /api/v1/public/places/{id|slug}", text: "One place with its standing iqamah times, Jumu'ah jamā'ahs and amenities, each with its trust state and number of confirmations." },
  {
    path: "GET /api/v1/public/places/{id|slug}/times?date=2026-11-17",
    text: "A day's calculated adhan and iqamah, exactly as the mosque page shows them, with where each iqamah came from (community or the mosque's monthly timetable).",
  },
];

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-xl bg-muted p-4 font-mono text-[13px] leading-5 whitespace-pre" dir="ltr">{children}</pre>;
}

export default async function DevelopersPage() {
  return (
    <ContentPage title="Developers">
      <p>
        Build on mosques.world: a free, read-only JSON API for mosques, calculated adhan times and community-verified iqamah times. The full description is
        in <a href="/api/v1/openapi.json" className="font-semibold underline">OpenAPI 3.1</a>.
      </p>
      <h2 className="pt-4 text-xl font-bold">Keys and limits</h2>
      <p>
        <Link href="/settings/developers" className="font-semibold underline">
          Create a key
        </Link>{" "}
        in your settings (up to {MAX_ACTIVE_KEYS}). Each key allows {FREE_RATE_LIMIT} requests a minute; past that you get <code>429</code> with{" "}
        <code>Retry-After</code>. Send it as a header:
      </p>
      <Code>{`curl -H "Authorization: Bearer mw_…" \\\n  "https://mosques.world/api/v1/public/places/markazi-mosque-whitechapel/times"`}</Code>
      <h2 className="pt-4 text-xl font-bold">Endpoints</h2>
      <ul className="space-y-4">
        {ENDPOINTS.map((endpoint) => (
          <li key={endpoint.path}>
            <code className="font-mono text-[13px] font-semibold break-all" dir="ltr">
              {endpoint.path}
            </code>
            <p className="mt-1">{endpoint.text}</p>
          </li>
        ))}
      </ul>
      <p>
        Times are local to the place, as 24-hour <code>HH:MM</code>, with ISO instants alongside. Iqamah times change: cache responses for minutes, not days,
        and show people when a time was last confirmed.
      </p>
      <h2 className="pt-4 text-xl font-bold">License</h2>
      <p>
        The data is published under the{" "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" className="underline" rel="noopener">
          Open Database License (ODbL)
        </a>
        . Attribute “© mosques.world contributors, © OpenStreetMap contributors” and share derived databases alike. For bulk use, download the{" "}
        <Link href="/open-data" className="font-semibold underline">
          monthly open-data export
        </Link>{" "}
        instead of crawling the API.
      </p>
    </ContentPage>
  );
}
