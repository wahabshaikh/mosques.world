import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, originFor } from "@/lib/auth";
import { appEnv, db } from "@/lib/db/client";
import { user as userTable, type UserRow } from "@/lib/db/schema";
import { asTrustLevel, type TrustLevel } from "@/lib/trust/engine";
import type { Actor } from "@/lib/trust/store";

export type SessionUser = Omit<UserRow, "trustLevel" | "createdAt" | "updatedAt"> & {
  trustLevel: TrustLevel;
  createdAt: number;
};

export function isModerator(user: Pick<SessionUser, "role"> | null): boolean {
  return user?.role === "moderator" || user?.role === "admin";
}

export function actorOf(user: SessionUser): Actor {
  return { id: user.id, trustLevel: asTrustLevel(user.trustLevel), createdAt: user.createdAt, role: user.role };
}

/** Resolves the signed-in user from request headers, re-reading the row so trust and bans are fresh. */
export async function userFromHeaders(requestHeaders: Headers): Promise<SessionUser | null> {
  const host = requestHeaders.get("host") ?? "mosques.world";
  const env = appEnv();
  const session = await getAuth(env, originFor(host))
    .api.getSession({ headers: requestHeaders })
    .catch(() => null);
  if (!session?.user?.id) return null;
  const rows = await db().select().from(userTable).where(eq(userTable.id, session.user.id)).limit(1);
  const row = rows[0];
  if (!row || row.deletedAt || row.banned) return null;
  return {
    ...row,
    trustLevel: asTrustLevel(row.trustLevel),
    createdAt: row.createdAt.getTime(),
  };
}

export async function currentUser(): Promise<SessionUser | null> {
  return userFromHeaders(new Headers(await headers()));
}

export function signInPath(next: string): string {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

/** Only same-site relative paths are allowed as a post-sign-in destination. */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export async function requireUser(next: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(signInPath(next));
  if (!user.username) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireModerator(next: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!isModerator(user)) redirect("/");
  return user;
}

export function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

/** Mutating route handlers accept only same-origin browser requests (spec 2.7 CSRF). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return false;
  }
}

type Guarded = { user: SessionUser } | { response: Response };

export async function apiUser(request: Request, options: { mutate?: boolean; needsUsername?: boolean } = {}): Promise<Guarded> {
  if (options.mutate && !sameOrigin(request)) return { response: jsonError("Cross-site request refused.", 403) };
  const user = await userFromHeaders(request.headers);
  if (!user) return { response: jsonError("Sign in to continue.", 401) };
  if (options.needsUsername !== false && !user.username) return { response: jsonError("Choose a username first.", 403) };
  return { user };
}

export async function apiModerator(request: Request, options: { mutate?: boolean } = {}): Promise<Guarded> {
  const guarded = await apiUser(request, options);
  if ("response" in guarded) return guarded;
  if (!isModerator(guarded.user)) return { response: jsonError("Moderators only.", 403) };
  return guarded;
}
