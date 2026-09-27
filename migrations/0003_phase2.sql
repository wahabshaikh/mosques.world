-- Phase 2: accounts, facts + votes, moderation. Additive only.

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  username TEXT UNIQUE,
  display_username TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  banned INTEGER DEFAULT 0,
  ban_reason TEXT,
  ban_expires INTEGER,
  bio TEXT,
  home_city_label TEXT,
  home_country TEXT,
  trust_level INTEGER NOT NULL DEFAULT 0,
  trust_override INTEGER,
  reputation INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  guidelines_accepted_at INTEGER,
  profile_public INTEGER NOT NULL DEFAULT 1,
  checkins_visibility TEXT NOT NULL DEFAULT 'public',
  avatar_key TEXT,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  impersonated_by TEXT
);
CREATE INDEX IF NOT EXISTS session_user ON session (user_id);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_user ON account (user_id);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_identifier ON verification (identifier);

CREATE TABLE IF NOT EXISTS fact (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES place (id),
  key TEXT NOT NULL,
  qualifier TEXT NOT NULL DEFAULT '',
  current_candidate_id TEXT,
  state TEXT NOT NULL DEFAULT 'unknown',
  confidence REAL NOT NULL DEFAULT 0,
  last_confirmed_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS fact_place_key ON fact (place_id, key, qualifier);
CREATE INDEX IF NOT EXISTS fact_state ON fact (state, last_confirmed_at);

CREATE TABLE IF NOT EXISTS fact_candidate (
  id TEXT PRIMARY KEY,
  fact_id TEXT NOT NULL REFERENCES fact (id),
  value_json TEXT NOT NULL,
  value_hash TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  score REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES user (id),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS fact_candidate_value ON fact_candidate (fact_id, value_hash, effective_from);
CREATE INDEX IF NOT EXISTS fact_candidate_status ON fact_candidate (status, created_at);
CREATE INDEX IF NOT EXISTS fact_candidate_author ON fact_candidate (created_by, created_at);

CREATE TABLE IF NOT EXISTS vote (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES fact_candidate (id),
  user_id TEXT NOT NULL REFERENCES user (id),
  polarity INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'other',
  weight REAL NOT NULL,
  geo_verified INTEGER NOT NULL DEFAULT 0,
  evidence_photo_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS vote_candidate_user ON vote (candidate_id, user_id);
CREATE INDEX IF NOT EXISTS vote_user_created ON vote (user_id, created_at);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES user (id),
  place_id TEXT REFERENCES place (id),
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
);
CREATE INDEX IF NOT EXISTS activity_place ON activity (place_id, created_at);
CREATE INDEX IF NOT EXISTS activity_actor ON activity (actor_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reverts_id TEXT,
  reverted_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS audit_log_target ON audit_log (target_type, target_id);

CREATE TABLE IF NOT EXISTS report (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  place_id TEXT REFERENCES place (id),
  reason TEXT NOT NULL,
  note TEXT,
  reporter_id TEXT REFERENCES user (id),
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS report_status ON report (status, created_at);

ALTER TABLE place ADD COLUMN verification_state TEXT NOT NULL DEFAULT 'none';
ALTER TABLE place ADD COLUMN last_verified_at INTEGER;
ALTER TABLE place ADD COLUMN iqamah_summary_json TEXT;
CREATE INDEX IF NOT EXISTS place_verification ON place (verification_state);

ALTER TABLE waitlist ADD COLUMN times_live_sent_at INTEGER;
ALTER TABLE waitlist ADD COLUMN unsubscribed_at INTEGER;

CREATE VIEW IF NOT EXISTS held_item AS
  SELECT id, 'candidate' AS item_type, fact_id AS parent_id, created_by, created_at
  FROM fact_candidate WHERE status = 'held';

ALTER TABLE user ADD COLUMN username_changed_at INTEGER;

CREATE TABLE IF NOT EXISTS username_history (
  old_username TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user (id),
  created_at INTEGER NOT NULL
);
