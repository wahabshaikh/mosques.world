import { appEnv } from "@/lib/db/client";
import { userFromHeaders } from "@/lib/session";
import { myVotes } from "@/lib/trust/read";

export const dynamic = "force-dynamic";

/** Per-viewer state for a cached mosque page: who is signed in and how they voted. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await userFromHeaders(request.headers);
  const headers = { "cache-control": "private, no-store" };
  if (!user) return Response.json({ user: null, votes: {} }, { headers });
  const votes = await myVotes(appEnv().DB, id, user.id);
  return Response.json(
    { user: { username: user.username, trustLevel: user.trustLevel, role: user.role }, votes },
    { headers },
  );
}
