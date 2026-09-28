-- Phase 5: web push subscriptions, captured after a successful quick verify and used for notifications in Phase 6.

CREATE TABLE IF NOT EXISTS push_subscription (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user (id),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscription_endpoint ON push_subscription (endpoint);
CREATE INDEX IF NOT EXISTS push_subscription_user ON push_subscription (user_id);
