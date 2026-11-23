CREATE TABLE phone_calendar_link (
  owner TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  snapshot TEXT NOT NULL DEFAULT '[]',
  source_count INTEGER NOT NULL DEFAULT 0,
  synced_on TEXT NOT NULL DEFAULT ''
);
