import type { Metadata } from "next";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <ContentPage title="About">
      <p>
        mosques.world helps you find a mosque or prayer space and see today&apos;s calculated adhan times. Iqamah times,
        the moment the congregation actually starts, are added by the community in a later release.
      </p>
      <p>
        The directory starts from OpenStreetMap. Calculated times are always labelled as calculated. We do not show a
        guess as a fact.
      </p>
    </ContentPage>
  );
}
