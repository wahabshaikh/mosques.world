-- Timetable sources: a mosque's own published adhan/iqamah times from Mawaqit or Masjidal. Additive only.

-- One linked timetable per place and provider. external_id is the Mawaqit slug or the Masjidal masjid id.
CREATE TABLE IF NOT EXISTS place_source (
  place_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('mawaqit', 'masjidal')),
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'failed')),
  error TEXT,
  fetched_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (place_id, provider)
);
CREATE INDEX IF NOT EXISTS place_source_fetched ON place_source (status, fetched_at);

-- The next ~two weeks of the linked timetable, denormalised for list cards and map pins:
-- {"p":"mawaqit","url":"…","at":1791486034000,"days":{"2026-10-08":{"a":{"fajr":"06:27",…},"i":{"fajr":"06:35",…},"j":["13:50"]}}}
ALTER TABLE place ADD COLUMN timetable_json TEXT;
