CREATE TABLE sticker_capture (
  token_hash TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  expires INTEGER NOT NULL,
  content_type TEXT,
  image BLOB
);
--> statement-breakpoint
CREATE INDEX sticker_capture_expires ON sticker_capture(expires);
