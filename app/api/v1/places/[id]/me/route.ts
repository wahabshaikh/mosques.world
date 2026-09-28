import { appEnv } from "@/lib/db/client";
import { userFromHeaders } from "@/lib/session";
import { myVotes } from "@/lib/trust/read";

export const dynamic = "force-dynamic";

/** Per-viewer state for a cached mosque page: who is signed in, how they voted and whether they saved it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await userFromHeaders(request.headers);
  const headers = { "cache-control": "private, no-store" };
  if (!user) return Response.json({ user: null, votes: {} }, { headers });
  const database = appEnv().DB;
  const [votes, saved] = await Promise.all([
    myVotes(database, id, user.id),
    database.prepare(`SELECT 1 AS found FROM saved_place WHERE user_id = ? AND place_id = ?`).bind(user.id, id).first<{ found: number }>(),
  ]);
  return Response.json(
    { user: { username: user.username, trustLevel: user.trustLevel, role: user.role }, votes, saved: Boolean(saved) },
    { headers },
  );
}
