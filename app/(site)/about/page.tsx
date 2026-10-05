import type { Metadata } from "next";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <ContentPage title="About">
      <p>
        mosques.world helps you find a mosque or prayer space and know when the congregation actually prays. Adhan
        times are calculated for every place; iqamah times, Jumu&apos;ah and facilities such as a women&apos;s section are
        added and confirmed by people who pray there, and every time shows who checked it and when.
      </p>
      <p>
        The directory starts from OpenStreetMap. Calculated times are always labelled as calculated. We do not show a
        guess as a fact.
      </p>
    </ContentPage>
  );
}
