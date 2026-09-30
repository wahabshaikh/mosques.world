import { makeSignature } from "better-auth/crypto";
import { z } from "zod";
import { getAuth, originFor } from "@/lib/auth";
import { appEnv } from "@/lib/db/client";
import { usesEmailSink } from "@/lib/email/send";
import { ulid } from "@/lib/id";
import { usernameProblem } from "@/lib/username";

export const dynamic = "force-dynamic";

const input = z.object({
  email: z.string().email(),
  /** Omit to derive one from the email. Ignored when `onboarded` is false. */
  username: z.string().optional(),
  name: z.string().min(1).max(80).optional(),
  /** false leaves the account mid-signup (no username), so tests can drive onboarding. */
  onboarded: z.boolean().default(true),
  trustLevel: z.number().int().min(0).max(3).optional(),
  role: z.enum(["user", "moderator", "admin"]).optional(),
  ageDays: z.number().min(0).max(3650).optional(),
});

function usernameFor(email: string): string {
  const local = (email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z0-9._]/g, "").replace(/\.+/g, ".");
  const base = local.replace(/^\.|\.$/g, "").slice(0, 22) || "tester";
  return `${base}_${ulid().slice(-6).toLowerCase()}`;
}

/**
 * Preview/local only (same gate as the email sink): signs a person in with one request.
 * Creates the account if it doesn't exist, applies the fixture fields, opens a real better-auth
 * session and sets its signed cookie. The UI OTP flow keeps its own E2E test; everything else
 * uses this to skip it.
 */
export async function POST(request: Request) {
  const env = appEnv();
  const url = new URL(request.url);
  if (!usesEmailSink(env, url.hostname)) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad session request", issues: parsed.error.issues }, { status: 400 });
  const body = parsed.data;
  const email = body.email.toLowerCase();
  const database = env.DB;
  const now = Date.now();

  let row = await database.prepare(`SELECT id, username FROM user WHERE email = ?`).bind(email).first<{ id: string; username: string | null }>();
  if (!row) {
    const id = ulid(now);
    await database
      .prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`)
      .bind(id, body.name ?? email.split("@")[0] ?? "Tester", email, now, now)
      .run();
    row = { id, username: null };
  }
  if (body.onboarded && !row.username) {
    const username = body.username ?? usernameFor(email);
    const problem = usernameProblem(username);
    if (problem) return Response.json({ error: problem }, { status: 400 });
    try {
      await database
        .prepare(
          `UPDATE user SET username = ?, display_username = ?, name = coalesce(?, name), guidelines_accepted_at = coalesce(guidelines_accepted_at, ?), updated_at = ? WHERE id = ?`,
        )
        .bind(username, username, body.name ?? username, now, now, row.id)
        .run();
    } catch {
      return Response.json({ error: "That username is taken." }, { status: 409 });
    }
    row.username = username;
  }
  if (body.trustLevel !== undefined) {
    await database.prepare(`UPDATE user SET trust_level = ?, trust_override = ? WHERE id = ?`).bind(body.trustLevel, body.trustLevel, row.id).run();
  }
  if (body.role) await database.prepare(`UPDATE user SET role = ? WHERE id = ?`).bind(body.role, row.id).run();
  if (body.ageDays !== undefined) {
    await database.prepare(`UPDATE user SET created_at = ? WHERE id = ?`).bind(now - body.ageDays * 86_400_000, row.id).run();
  }

  const host = request.headers.get("host") ?? url.host;
  const context = await getAuth(env, originFor(host)).$context;
  const session = await context.internalAdapter.createSession(row.id);
  const cookie = context.authCookies.sessionToken;
  const value = `${session.token}.${await makeSignature(session.token, context.secret)}`;
  const attributes = [
    `Path=${cookie.attributes.path ?? "/"}`,
    "HttpOnly",
    `SameSite=${cookie.attributes.sameSite ?? "Lax"}`,
    `Max-Age=${cookie.attributes.maxAge ?? 60 * 60 * 24 * 30}`,
    ...(cookie.attributes.secure ? ["Secure"] : []),
  ];
  const headers = new Headers({ "set-cookie": `${cookie.name}=${encodeURIComponent(value)}; ${attributes.join("; ")}` });
  return Response.json(
    {
      ok: true,
      user: { id: row.id, email, username: row.username },
      cookie: { name: cookie.name, value, secure: Boolean(cookie.attributes.secure) },
    },
    { headers },
  );
}
