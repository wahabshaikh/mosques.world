import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "Terms", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <ContentPage title="Terms">
      <p>
        Adhan times are astronomical calculations. They are not the iqamah time of any mosque. Iqamah times are added and
        confirmed by the community and may be out of date: each shows who confirmed it and when. Confirm locally before you travel.
      </p>
      <p>The directory is offered as-is. Places come from OpenStreetMap and may be missing or out of date.</p>
      <p>
        By contributing you agree to the <Link href="/guidelines" className="underline">community guidelines</Link> and license
        your contributions (times and confirmations) under the Open Database License, so they can be shared as open data with
        the rest of the directory.
      </p>
      <p>We may hold, reject or remove contributions and suspend accounts that break the guidelines.</p>
    </ContentPage>
  );
}
