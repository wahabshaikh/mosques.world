import { beforeEach, describe, expect, it } from "vitest";
import { env } from "@/lib/testing/cloudflare-workers";
import { createTestD1 } from "@/lib/testing/d1";
import { captchaRequired, getAuth, googleEnabled, originFor } from "./auth";
import { phase2EnabledFor, phase3EnabledFor } from "./phase";
import { actorOf, apiModerator, apiUser, isModerator, jsonError, safeNext, sameOrigin, signInPath, userFromHeaders } from "./session";

function resetEnv(values: Record<string, unknown>) {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, values);
}

describe("session helpers", () => {
  beforeEach(() => resetEnv({ DB: createTestD1().d1, PUBLIC_BASE_URL: "https://mosques.world", CACHE: {}, EMAIL_SINK: "1" }));

  it("guards redirects and origins", () => {
    expect(safeNext("/m/x?intent=vote:1:1")).toBe("/m/x?intent=vote:1:1");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil")).toBe("/");
    expect(safeNext("https://evil.example", "/home")).toBe("/home");
    expect(safeNext(null)).toBe("/");
    expect(signInPath("/m/a b")).toBe("/sign-in?next=%2Fm%2Fa%20b");
    const same = new Request("https://mosques.world/api", { method: "POST", headers: { origin: "https://mosques.world", host: "mosques.world" } });
    expect(sameOrigin(same)).toBe(true);
    expect(sameOrigin(new Request("https://mosques.world/api", { method: "POST", headers: { origin: "https://evil.example" } }))).toBe(false);
    expect(sameOrigin(new Request("https://mosques.world/api", { method: "POST" }))).toBe(false);
    expect(sameOrigin(new Request("https://mosques.world/api", { method: "POST", headers: { origin: "not a url" } }))).toBe(false);
  });

  it("maps roles and actors", async () => {
    expect(isModerator({ role: "moderator" })).toBe(true);
    expect(isModerator({ role: "admin" })).toBe(true);
    expect(isModerator({ role: "user" })).toBe(false);
    expect(isModerator(null)).toBe(false);
    expect(actorOf({ id: "u", trustLevel: 2, createdAt: 5, role: "user" } as never)).toEqual({ id: "u", trustLevel: 2, createdAt: 5, role: "user" });
    expect((await jsonError("no", 418, { a: 1 }).json())).toEqual({ error: "no", a: 1 });
  });

  it("refuses cross-site mutations and anonymous callers", async () => {
    const cross = await apiUser(new Request("https://mosques.world/api", { method: "POST", headers: { origin: "https://evil.example" } }), { mutate: true });
    expect("response" in cross && cross.response.status).toBe(403);
    const anonymous = await apiUser(new Request("http://127.0.0.1:5173/api", { headers: { host: "127.0.0.1:5173" } }));
    expect("response" in anonymous && anonymous.response.status).toBe(401);
    const moderator = await apiModerator(new Request("http://127.0.0.1:5173/api", { headers: { host: "127.0.0.1:5173" } }));
    expect("response" in moderator && moderator.response.status).toBe(401);
    expect(await userFromHeaders(new Headers({ host: "127.0.0.1:5173", cookie: "better-auth.session_token=nope" }))).toBeNull();
  });
});

describe("auth configuration", () => {
  it("derives origins and optional providers", () => {
    expect(originFor("127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
    expect(originFor("mosques.world")).toBe("https://mosques.world");
    expect(googleEnabled({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" } as never)).toBe(true);
    expect(googleEnabled({} as never)).toBe(false);
    const turnstile = { TURNSTILE_SECRET_KEY: "s", TURNSTILE_SITE_KEY: "k", EMAIL_SINK: "0" } as never;
    expect(captchaRequired(turnstile, "mosques.world")).toBe(true);
    expect(captchaRequired(turnstile, "127.0.0.1")).toBe(false);
    expect(captchaRequired({ EMAIL_SINK: "0" } as never, "mosques.world")).toBe(false);
  });

  it("caches one instance per env and origin and needs a secret in production", () => {
    const local = { DB: createTestD1().d1, PUBLIC_BASE_URL: "https://mosques.world", EMAIL_SINK: "1", TURNSTILE_SECRET_KEY: "s", TURNSTILE_SITE_KEY: "k" } as never;
    expect(getAuth(local, "http://127.0.0.1:5173")).toBe(getAuth(local, "http://127.0.0.1:5173"));
    expect(() => getAuth({ ...(local as object), EMAIL_SINK: "0" } as never, "https://mosques.world")).toThrow("BETTER_AUTH_SECRET");
    const production = { ...(local as object), EMAIL_SINK: "0", BETTER_AUTH_SECRET: "x".repeat(32), GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "s" } as never;
    expect(getAuth(production, "https://mosques.world")).toBeTruthy();
  });

  it("defaults phase flags by environment regardless of request host", async () => {
    resetEnv({ FLAGS: undefined, ENVIRONMENT: "preview" });
    expect(await phase2EnabledFor(new Request("http://127.0.0.1:5173/", { headers: { host: "127.0.0.1:5173" } }))).toBe(true);
    expect(await phase2EnabledFor(new Request("https://mosques.world/", { headers: { host: "mosques.world" } }))).toBe(true);
    expect(await phase3EnabledFor(new Request("http://127.0.0.1:5173/", { headers: { host: "127.0.0.1:5173" } }))).toBe(true);
    resetEnv({ FLAGS: undefined, ENVIRONMENT: "production" });
    expect(await phase2EnabledFor(new Request("https://mosques-world.x.workers.dev/"))).toBe(false);
    expect(await phase2EnabledFor(new Request("http://127.0.0.1:5173/"))).toBe(false);
    expect(await phase3EnabledFor(new Request("https://mosques.world/", { headers: { host: "mosques.world" } }))).toBe(false);
  });
});
