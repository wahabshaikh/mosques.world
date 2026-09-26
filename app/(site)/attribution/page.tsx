import type { Metadata } from "next";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "Attribution", alternates: { canonical: "/attribution" } };

export default function AttributionPage() {
  return (
    <ContentPage title="Attribution">
      <p>© OpenStreetMap contributors. The directory is a derivative database and will be published under the ODbL.</p>
      <p>Map tiles: OpenFreeMap © OpenMapTiles, data from OpenStreetMap.</p>
      <p>Place search may use Google Places. Results are not stored beyond a short-lived cache of coordinates for the map.</p>
      <p>Calculated times use adhan-js (MIT). Country outlines for later profile maps use Natural Earth (public domain).</p>
    </ContentPage>
  );
}
