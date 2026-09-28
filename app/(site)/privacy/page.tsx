import type { Metadata } from "next";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy">
      <h2 className="text-lg font-bold">Accounts</h2>
      <p>
        When you sign in we store your email address, the username and display name you choose, and your optional home city
        (a city name and country only). If you sign in with Google we store your Google account identifier and the name and
        email Google shares. We keep a session record (browser and network address) so you stay signed in.
      </p>
      <h2 className="text-lg font-bold">Contributions</h2>
      <p>
        Times you add, confirm or dispute, the source you picked, and reports you send are stored with your account. Your
        username appears next to your contributions and in each mosque&apos;s public history and activity feed. Your trust level
        is derived from how many of your contributions are accepted.
      </p>
      <h2 className="text-lg font-bold">Photos and places you add</h2>
      <p>
        Photos are re-encoded when you upload them: location (GPS), camera details and all other metadata are removed, and the
        original file is deleted once the resized copies exist. Photos may be checked by an automated image classifier and by
        moderators before they appear. Places you add, and the times and facilities you mark, are shown with your username.
        When you search for a place to add, your search text is sent to Google Places; we keep only Google&apos;s place
        identifier.
      </p>
      <h2 className="text-lg font-bold">Check-ins, your map and saved places</h2>
      <p>
        When you tap &ldquo;I prayed here&rdquo; we store the mosque, the prayer and the date. If you choose to verify with
        your location, your device sends its position once; we compute the distance to the mosque, keep only whether you were
        within 150 m (and that distance in metres), and never store your coordinates. Your profile map at
        mosques.world/@username is public by default. In <strong>Settings → Privacy</strong> you can show only your countries,
        make check-ins private, make your whole profile private (name and contributions only), or delete any check-in.
        Saved places are visible only to you.
      </p>
      <h2 className="text-lg font-bold">Your choices</h2>
      <p>
        In <strong>Settings → Account</strong> you can download everything we hold about you as JSON, or delete your account.
        Deleting removes your email, name, username and profile. Your past confirmations remain as contributions from a
        &ldquo;former member&rdquo;, so each mosque&apos;s history stays consistent.
      </p>
      <h2 className="text-lg font-bold">Waitlist</h2>
      <p>
        If you join a mosque&apos;s waitlist, we store your email, the mosque you asked about, and whether you confirmed. We use it
        only to tell you when iqamah times open for that mosque, and every such email has an unsubscribe link.
      </p>
      <h2 className="text-lg font-bold">Location and analytics</h2>
      <p>
        The map can use your browser location if you allow it. That position is used to centre the search and is not stored on
        the server. Approximate location from the network (Cloudflare&apos;s IP geolocation) centres the first view.
      </p>
      <p>
        Analytics, if you allow them, record page views and goals such as search, sign-up and confirming a time. They do not
        include your email or exact coordinates.
      </p>
    </ContentPage>
  );
}
