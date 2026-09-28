const PLACE_PATH = /^\/m\/([^/]+)(\/.*)?$/;

/** Splits `/m/<slug>[/rest]` into its slug and suffix, or null for any other path. */
export function placePath(
  pathname: string,
): { slug: string; rest: string } | null {
  const match = PLACE_PATH.exec(pathname);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1] ?? "");
  } catch {
    return null;
  }
  return slug ? { slug, rest: match[2] ?? "" } : null;
}

/**
 * Old or merged place slugs live in `place_slug_history`. When `/m/<old-slug>` would 404,
 * answer with a permanent 301 to the place's current slug (keeping any sub-path and query).
 */
export async function placeSlugRedirect(
  db: D1Database,
  requestUrl: string,
): Promise<Response | null> {
  const url = new URL(requestUrl);
  const parsed = placePath(url.pathname);
  if (!parsed) return null;
  const row = await db
    .prepare(
      `SELECT place.slug AS slug FROM place_slug_history
       JOIN place ON place.id = place_slug_history.place_id
       WHERE place_slug_history.old_slug = ?1 AND place.status = 'active'`,
    )
    .bind(parsed.slug)
    .first<{ slug: string }>();
  if (!row || row.slug === parsed.slug) return null;
  url.pathname = `/m/${encodeURIComponent(row.slug)}${parsed.rest}`;
  return new Response(null, {
    status: 301,
    headers: {
      Location: url.toString(),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
