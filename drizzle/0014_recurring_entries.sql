ALTER TABLE entries ADD COLUMN series_id TEXT;
--> statement-breakpoint
ALTER TABLE entries ADD COLUMN series_index INTEGER;
--> statement-breakpoint
CREATE INDEX entries_owner_series ON entries(owner, series_id, series_index)
WHERE series_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE entry_series (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  PRIMARY KEY (owner, id)
);
