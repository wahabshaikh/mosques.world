import type { Metadata } from "next";
import { ContentPage } from "../content";

export const metadata: Metadata = { title: "Community guidelines", alternates: { canonical: "/guidelines" } };

export default function GuidelinesPage() {
  return (
    <ContentPage title="Community guidelines">
      <p>
        mosques.world works because people who pray at a mosque keep its times accurate for everyone else. These guidelines keep
        that trust intact.
      </p>
      <h2 className="pt-2 text-lg font-bold">Only mark what you&apos;ve seen yourself</h2>
      <p>
        Confirm or change a time only when you have seen the timetable board, heard the announcement, asked the imam or
        committee, or read it on the mosque&apos;s own website or socials. Say which one when you submit. &ldquo;Not sure&rdquo; is
        always fine: leave the time for someone who knows.
      </p>
      <h2 className="pt-2 text-lg font-bold">Confirming beats editing</h2>
      <p>
        If a time is still right, confirm it. A quick &ldquo;yes, still 4:30&rdquo; keeps it fresh for travellers. When the mosque
        announces a change from a future date, set <strong>Applies from</strong> to that date so today&apos;s times stay correct.
      </p>
      <h2 className="pt-2 text-lg font-bold">How times go live</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>A first time for a prayer goes live straight away, marked <em>Unverified</em>.</li>
        <li>It becomes <em>Verified</em> when at least two people have confirmed it recently.</li>
        <li>
          A change to an existing time shows as <em>Change reported</em> until enough people confirm it, then it replaces the old
          value. The old value stays in the public history.
        </li>
        <li>
          Changes to verified times from brand-new accounts wait for a trusted member or 48 hours without objection. Trust grows as
          your contributions are accepted.
        </li>
        <li>Times not confirmed for 60 days show as <em>Needs check</em>.</li>
      </ul>
      <h2 className="pt-2 text-lg font-bold">Describe places, not communities</h2>
      <p>
        We describe facilities and times. Do not rate or rank mosques, add sectarian labels, or post personal information about
        anyone. Usernames must not impersonate a mosque, imam or another person.
      </p>
      <h2 className="pt-2 text-lg font-bold">Moderation</h2>
      <p>
        Moderators can hold, reject or revert changes and suspend accounts that add false times, spam or abuse. Every moderator
        action is recorded in an audit log. If you spot a problem, use <strong>Report a timing change</strong> on the mosque page.
      </p>
    </ContentPage>
  );
}
