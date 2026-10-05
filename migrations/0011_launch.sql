-- Launch: on-demand OpenStreetMap area fill and community adhan adjustments. Additive only.

-- One row per geohash-4 cell (≈39×20 km) we have pulled from Overpass, so each area is fetched once
-- and re-synced monthly instead of on every visit.
CREATE TABLE IF NOT EXISTS osm_cell (
  geohash TEXT PRIMARY KEY,
  -- 'filling' while a request holds the cell (doubles as a lock), then 'done' or 'failed'.
  status TEXT NOT NULL CHECK (status IN ('filling', 'done', 'failed')),
  started_at INTEGER NOT NULL,
  synced_at INTEGER,
  -- Places inserted by the last fill (existing rows are never touched).
  inserted INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS osm_cell_synced ON osm_cell (status, synced_at);

-- Community-agreed adhan adjustments: {"fajr":{"min":-10},"isha":{"t":"20:00"}} applied on top of
-- the calculated times (denormalised from the adhan.* facts like iqamah_summary_json).
ALTER TABLE place ADD COLUMN adhan_adjust_json TEXT;
