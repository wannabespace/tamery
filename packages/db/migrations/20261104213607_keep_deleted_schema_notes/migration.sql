CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "schema_notes" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
