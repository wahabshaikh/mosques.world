-- Phase 1 directory. Additive only.

CREATE TABLE IF NOT EXISTS place (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_local TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  geohash6 TEXT NOT NULL,
  address TEXT,
  locality TEXT,
  region TEXT,
  country_code TEXT NOT NULL,
  city_slug TEXT NOT NULL,
  timezone TEXT NOT NULL,
  calc_method TEXT NOT NULL,
  asr_madhab TEXT NOT NULL,
  osm_type TEXT,
  osm_id INTEGER,
  website TEXT,
  phone TEXT,
  wheelchair TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS place_osm ON place (osm_type, osm_id);
CREATE INDEX IF NOT EXISTS place_city ON place (country_code, city_slug);
CREATE INDEX IF NOT EXISTS place_geohash ON place (geohash6);
CREATE INDEX IF NOT EXISTS place_lat_lng ON place (lat, lng);
CREATE INDEX IF NOT EXISTS place_status ON place (status);

CREATE TABLE IF NOT EXISTS place_slug_history (
  old_slug TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (place_id) REFERENCES place (id)
);

CREATE TABLE IF NOT EXISTS city (
  country_code TEXT NOT NULL,
  city_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  place_count INTEGER NOT NULL DEFAULT 0,
  bbox_json TEXT,
  PRIMARY KEY (country_code, city_slug)
);

CREATE TABLE IF NOT EXISTS calc_default (
  country_code TEXT PRIMARY KEY,
  calc_method TEXT NOT NULL,
  asr_madhab TEXT NOT NULL,
  high_lat_rule TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  place_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  FOREIGN KEY (place_id) REFERENCES place (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_place ON waitlist (email, place_id);
CREATE INDEX IF NOT EXISTS waitlist_token ON waitlist (token_hash);

CREATE VIRTUAL TABLE IF NOT EXISTS place_fts USING fts5(
  name,
  name_local,
  locality,
  region,
  content='place',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS place_fts_insert AFTER INSERT ON place BEGIN
  INSERT INTO place_fts(rowid, name, name_local, locality, region)
  VALUES (new.rowid, new.name, coalesce(new.name_local, ''), coalesce(new.locality, ''), coalesce(new.region, ''));
END;

CREATE TRIGGER IF NOT EXISTS place_fts_delete AFTER DELETE ON place BEGIN
  INSERT INTO place_fts(place_fts, rowid, name, name_local, locality, region)
  VALUES ('delete', old.rowid, old.name, coalesce(old.name_local, ''), coalesce(old.locality, ''), coalesce(old.region, ''));
END;

CREATE TRIGGER IF NOT EXISTS place_fts_update AFTER UPDATE ON place BEGIN
  INSERT INTO place_fts(place_fts, rowid, name, name_local, locality, region)
  VALUES ('delete', old.rowid, old.name, coalesce(old.name_local, ''), coalesce(old.locality, ''), coalesce(old.region, ''));
  INSERT INTO place_fts(rowid, name, name_local, locality, region)
  VALUES (new.rowid, new.name, coalesce(new.name_local, ''), coalesce(new.locality, ''), coalesce(new.region, ''));
END;

INSERT INTO calc_default (country_code, calc_method, asr_madhab, high_lat_rule) VALUES
  ('SA', 'UmmAlQura', 'shafi', 'twilightangle'),
  ('AE', 'Dubai', 'shafi', 'twilightangle'),
  ('QA', 'Qatar', 'shafi', 'twilightangle'),
  ('KW', 'Kuwait', 'hanafi', 'twilightangle'),
  ('EG', 'Egyptian', 'shafi', 'twilightangle'),
  ('PK', 'Karachi', 'hanafi', 'twilightangle'),
  ('IN', 'Karachi', 'hanafi', 'twilightangle'),
  ('BD', 'Karachi', 'hanafi', 'twilightangle'),
  ('TR', 'Turkey', 'hanafi', 'twilightangle'),
  ('ID', 'Singapore', 'shafi', 'twilightangle'),
  ('MY', 'Singapore', 'shafi', 'twilightangle'),
  ('SG', 'Singapore', 'shafi', 'twilightangle'),
  ('US', 'NorthAmerica', 'shafi', 'twilightangle'),
  ('CA', 'NorthAmerica', 'shafi', 'twilightangle'),
  ('GB', 'MoonsightingCommittee', 'hanafi', 'twilightangle'),
  ('FR', 'MoonsightingCommittee', 'shafi', 'twilightangle'),
  ('DE', 'MoonsightingCommittee', 'hanafi', 'twilightangle'),
  ('NO', 'MuslimWorldLeague', 'shafi', 'middleofthenight'),
  ('SE', 'MuslimWorldLeague', 'shafi', 'middleofthenight'),
  ('FI', 'MuslimWorldLeague', 'shafi', 'middleofthenight'),
  ('NG', 'Egyptian', 'shafi', 'twilightangle'),
  ('MA', 'MuslimWorldLeague', 'shafi', 'twilightangle'),
  ('DZ', 'MuslimWorldLeague', 'shafi', 'twilightangle'),
  ('ZA', 'MuslimWorldLeague', 'shafi', 'twilightangle'),
  ('AU', 'MuslimWorldLeague', 'shafi', 'twilightangle')
ON CONFLICT(country_code) DO NOTHING;
