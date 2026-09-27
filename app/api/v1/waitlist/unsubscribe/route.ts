import { appEnv } from "@/lib/db/client";
import { hashToken } from "@/lib/email/waitlist";

export const dynamic = "force-dynamic";

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) and the unsubscribe page's form. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token) {
    const form = await request.formData().catch(() => null);
    token = String(form?.get("token") ?? "");
  }
  if (!/^[0-9a-f]{64}$/.test(token)) return Response.json({ error: "That link is not valid." }, { status: 400 });
  const result = await appEnv()
    .DB.prepare(`UPDATE waitlist SET unsubscribed_at = coalesce(unsubscribed_at, ?) WHERE token_hash = ?`)
    .bind(Date.now(), await hashToken(token))
    .run();
  if (!result.meta.changes) return Response.json({ error: "That link is not valid." }, { status: 404 });
  if ((request.headers.get("accept") ?? "").includes("text/html")) {
    return Response.redirect(new URL("/waitlist/unsubscribe?done=1", url), 303);
  }
  return Response.json({ ok: true });
}
