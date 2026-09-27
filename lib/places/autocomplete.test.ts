import { afterEach, describe, expect, it, vi } from "vitest";
import { cityAutocompleteBody, googleAutocomplete } from "./autocomplete";

const API_KEY = "test-maps-key";

describe("city autocomplete", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("asks Google only for the (cities) collection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: "london",
              text: { text: "London, UK" },
            },
          },
          { placePrediction: { text: { text: "missing id" } } },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(cityAutocompleteBody("Lond")).toEqual({
      input: "Lond",
      includedPrimaryTypes: ["(cities)"],
    });

    await expect(googleAutocomplete("Lond", API_KEY)).resolves.toEqual([
      { label: "London, UK", placeId: "london", lat: null, lng: null },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(url).not.toContain(API_KEY);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "X-Goog-Api-Key": API_KEY,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      input: "Lond",
      includedPrimaryTypes: ["(cities)"],
    });
  });

  it("logs a failed Google response without the key and returns nothing", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            {
              error: {
                status: "INVALID_ARGUMENT",
                message: `rejected key ${API_KEY}`,
              },
            },
            { status: 400 },
          ),
        ),
    );

    await expect(googleAutocomplete("Mumb", API_KEY)).resolves.toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0]?.[0]);
    expect(line).toBe(
      "Places autocomplete failed: HTTP 400 INVALID_ARGUMENT: rejected key [redacted]",
    );
    expect(line).not.toContain(API_KEY);
    expect(line).not.toContain("places.googleapis.com");
  });

  it("logs an error body even when the HTTP status is successful", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { status: "UNKNOWN", message: "quota" } }),
        ),
    );

    await expect(googleAutocomplete("Lond", API_KEY)).resolves.toEqual([]);
    expect(error).toHaveBeenCalledWith(
      "Places autocomplete failed: HTTP 200 UNKNOWN: quota",
    );
  });

  it("logs the HTTP status when Google returns a non-JSON error", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("upstream", {
            status: 502,
            headers: { "content-type": "text/plain" },
          }),
        ),
    );

    await expect(googleAutocomplete("Lond", API_KEY)).resolves.toEqual([]);
    expect(error).toHaveBeenCalledWith(
      "Places autocomplete failed: HTTP 502 unknown",
    );
  });
});
