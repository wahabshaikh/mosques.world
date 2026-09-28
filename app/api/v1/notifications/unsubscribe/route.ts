import { appEnv } from "@/lib/db/client";
import { unsubscribe } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * RFC 8058 one-click unsubscribe (`List-Unsubscribe-Post`) and the unsubscribe page's form. The signed
 * token names the person, channel and topic, so no sign-in is needed.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token) {
    const form = await request.formData().catch(() => null);
    token = String(form?.get("token") ?? "");
  }
  const result = token.length < 400 ? await unsubscribe(appEnv(), token, url.hostname) : null;
  if (!result) return Response.json({ error: "That link is not valid." }, { status: 400 });
  if ((request.headers.get("accept") ?? "").includes("text/html")) {
    return Response.redirect(new URL(`/notifications/unsubscribe?done=${result.topic}`, url), 303);
  }
  return Response.json({ ok: true, topic: result.topic, channel: result.channel });
}
