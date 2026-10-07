import { appEnv } from "@/lib/db/client";
import { usesEmailSink } from "@/lib/email/send";

export const dynamic = "force-dynamic";

/** Preview/local only (same gate as the email sink): throws so Sentry's preview wiring can be checked. */
export function GET(request: Request) {
  if (!usesEmailSink(appEnv(), new URL(request.url).hostname)) return Response.json({ error: "Not found" }, { status: 404 });
  throw new Error("Sentry preview check");
}
