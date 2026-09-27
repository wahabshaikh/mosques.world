import type { Metadata } from "next";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "Terms", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <ContentPage title="Terms">
      <p>
        Adhan times are astronomical calculations. They are not the iqamah time of any mosque. Confirm locally before
        you travel.
      </p>
      <p>The directory is offered as-is. Places come from OpenStreetMap and may be missing or out of date.</p>
    </ContentPage>
  );
}
