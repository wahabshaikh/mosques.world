-- Phase 4: check-ins ("I prayed here"), profile stats, badges and saved places. Additive only.

CREATE TABLE IF NOT EXISTS checkin (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user (id),
  place_id TEXT NOT NULL REFERENCES place (id),
  prayer TEXT NOT NULL CHECK (prayer IN ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah', 'eid', 'taraweeh', 'other')),
  -- YYYY-MM-DD in the place's time zone, or YYYY-MM for "I prayed here before" backfills.
  local_date TEXT NOT NULL,
  geo_verified INTEGER NOT NULL DEFAULT 0,
  -- Rounded metres from the place when the person shared their location once; coordinates are never stored.
  distance_m INTEGER,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS checkin_once ON checkin (user_id, place_id, local_date, prayer);
CREATE INDEX IF NOT EXISTS checkin_user ON checkin (user_id, created_at);
CREATE INDEX IF NOT EXISTS checkin_place ON checkin (place_id, created_at);

CREATE TABLE IF NOT EXISTS user_place_stat (
  user_id TEXT NOT NULL REFERENCES user (id),
  place_id TEXT NOT NULL REFERENCES place (id),
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, place_id)
);

CREATE TABLE IF NOT EXISTS user_stat (
  user_id TEXT PRIMARY KEY REFERENCES user (id),
  places INTEGER NOT NULL DEFAULT 0,
  countries INTEGER NOT NULL DEFAULT 0,
  cities INTEGER NOT NULL DEFAULT 0,
  continents INTEGER NOT NULL DEFAULT 0,
  jumuah_countries INTEGER NOT NULL DEFAULT 0,
  fajr_places INTEGER NOT NULL DEFAULT 0,
  verifications INTEGER NOT NULL DEFAULT 0,
  places_added INTEGER NOT NULL DEFAULT 0,
  photos INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS badge (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  rule_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_badge (
  user_id TEXT NOT NULL REFERENCES user (id),
  badge_key TEXT NOT NULL REFERENCES badge (key),
  awarded_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge_key)
);

CREATE TABLE IF NOT EXISTS saved_place (
  user_id TEXT NOT NULL REFERENCES user (id),
  place_id TEXT NOT NULL REFERENCES place (id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, place_id)
);
CREATE INDEX IF NOT EXISTS saved_place_place ON saved_place (place_id);
-- Lets the "Founding contributor" rule check "joined within the first 1,000" with a bounded scan.
CREATE INDEX IF NOT EXISTS user_created ON user (created_at);

INSERT INTO badge (key, name, description, icon, rule_json) VALUES
  ('trusted_verifier', 'Trusted verifier', 'Reached the Trusted verifier level', 'shield', '{"trustLevel":2}'),
  ('fajr_regular', 'Fajr regular', 'Fajr in jamā''ah at 5 mosques', 'moon', '{"stat":"fajr_places","min":5}'),
  ('jumuah_traveller', 'Jumu''ah traveller', 'Jumu''ah in 3 countries', 'globe', '{"stat":"jumuah_countries","min":3}'),
  ('founding_contributor', 'Founding contributor', 'Joined in the first 1,000', 'star', '{"joinedRank":1000}'),
  ('globetrotter_5', 'Globetrotter', 'Prayed in 5 countries', 'plane', '{"stat":"countries","min":5}'),
  ('globetrotter_10', 'Globetrotter 10', 'Prayed in 10 countries', 'plane', '{"stat":"countries","min":10}'),
  ('globetrotter_25', 'Globetrotter 25', 'Prayed in 25 countries', 'plane', '{"stat":"countries","min":25}'),
  ('timetable_keeper', 'Timetable keeper', 'Shared 3 timetable photos', 'calendar', '{"stat":"timetables","min":3}')
ON CONFLICT (key) DO NOTHING;
