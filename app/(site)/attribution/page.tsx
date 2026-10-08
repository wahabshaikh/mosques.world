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
      <p>
        A mosque&apos;s own adhan and iqamah times, where it publishes them, come from its page on{" "}
        <a className="underline" href="https://mawaqit.net" rel="noopener">
          Mawaqit
        </a>{" "}
        or its{" "}
        <a className="underline" href="https://masjidal.com" rel="noopener">
          Masjidal
        </a>{" "}
        timetable, and are credited next to the times on the mosque&apos;s page. The mosque keeps them current; we refresh them nightly.
      </p>
      <p>Google Places is not used for any data at the moment.</p>
      <p>Calculated times use adhan-js (MIT). Country outlines for later profile maps use Natural Earth (public domain).</p>
      <p>Arabic-script text uses Noto Naskh Arabic and Amiri (SIL Open Font License).</p>
    </ContentPage>
  );
}
