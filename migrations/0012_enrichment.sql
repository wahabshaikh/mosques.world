-- Enrichment: free open data (Wikidata, Wikimedia Commons, Wikipedia) on top of OpenStreetMap. Additive only.

-- The Wikidata item a place matched, and what we took from it:
-- {"wikidata":"Q123","image":{"file","thumb","page","author","license","licenseUrl"},
--  "wikipedia":{"title","url","extract"},"inception":"1910","nameAr":"…"}
ALTER TABLE place ADD COLUMN wikidata_id TEXT;
ALTER TABLE place ADD COLUMN enrichment_json TEXT;
CREATE INDEX IF NOT EXISTS place_wikidata ON place (wikidata_id);

-- One row per geohash-4 cell matched against Wikidata, so each area is queried once and refreshed quarterly.
CREATE TABLE IF NOT EXISTS enrich_cell (
  geohash TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('done', 'failed')),
  synced_at INTEGER NOT NULL,
  matched INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS enrich_cell_synced ON enrich_cell (status, synced_at);
