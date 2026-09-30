import { and, eq } from "drizzle-orm";
import { appEnv, db } from "@/lib/db/client";
import { place, waitlist } from "@/lib/db/schema";
import { deliver } from "@/lib/email/send";
import { linkBase } from "@/lib/environment";
import { hashToken, newToken, normalizeEmail, waitlistMessage } from "@/lib/email/waitlist";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; placeId?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  const placeId = body?.placeId ?? "";
  if (!email || !placeId) return Response.json({ error: "Enter a valid email." }, { status: 400 });

  const rows = await db().select().from(place).where(eq(place.id, placeId)).limit(1);
  const found = rows[0];
  if (!found) return Response.json({ error: "That mosque was not found." }, { status: 404 });

  const existing = await db()
    .select()
    .from(waitlist)
    .where(and(eq(waitlist.email, email), eq(waitlist.placeId, placeId)))
    .limit(1);
  if (existing[0]?.status === "confirmed") return Response.json({ ok: true, already: true });

  const token = newToken();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  if (existing[0]) {
    await db()
      .update(waitlist)
      .set({ tokenHash, status: "pending", createdAt: now, confirmedAt: null })
      .where(eq(waitlist.id, existing[0].id));
  } else {
    await db().insert(waitlist).values({
      id: crypto.randomUUID(),
      email,
      placeId,
      tokenHash,
      status: "pending",
      createdAt: now,
    });
  }

  const env = appEnv();
  const host = new URL(request.url).hostname;
  const confirmUrl = `${linkBase(request.url, env.PUBLIC_BASE_URL)}/waitlist/confirm?token=${token}`;
  await deliver(env, host, { to: email, ...waitlistMessage({ placeName: found.name, confirmUrl }) });
  return Response.json({ ok: true });
}
