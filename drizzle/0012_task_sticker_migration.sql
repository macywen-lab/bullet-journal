DROP TRIGGER copy_note_photos_on_migration;
--> statement-breakpoint
CREATE TRIGGER copy_note_photos_on_migration AFTER INSERT ON entries
WHEN NEW.kind IN ('NOTE','TASK') AND NEW.source_id<>''
BEGIN
  INSERT INTO note_photos(owner, entry_id, id, object_key, created)
  SELECT owner, NEW.id, id, object_key, created
  FROM note_photos WHERE owner=NEW.owner AND entry_id=NEW.source_id;
END;
