import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { waitlist } from "@/lib/db/schema";
import { hashToken } from "@/lib/email/waitlist";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm", robots: { index: false } };

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <Message title="Missing link" body="Open the confirmation link from your email." />;
  const tokenHash = await hashToken(token);
  const rows = await db().select().from(waitlist).where(eq(waitlist.tokenHash, tokenHash)).limit(1);
  const row = rows[0];
  if (!row) return <Message title="Link not recognised" body="Ask for a new email from the mosque page." />;
  if (row.status !== "confirmed") {
    await db().update(waitlist).set({ status: "confirmed", confirmedAt: Date.now() }).where(eq(waitlist.id, row.id));
  }
  return <Message title="You are confirmed" body="We will email you when iqamah times are added for this mosque." />;
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-3 text-muted-foreground">{body}</p>
    </div>
  );
}
