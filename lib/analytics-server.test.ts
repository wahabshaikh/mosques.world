import { afterEach, describe, expect, it, vi } from "vitest";
import { serverGoal } from "./analytics-server";

describe("server goals", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts only with an API key and a visitor cookie, and never throws", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const env = { DATAFAST_API_KEY: "k" } as never;
    await serverGoal(env, new Request("https://mosques.world"), "dispute_resolved");
    expect(fetch).not.toHaveBeenCalled();
    const request = new Request("https://mosques.world", { headers: { cookie: "a=1; datafast_visitor_id=v1" } });
    await serverGoal(env, request, "dispute_resolved", { fact_key: "iqamah.isha" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
      datafast_visitor_id: "v1",
      name: "dispute_resolved",
      metadata: { fact_key: "iqamah.isha" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    await expect(serverGoal(env, request, "x")).resolves.toBeUndefined();
    await serverGoal({} as never, request, "x");
  });
});
