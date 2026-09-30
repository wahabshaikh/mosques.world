import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, captcha, emailOTP, username } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import type { AppEnv } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { deliver, usesEmailSink } from "@/lib/email/send";
import { otpMail } from "@/lib/email/templates";
import { ulid } from "@/lib/id";
import { isNonProductionHost } from "@/lib/environment";
import { usernameProblem } from "@/lib/username";

const DEV_SECRET = "mosques-world-local-development-secret-not-for-production";

export function originFor(host: string): string {
  const bare = host.split(":")[0] ?? host;
  return `${bare === "localhost" || bare === "127.0.0.1" ? "http" : "https"}://${host}`;
}

export function googleEnabled(env: AppEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** Turnstile guards the OTP email endpoint when configured, except where the E2E email sink is on. */
export function captchaRequired(env: AppEnv, host: string): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY) && !usesEmailSink(env, host);
}

function createAuth(env: AppEnv, origin: string) {
  const host = new URL(origin).hostname;
  const nonProd = isNonProductionHost(host);
  const secret = env.BETTER_AUTH_SECRET ?? (nonProd ? DEV_SECRET : undefined);
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  const baseURL = nonProd ? origin : (env.BETTER_AUTH_URL ?? env.PUBLIC_BASE_URL);
  const plugins = [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value: string) => usernameProblem(value) === null,
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      async sendVerificationOTP({ email, otp }) {
        await deliver(env, host, otpMail(email, otp));
      },
    }),
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    ...(captchaRequired(env, host)
      ? [
          captcha({
            provider: "cloudflare-turnstile" as const,
            secretKey: env.TURNSTILE_SECRET_KEY ?? "",
            endpoints: ["/email-otp/send-verification-otp"],
          }),
        ]
      : []),
  ];
  return betterAuth({
    appName: "mosques.world",
    baseURL,
    secret,
    trustedOrigins: [baseURL, env.PUBLIC_BASE_URL].filter(Boolean),
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: "sqlite",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: { enabled: false },
    socialProviders: googleEnabled(env)
      ? { google: { clientId: env.GOOGLE_CLIENT_ID ?? "", clientSecret: env.GOOGLE_CLIENT_SECRET ?? "", prompt: "select_account" } }
      : {},
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Off: onboarding, bans and deletions must show up on the next request.
      cookieCache: { enabled: false },
    },
    // The RL_AUTH binding limits /api/auth writes per IP; better-auth's in-memory limiter is per isolate.
    rateLimit: { enabled: false },
    advanced: {
      database: { generateId: () => ulid() },
      useSecureCookies: !host.startsWith("127.") && host !== "localhost",
    },
    plugins,
  });
}

type Auth = ReturnType<typeof createAuth>;
const instances = new WeakMap<object, Map<string, Auth>>();

/** One better-auth instance per env object and origin (created lazily per isolate). */
export function getAuth(env: AppEnv, origin: string): Auth {
  let byOrigin = instances.get(env);
  if (!byOrigin) {
    byOrigin = new Map();
    instances.set(env, byOrigin);
  }
  let auth = byOrigin.get(origin);
  if (!auth) {
    auth = createAuth(env, origin);
    byOrigin.set(origin, auth);
  }
  return auth;
}
