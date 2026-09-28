-- Phase 7: monthly timetables, special prayers. Additive only.
-- Timetable values live as facts `timetable.<prayer>` with the local date as qualifier, so the trust engine governs
-- them; these tables keep the provenance of each import.

CREATE TABLE IF NOT EXISTS timetable (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES place (id),
  month TEXT NOT NULL,
  source_photo_id TEXT REFERENCES photo (id),
  status TEXT NOT NULL DEFAULT 'imported',
  rows_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES user (id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS timetable_place ON timetable (place_id, month);

CREATE TABLE IF NOT EXISTS timetable_row (
  timetable_id TEXT NOT NULL REFERENCES timetable (id),
  local_date TEXT NOT NULL,
  prayer TEXT NOT NULL,
  adhan TEXT,
  iqamah TEXT NOT NULL,
  PRIMARY KEY (timetable_id, local_date, prayer)
);

CREATE TABLE IF NOT EXISTS special_prayer (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES place (id),
  kind TEXT NOT NULL CHECK (kind IN ('eid_fitr', 'eid_adha', 'taraweeh', 'tahajjud', 'janazah')),
  -- First (or only) date, YYYY-MM-DD in the place's time zone; `end_date` for nightly prayers across a range.
  date TEXT NOT NULL,
  end_date TEXT,
  -- [{ "time": "07:30", "location": "Park", "language": "English" }], or { "start": "21:30", "rakahs": 8 } for nightly prayers.
  times_json TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL REFERENCES user (id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS special_prayer_place ON special_prayer (place_id, date);
CREATE INDEX IF NOT EXISTS special_prayer_kind_date ON special_prayer (kind, date);
