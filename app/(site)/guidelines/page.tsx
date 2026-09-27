import type { Metadata } from "next";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "Guidelines", alternates: { canonical: "/guidelines" } };

export default function GuidelinesPage() {
  return (
    <ContentPage title="Guidelines">
      <p>This is a draft for the contribution tools that open in the next phase.</p>
      <p>Describe times and facilities. Do not rate mosques, and do not add sectarian labels.</p>
      <p>Confirm a time only when you have seen the board, an announcement, or heard it from the mosque.</p>
    </ContentPage>
  );
}
