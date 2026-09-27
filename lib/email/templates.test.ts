import { describe, expect, it, vi } from "vitest";
import { asMail, deliver, usesEmailSink } from "./send";
import { deletionMail, layout, otpMail, timesLiveMail, welcomeMail } from "./templates";

describe("email templates", () => {
  it("renders every template with text and escaped HTML", () => {
    expect(otpMail("a@x", "123456")).toMatchObject({ to: "a@x", subject: "Your mosques.world code: 123456" });
    expect(welcomeMail("a@x", { username: "aisha", baseUrl: "https://mosques.world" }).text).toContain("https://mosques.world/guidelines");
    expect(deletionMail("a@x").html).toContain("former member");
    const live = timesLiveMail("a@x", { placeName: "A <b>", placeUrl: "https://m/1", unsubscribeUrl: "https://u?token=1" });
    expect(live.html).toContain("A &#60;b&#62;");
    expect(live.headers?.["List-Unsubscribe"]).toBe("<https://u?token=1>");
    expect(layout("T", ["p"])).not.toContain("<a href");
  });
});

describe("email delivery", () => {
  function env(overrides: Record<string, unknown> = {}) {
    return {
      EMAIL_SINK: "0",
      CACHE: { put: vi.fn(async () => undefined) },
      Q_EMAIL: { send: vi.fn(async () => undefined) },
      EMAIL: { send: vi.fn(async () => ({})) },
      ...overrides,
    } as never as Parameters<typeof deliver>[0] & {
      CACHE: { put: ReturnType<typeof vi.fn> };
      Q_EMAIL: { send: ReturnType<typeof vi.fn> };
      EMAIL: { send: ReturnType<typeof vi.fn> };
    };
  }

  it("uses the KV sink on preview and localhost", async () => {
    expect(usesEmailSink({ EMAIL_SINK: "1" }, "mosques.world")).toBe(true);
    expect(usesEmailSink({ EMAIL_SINK: "0" }, "127.0.0.1")).toBe(true);
    expect(usesEmailSink({ EMAIL_SINK: "0" }, "mosques.world")).toBe(false);
    const sink = env({ EMAIL_SINK: "1" });
    await deliver(sink, "mosques.world", otpMail("a@x", "1"));
    expect(sink.CACHE.put).toHaveBeenCalledTimes(2);
  });

  it("queues in production and falls back to the binding", async () => {
    const queued = env();
    await deliver(queued, "mosques.world", otpMail("a@x", "1"));
    expect(queued.Q_EMAIL.send).toHaveBeenCalledOnce();
    const direct = env({ Q_EMAIL: undefined });
    await deliver(direct, "mosques.world", otpMail("a@x", "1"));
    expect(direct.EMAIL.send).toHaveBeenCalledWith(expect.objectContaining({ from: "no-reply@mail.mosques.world", to: "a@x" }));
  });

  it("parses queued mail", () => {
    expect(asMail(null)).toBeNull();
    expect(asMail({ to: "a", subject: "s" })).toBeNull();
    expect(asMail({ to: "a", subject: "s", text: "t", html: 1, headers: "x" })).toEqual({ to: "a", subject: "s", text: "t", html: undefined, headers: undefined });
    expect(asMail({ to: "a", subject: "s", text: "t", html: "<p>", headers: { a: "b" } })?.headers).toEqual({ a: "b" });
  });
});
