-- Phase 3: amenities, added places, photos, place quality. Additive only.

ALTER TABLE place ADD COLUMN merged_into_id TEXT;
ALTER TABLE place ADD COLUMN google_place_id TEXT;
ALTER TABLE place ADD COLUMN google_latlng_fetched_at INTEGER;
ALTER TABLE place ADD COLUMN created_by TEXT;
ALTER TABLE place ADD COLUMN amenity_bits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE place ADD COLUMN access_notes TEXT;
CREATE INDEX IF NOT EXISTS place_google ON place (google_place_id);
CREATE INDEX IF NOT EXISTS place_amenity ON place (amenity_bits);
CREATE INDEX IF NOT EXISTS place_created_by ON place (created_by, status);

ALTER TABLE city ADD COLUMN osm_synced_at INTEGER;

CREATE TABLE IF NOT EXISTS photo (
  id TEXT PRIMARY KEY,
  place_id TEXT REFERENCES place (id),
  purpose TEXT NOT NULL DEFAULT 'place',
  r2_key TEXT,
  variant_keys_json TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  width INTEGER,
  height INTEGER,
  blurhash TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  ai_labels_json TEXT,
  uploaded_by TEXT NOT NULL REFERENCES user (id),
  created_at INTEGER NOT NULL,
  reviewed_by TEXT,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS photo_place ON photo (place_id, status, created_at);
CREATE INDEX IF NOT EXISTS photo_status ON photo (status, created_at);
CREATE INDEX IF NOT EXISTS photo_uploader ON photo (uploaded_by, created_at);

CREATE TABLE IF NOT EXISTS place_duplicate_candidate (
  a_id TEXT NOT NULL REFERENCES place (id),
  b_id TEXT NOT NULL REFERENCES place (id),
  distance_m INTEGER NOT NULL,
  name_similarity REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (a_id, b_id)
);

-- held_item now also lists photos waiting for review.
DROP VIEW IF EXISTS held_item;
CREATE VIEW held_item AS
  SELECT id, 'candidate' AS item_type, fact_id AS parent_id, created_by, created_at FROM fact_candidate WHERE status = 'held'
  UNION ALL
  SELECT id, 'photo' AS item_type, place_id AS parent_id, uploaded_by AS created_by, created_at FROM photo WHERE status = 'pending';

-- The system account authors values imported from OpenStreetMap.
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, username, display_username, role, trust_level, trust_override)
VALUES ('system', 'mosques.world', 'system@mosques.world', 1, 0, 0, 'mosques.world', 'mosques.world', 'user', 0, 0)
ON CONFLICT (id) DO NOTHING;

-- OSM wheelchair tags become initial step-free values (one system confirmation, so they read as
-- Unverified and turn "Needs check" if nobody confirms them within 60 days).
INSERT INTO fact (id, place_id, key, qualifier, state, confidence, updated_at)
  SELECT 'osm-sf-' || id, id, 'amenity.step_free', '', 'unverified', 0.3, 0 FROM place
  WHERE wheelchair IN ('yes', 'limited', 'no')
ON CONFLICT (place_id, key, qualifier) DO NOTHING;

INSERT INTO fact_candidate (id, fact_id, value_json, value_hash, effective_from, status, score, created_by, created_at)
  SELECT 'osm-sfc-' || place.id, 'osm-sf-' || place.id,
    CASE place.wheelchair WHEN 'no' THEN '{"v":false}' WHEN 'limited' THEN '{"note":"Limited","v":true}' ELSE '{"v":true}' END,
    CASE place.wheelchair
      WHEN 'no' THEN 'eeb0deb9cb259a55fdff2c5ed5d0a08dba3ff585aafa0821cc51889f7660739e'
      WHEN 'limited' THEN 'e135e79a2bee0f9414746fc172f13658c421cb7268585ff1d7b69cbebed28026'
      ELSE '9175b89688753d7371f5ad803366cc394dbda9d202494fba0216c6326fa67004' END,
    '2000-01-01', 'current', 1, 'system', place.updated_at
  FROM place JOIN fact ON fact.id = 'osm-sf-' || place.id
  WHERE place.wheelchair IN ('yes', 'limited', 'no')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vote (id, candidate_id, user_id, polarity, source, weight, created_at)
  SELECT 'osm-sfv-' || fact_candidate.fact_id, fact_candidate.id, 'system', 1, 'other', 1, fact_candidate.created_at
  FROM fact_candidate WHERE fact_candidate.id LIKE 'osm-sfc-%'
ON CONFLICT (candidate_id, user_id) DO NOTHING;

UPDATE fact SET current_candidate_id = 'osm-sfc-' || place_id, last_confirmed_at = (SELECT created_at FROM fact_candidate WHERE fact_candidate.id = 'osm-sfc-' || fact.place_id)
  WHERE id LIKE 'osm-sf-%' AND current_candidate_id IS NULL;

UPDATE place SET amenity_bits = amenity_bits | 8 WHERE wheelchair IN ('yes', 'limited');
