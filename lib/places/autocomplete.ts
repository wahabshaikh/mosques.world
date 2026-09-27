const PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";

export type CitySuggestion = {
  label: string;
  placeId: string;
  lat: number | null;
  lng: number | null;
};

type GoogleError = {
  status?: string;
  message?: string;
};

type AutocompleteBody = {
  error?: GoogleError;
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
    };
  }>;
};

/** Places API (New) allows `(cities)` only by itself, not mixed with other types. */
export function cityAutocompleteBody(input: string) {
  return {
    input,
    includedPrimaryTypes: ["(cities)"],
  };
}

export async function googleAutocomplete(
  input: string,
  apiKey: string,
): Promise<CitySuggestion[]> {
  const response = await fetch(PLACES_AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(cityAutocompleteBody(input)),
  });
  const body = await readAutocompleteBody(response);
  if (!response.ok || body?.error) {
    logAutocompleteFailure(response.status, body?.error, apiKey);
    return [];
  }
  return (body?.suggestions ?? [])
    .map((item) => ({
      label: item.placePrediction?.text?.text ?? "",
      placeId: item.placePrediction?.placeId ?? "",
      lat: null,
      lng: null,
    }))
    .filter((item) => item.label && item.placeId);
}

async function readAutocompleteBody(
  response: Response,
): Promise<AutocompleteBody | null> {
  try {
    return (await response.json()) as AutocompleteBody;
  } catch {
    return null;
  }
}

function logAutocompleteFailure(
  httpStatus: number,
  error: GoogleError | undefined,
  apiKey: string,
) {
  const status = error?.status?.trim() || "unknown";
  const message = redactSecret(error?.message?.trim() ?? "", apiKey);
  const detail = message ? `: ${message}` : "";
  console.error(
    `Places autocomplete failed: HTTP ${httpStatus} ${status}${detail}`,
  );
}

function redactSecret(message: string, apiKey: string) {
  if (!apiKey) return message;
  return message.replaceAll(apiKey, "[redacted]");
}
