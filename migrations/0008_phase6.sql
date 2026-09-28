-- Phase 6: stewards and notifications. Additive only.

CREATE TABLE IF NOT EXISTS steward (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES place (id),
  user_id TEXT NOT NULL REFERENCES user (id),
  role TEXT NOT NULL DEFAULT 'steward' CHECK (role IN ('steward', 'lead')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'revoked')),
  -- What the person told us: their role at the mosque, how to reach the mosque, anything else. Moderators only.
  evidence TEXT NOT NULL,
  contact TEXT,
  approved_by TEXT REFERENCES user (id),
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS steward_place_user ON steward (place_id, user_id);
CREATE INDEX IF NOT EXISTS steward_user ON steward (user_id, status);
CREATE INDEX IF NOT EXISTS steward_status ON steward (status, created_at);

CREATE TABLE IF NOT EXISTS notification_pref (
  user_id TEXT NOT NULL REFERENCES user (id),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'push')),
  topic TEXT NOT NULL CHECK (topic IN ('saved_changes', 'digest', 'steward_alerts')),
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, channel, topic)
);

-- In-app inbox, and the outbox for email and push: rows are written with the change that caused them and
-- delivered by the queue (or the nightly sweep), so a promotion never waits on email.
CREATE TABLE IF NOT EXISTS notification (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user (id),
  topic TEXT NOT NULL,
  place_id TEXT REFERENCES place (id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'pending',
  push_status TEXT NOT NULL DEFAULT 'pending',
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_user ON notification (user_id, created_at);
CREATE INDEX IF NOT EXISTS notification_unread ON notification (user_id, read_at);
CREATE INDEX IF NOT EXISTS notification_email_pending ON notification (email_status) WHERE email_status = 'pending';
CREATE INDEX IF NOT EXISTS notification_push_pending ON notification (push_status) WHERE push_status = 'pending';
