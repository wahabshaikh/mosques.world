export async function verifyTurnstile(token: string, secret: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!token || !secret) return false;
  const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { success?: boolean };
  return Boolean(body.success);
}
