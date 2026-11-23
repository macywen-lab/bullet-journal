CREATE TABLE note_photos (
  owner TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner, entry_id, id),
  FOREIGN KEY (owner, entry_id) REFERENCES entries(owner, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX note_photos_objects ON note_photos(owner, object_key);
--> statement-breakpoint
CREATE TRIGGER copy_note_photos_on_migration AFTER INSERT ON entries
WHEN NEW.kind='NOTE' AND NEW.source_id<>''
BEGIN
  INSERT INTO note_photos(owner, entry_id, id, object_key, created)
  SELECT owner, NEW.id, id, object_key, created
  FROM note_photos WHERE owner=NEW.owner AND entry_id=NEW.source_id;
END;
