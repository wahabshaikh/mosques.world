import type { Metadata } from "next";
import { ContentPage } from "../../content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.done === "1") {
    return (
      <ContentPage title="You are unsubscribed">
        <p>We won&apos;t email you about this mosque again.</p>
      </ContentPage>
    );
  }
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <ContentPage title="Unsubscribe">
      <p>Stop emails about iqamah times for this mosque?</p>
      <form method="post" action="/api/v1/waitlist/unsubscribe">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="mt-2 inline-flex h-11 items-center rounded-[12px] bg-secondary px-4 font-semibold text-secondary-foreground">
          Unsubscribe
        </button>
      </form>
    </ContentPage>
  );
}
