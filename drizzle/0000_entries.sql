CREATE TABLE entries (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  view TEXT NOT NULL,
  period TEXT NOT NULL,
  assigned_date TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN',
  important INTEGER NOT NULL DEFAULT 0,
  event_time TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  overdue INTEGER NOT NULL DEFAULT 0,
  source_id TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner, id)
);
--> statement-breakpoint
CREATE INDEX entries_owner_date ON entries(owner, assigned_date, period);
