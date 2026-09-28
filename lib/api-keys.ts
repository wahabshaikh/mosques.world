import { ulid } from "@/lib/id";

/**
 * API keys for the public read API (spec P8). Only a SHA-256 of each key is stored; the key is shown
 * once when created. Lookups are cached per isolate so a busy key costs one D1 read a minute, and
 * `last_used_at` is written at most hourly.
 */

export const MAX_ACTIVE_KEYS = 5;
export const FREE_RATE_LIMIT = 60;
const CACHE_MS = 60_000;
const TOUCH_MS = 60 * 60_000;

export type ApiKeyRow = { id: string; owner_id: string; scopes: string; rate_limit: number; revoked_at: number | null; last_used_at: number | null };
export type ApiKeyView = { id: string; name: string; prefix: string; createdAt: number; lastUsedAt: number | null; revokedAt: number | null };

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let body = "";
  for (const byte of bytes) body += ALPHABET[byte % ALPHABET.length];
  return `mw_${body}`;
}

export async function hashKey(key: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class ApiKeyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function createApiKey(db: D1Database, input: { ownerId: string; name: string; now: number }): Promise<{ key: string; view: ApiKeyView }> {
  const active = await db.prepare(`SELECT COUNT(*) AS n FROM api_key WHERE owner_id = ? AND revoked_at IS NULL`).bind(input.ownerId).first<{ n: number }>();
  if ((active?.n ?? 0) >= MAX_ACTIVE_KEYS) throw new ApiKeyError(`You can have up to ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`, 409);
  const key = generateKey();
  const id = ulid(input.now);
  const prefix = key.slice(0, 10);
  await db
    .prepare(`INSERT INTO api_key (id, owner_id, name, prefix, hash, scopes, rate_limit, created_at) VALUES (?, ?, ?, ?, ?, 'read', ?, ?)`)
    .bind(id, input.ownerId, input.name, prefix, await hashKey(key), FREE_RATE_LIMIT, input.now)
    .run();
  return { key, view: { id, name: input.name, prefix, createdAt: input.now, lastUsedAt: null, revokedAt: null } };
}

export async function listApiKeys(db: D1Database, ownerId: string): Promise<ApiKeyView[]> {
  const rows = await db
    .prepare(`SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_key WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50`)
    .bind(ownerId)
    .all<{ id: string; name: string; prefix: string; created_at: number; last_used_at: number | null; revoked_at: number | null }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }));
}

export async function revokeApiKey(db: D1Database, input: { ownerId: string; id: string; now: number }): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE api_key SET revoked_at = ? WHERE id = ? AND owner_id = ? AND revoked_at IS NULL`)
    .bind(input.now, input.id, input.ownerId)
    .run();
  cache.clear();
  return (result.meta?.changes ?? 0) > 0;
}

const cache = new Map<string, { row: ApiKeyRow | null; at: number }>();

/** The key in `Authorization: Bearer …` or `X-API-Key`. */
export function keyFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  const bearer = header && /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  const key = bearer || request.headers.get("x-api-key");
  return key && /^mw_[A-Za-z0-9]{20,64}$/.test(key) ? key : null;
}

export async function lookupKey(db: D1Database, key: string, now: number): Promise<ApiKeyRow | null> {
  const hash = await hashKey(key);
  const hit = cache.get(hash);
  if (hit && now - hit.at < CACHE_MS) return hit.row;
  const row = await db
    .prepare(`SELECT id, owner_id, scopes, rate_limit, revoked_at, last_used_at FROM api_key WHERE hash = ?`)
    .bind(hash)
    .first<ApiKeyRow>();
  if (cache.size > 5_000) cache.clear();
  cache.set(hash, { row: row ?? null, at: now });
  return row ?? null;
}

/** Records use at most hourly, so a busy key doesn't turn every read into a D1 write. */
export async function touchKey(db: D1Database, row: ApiKeyRow, now: number): Promise<void> {
  if (row.last_used_at !== null && now - row.last_used_at < TOUCH_MS) return;
  row.last_used_at = now;
  await db.prepare(`UPDATE api_key SET last_used_at = ? WHERE id = ?`).bind(now, row.id).run();
}

export function clearKeyCache() {
  cache.clear();
}
