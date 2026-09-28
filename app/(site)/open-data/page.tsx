import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appEnv } from "@/lib/db/client";
import { CSV_COLUMNS, publishedExports } from "@/lib/open-data";
import { phase8Enabled } from "@/lib/phase";
import { ContentPage } from "../content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Open data",
  description: "Download every mosque on mosques.world, with community-verified iqamah times, under the ODbL.",
  alternates: { canonical: "/open-data" },
};

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function month(period: string) {
  const [year = 2000, monthOfYear = 1] = period.split("-").map(Number);
  return new Date(Date.UTC(year, monthOfYear - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function OpenDataPage() {
  if (!(await phase8Enabled())) notFound();
  const exports = await publishedExports(appEnv().DB);
  return (
    <ContentPage title="Open data">
      <p>
        The directory is built on OpenStreetMap and by the community, so we give it back. Every month we publish every mosque and prayer room with its
        current iqamah times, Jumu&apos;ah and facilities, and how many people confirmed each, as GeoJSON and CSV.
      </p>
      {exports.length === 0 ? (
        <p className="rounded-2xl border border-border p-4 text-muted-foreground">The first export is being prepared. Check back soon.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border" data-testid="exports">
          {exports.map((item) => (
            <li key={item.period} className="flex flex-wrap items-center gap-3 p-4" data-period={item.period}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{month(item.period)}</span>
                <span className="text-muted-foreground">{item.rows.toLocaleString("en-GB")} places</span>
              </span>
              <a href={`/open-data/files/${item.geojson}`} className="font-semibold underline" download>
                GeoJSON · {size(item.bytes)}
              </a>
              <a href={`/open-data/files/${item.csv}`} className="font-semibold underline" download>
                CSV · {size(item.csvBytes)}
              </a>
            </li>
          ))}
        </ul>
      )}
      <h2 className="pt-4 text-xl font-bold">License</h2>
      <p>
        Made available under the{" "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" className="underline" rel="noopener">
          Open Database License (ODbL) 1.0
        </a>
        . Attribute “© mosques.world contributors, © OpenStreetMap contributors”, and share any database you derive from it under the same terms.
      </p>
      <h2 className="pt-4 text-xl font-bold">What&apos;s in it</h2>
      <p>
        One row per active or closed place. Iqamah columns are local 24-hour times, or <code>+N</code> for “N minutes after adhan”. Adhan times aren&apos;t
        included: they are calculated from the location and method columns. <code>confirmations</code> counts how many people back the current values.
      </p>
      <p className="font-mono text-[13px] leading-6 break-words" dir="ltr">
        {CSV_COLUMNS.join(", ")}
      </p>
      <p>
        There is no personal data: no accounts, contributors, votes, check-ins or free-text notes. For live data, use the{" "}
        <Link href="/developers" className="font-semibold underline">
          read API
        </Link>
        .
      </p>
    </ContentPage>
  );
}
