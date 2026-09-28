-- Dedupe London Central Mosque (St John's Wood).
--
-- The launch seed (0002) imported two OSM entries ~150 m apart under that name:
--   keep:   way/5983916    01K62GJG001AS17S8THTQ6215P  london-central-mosque-st-john-s-wood
--           amenity=place_of_worship, building=mosque, religion=muslim, wikidata=Q1811339,
--           alt_name "Regent's Park Mosque", Grade II* listed, postcode NW8 7RG (the mosque's own).
--   remove: node/469777869 01K62GJG000EQ0FZB5HNA9AB7M  london-central-mosque-st-john-s-wood-2
--           a TfL bus stop (highway=bus_stop, naptan 490010816N) that is merely *named*
--           "London Central Mosque", on Park Road, NW8 7JD.
--
-- Everything is keyed on both ids so this is a no-op on databases without the seed, and
-- safe to re-run. Rows pointing at the removed place are moved to the kept one; any that
-- would collide with an existing row on the kept place stay behind, and the place
-- foreign keys then make the DELETE (and so the whole migration) fail instead of
-- silently dropping data.

-- 1. Durable exclusion: OSM elements that must never become a place again. The trigger
--    silently skips inserts of excluded elements (seed replays, scripts/import-osm.ts,
--    or any future importer), including INSERT ... ON CONFLICT DO UPDATE upserts.
CREATE TABLE IF NOT EXISTS osm_exclusion (
  osm_type TEXT NOT NULL,
  osm_id INTEGER NOT NULL,
  canonical_place_id TEXT REFERENCES place (id),
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (osm_type, osm_id)
);

CREATE TRIGGER IF NOT EXISTS place_osm_exclusion BEFORE INSERT ON place
WHEN NEW.osm_type IS NOT NULL
  AND EXISTS (SELECT 1 FROM osm_exclusion WHERE osm_type = NEW.osm_type AND osm_id = NEW.osm_id)
BEGIN
  SELECT RAISE(IGNORE);
END;

INSERT OR IGNORE INTO osm_exclusion (osm_type, osm_id, canonical_place_id, reason, created_at)
VALUES (
  'node',
  469777869,
  (SELECT id FROM place WHERE id = '01K62GJG001AS17S8THTQ6215P' AND osm_type = 'way' AND osm_id = 5983916),
  'Bus stop named "London Central Mosque"; duplicate of way/5983916',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

-- 2. Re-point rows that reference the removed place (only when both places exist).
UPDATE OR IGNORE waitlist SET place_id = '01K62GJG001AS17S8THTQ6215P'
WHERE place_id = '01K62GJG000EQ0FZB5HNA9AB7M'
  AND EXISTS (SELECT 1 FROM place WHERE id = '01K62GJG001AS17S8THTQ6215P');
-- Same email already on the kept place's waitlist: the leftover is a true duplicate.
DELETE FROM waitlist
WHERE place_id = '01K62GJG000EQ0FZB5HNA9AB7M'
  AND EXISTS (SELECT 1 FROM waitlist AS kept WHERE kept.place_id = '01K62GJG001AS17S8THTQ6215P' AND kept.email = waitlist.email);

UPDATE OR IGNORE fact SET place_id = '01K62GJG001AS17S8THTQ6215P'
WHERE place_id = '01K62GJG000EQ0FZB5HNA9AB7M'
  AND EXISTS (SELECT 1 FROM place WHERE id = '01K62GJG001AS17S8THTQ6215P');

UPDATE activity SET place_id = '01K62GJG001AS17S8THTQ6215P'
WHERE place_id = '01K62GJG000EQ0FZB5HNA9AB7M'
  AND EXISTS (SELECT 1 FROM place WHERE id = '01K62GJG001AS17S8THTQ6215P');

UPDATE report SET place_id = '01K62GJG001AS17S8THTQ6215P'
WHERE place_id = '01K62GJG000EQ0FZB5HNA9AB7M'
  AND EXISTS (SELECT 1 FROM place WHERE id = '01K62GJG001AS17S8THTQ6215P');
UPDATE report SET target_id = '01K62GJG001AS17S8THTQ6215P'
WHERE target_type = 'place' AND target_id = '01K62GJG000EQ0FZB5HNA9AB7M'
  AND EXISTS (SELECT 1 FROM place WHERE id = '01K62GJG001AS17S8THTQ6215P');

UPDATE audit_log SET target_id = '01K62GJG001AS17S8THTQ6215P'
WHERE target_type = 'place' AND target_id = '01K62GJG000EQ0FZB5HNA9AB7M'
  AND EXISTS (SELECT 1 FROM place WHERE id = '01K62GJG001AS17S8THTQ6215P');

UPDATE place_slug_history SET place_id = '01K62GJG001AS17S8THTQ6215P'
WHERE place_id = '01K62GJG000EQ0FZB5HNA9AB7M'
  AND EXISTS (SELECT 1 FROM place WHERE id = '01K62GJG001AS17S8THTQ6215P');

-- 3. Keep the removed slug as an alias of the kept place (served as a 301 by the Worker).
INSERT OR REPLACE INTO place_slug_history (old_slug, place_id, created_at)
SELECT removed.slug, kept.id, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM place AS removed, place AS kept
WHERE removed.id = '01K62GJG000EQ0FZB5HNA9AB7M' AND removed.osm_type = 'node' AND removed.osm_id = 469777869
  AND kept.id = '01K62GJG001AS17S8THTQ6215P' AND kept.osm_type = 'way' AND kept.osm_id = 5983916;

-- 4. Remove the duplicate (place_fts is kept in sync by the place_fts_delete trigger).
DELETE FROM place
WHERE id = '01K62GJG000EQ0FZB5HNA9AB7M' AND osm_type = 'node' AND osm_id = 469777869
  AND EXISTS (SELECT 1 FROM place WHERE id = '01K62GJG001AS17S8THTQ6215P');

-- 5. Refresh London's count now rather than waiting for the nightly recount.
UPDATE city SET place_count = (
  SELECT COUNT(*) FROM place
  WHERE place.country_code = city.country_code AND place.city_slug = city.city_slug AND place.status = 'active'
)
WHERE country_code = 'GB' AND city_slug = 'london';
