import { and, eq } from "drizzle-orm";
import { appEnv, db } from "@/lib/db/client";
import { place, waitlist } from "@/lib/db/schema";
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
  const confirmUrl = `${env.PUBLIC_BASE_URL}/waitlist/confirm?token=${token}`;
  const message = waitlistMessage({ placeName: found.name, confirmUrl });
  const sink = env.EMAIL_SINK === "1" || host === "localhost" || host === "127.0.0.1";
  if (sink) {
    await env.CACHE.put(
      "email:latest",
      JSON.stringify({ to: email, ...message }),
      { expirationTtl: 60 * 60 * 24 },
    );
  } else if (env.Q_EMAIL) {
    await env.Q_EMAIL.send({ to: email, subject: message.subject, text: message.text });
  } else if (env.EMAIL) {
    await env.EMAIL.send({
      from: "no-reply@mail.mosques.world",
      to: email,
      subject: message.subject,
      text: message.text,
    });
  }
  return Response.json({ ok: true });
}
