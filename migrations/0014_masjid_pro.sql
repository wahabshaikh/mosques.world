-- Masjid Pro: one committee subscription per mosque (lobby screen, widget, notice, donation link). Additive only.
CREATE TABLE IF NOT EXISTS masjid_pro (
  place_id TEXT PRIMARY KEY REFERENCES place (id),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'past_due', 'canceled', 'revoked')),
  polar_subscription_id TEXT,
  polar_customer_id TEXT,
  product_id TEXT,
  billing_interval TEXT CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year')),
  current_period_end INTEGER,
  notice TEXT,
  donation_url TEXT,
  donation_label TEXT,
  activated_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  -- When Polar last moved this row. An older delivery must not overwrite a newer one.
  polar_event_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS masjid_pro_subscription ON masjid_pro (polar_subscription_id);

CREATE TABLE IF NOT EXISTS masjid_pro_event (
  id TEXT PRIMARY KEY,
  place_id TEXT,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS masjid_pro_event_place ON masjid_pro_event (place_id, created_at);
