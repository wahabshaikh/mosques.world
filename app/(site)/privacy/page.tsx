import type { Metadata } from "next";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy">
      <p>
        Phase 1 has no accounts. If you join the waitlist, we store your email, the mosque you asked about, and whether
        you confirmed the message. We use that only to tell you when iqamah times are added.
      </p>
      <p>
        The map can use your browser location if you allow it. That position is used to centre the search and is not
        stored on the server.
      </p>
      <p>
        Approximate location from the network (Cloudflare&apos;s IP geolocation) centres the first view. Analytics, if you
        allow them, record page views and goals such as search and directions. They do not include your email or exact
        coordinates.
      </p>
    </ContentPage>
  );
}
