import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "Attribution", alternates: { canonical: "/attribution" } };

export default async function AttributionPage() {
  return (
    <ContentPage title="Attribution">
      <p>
        © OpenStreetMap contributors. The directory is a derivative database published under the ODbL:{" "}
        <Link href="/open-data" className="underline">
          download it every month
        </Link>
        .
      </p>
      <p>Map tiles: OpenFreeMap © OpenMapTiles, data from OpenStreetMap.</p>
      <p>
        Place and city search uses Photon by komoot, built on OpenStreetMap data. Mosques we have not listed yet are loaded from OpenStreetMap
        through the Overpass API the first time someone looks at their area.
      </p>
      <p>
        Descriptions, founding years and some websites come from Wikidata (CC0) and Wikipedia (CC BY-SA). Photos of places without
        community photos come from Wikimedia Commons under free licences; each one is credited on its page with its author and licence.
      </p>
      <p>Place search may use Google Places. Results are not stored beyond a short-lived cache of coordinates for the map.</p>
      <p>Calculated times use adhan-js (MIT). Country outlines for later profile maps use Natural Earth (public domain).</p>
      <p>Arabic-script text uses Noto Naskh Arabic and Amiri (SIL Open Font License).</p>
    </ContentPage>
  );
}
