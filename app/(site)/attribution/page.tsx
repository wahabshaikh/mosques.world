import type { Metadata } from "next";
import Link from "next/link";
import { phase8Enabled } from "@/lib/phase";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "Attribution", alternates: { canonical: "/attribution" } };

export default async function AttributionPage() {
  const open = await phase8Enabled().catch(() => false);
  return (
    <ContentPage title="Attribution">
      {open ? (
        <p>
          © OpenStreetMap contributors. The directory is a derivative database published under the ODbL:{" "}
          <Link href="/open-data" className="underline">
            download it every month
          </Link>
          .
        </p>
      ) : (
        <p>© OpenStreetMap contributors. The directory is a derivative database and will be published under the ODbL.</p>
      )}
      <p>Map tiles: OpenFreeMap © OpenMapTiles, data from OpenStreetMap.</p>
      <p>Place search may use Google Places. Results are not stored beyond a short-lived cache of coordinates for the map.</p>
      <p>Calculated times use adhan-js (MIT). Country outlines for later profile maps use Natural Earth (public domain).</p>
      {open ? <p>Arabic-script text uses Noto Naskh Arabic and Amiri (SIL Open Font License).</p> : null}
    </ContentPage>
  );
}
