CREATE TABLE calendar_oauth_requests (
  owner TEXT NOT NULL,
  provider TEXT NOT NULL,
  state_hash TEXT NOT NULL UNIQUE,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner,provider)
);
--> statement-breakpoint
CREATE TABLE cloud_calendar_links (
  owner TEXT NOT NULL,
  provider TEXT NOT NULL,
  credential TEXT NOT NULL,
  snapshot TEXT NOT NULL DEFAULT '[]',
  source_count INTEGER NOT NULL DEFAULT 0,
  synced_on TEXT NOT NULL DEFAULT '',
  syncing_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner,provider)
);
