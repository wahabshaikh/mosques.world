-- Phase 8: public read API keys and open-data export runs. Additive only.

CREATE TABLE IF NOT EXISTS api_key (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user (id),
  name TEXT NOT NULL,
  -- First characters of the key, shown so people can tell keys apart; the key itself is never stored.
  prefix TEXT NOT NULL,
  -- SHA-256 of the full key (hex).
  hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT 'read',
  -- Requests per minute (free tier); enforced by the RL_API rate-limit binding.
  rate_limit INTEGER NOT NULL DEFAULT 60,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS api_key_owner ON api_key (owner_id, created_at);

CREATE TABLE IF NOT EXISTS export_run (
  id TEXT PRIMARY KEY,
  -- 'places' (monthly ODbL export); one run writes both files.
  kind TEXT NOT NULL,
  -- YYYY-MM the export covers.
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  r2_key TEXT NOT NULL,
  csv_key TEXT,
  rows INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  csv_bytes INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE (kind, period)
);
