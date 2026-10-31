CREATE TABLE "deleted_records" (
	"data" jsonb NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"record_id" uuid,
	"table_name" text,
	CONSTRAINT "deleted_records_pkey" PRIMARY KEY("table_name","record_id")
);
--> statement-breakpoint
CREATE INDEX "deleted_records_deleted_at_index" ON "deleted_records" ("deleted_at");--> statement-breakpoint
CREATE FUNCTION "keep_deleted_record"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	old_row jsonb := to_jsonb(OLD);
BEGIN
	INSERT INTO "deleted_records" ("table_name", "record_id", "data")
	VALUES (TG_TABLE_NAME, (old_row ->> TG_ARGV[0])::uuid, old_row)
	ON CONFLICT ("table_name", "record_id") DO UPDATE SET "data" = EXCLUDED."data", "deleted_at" = EXCLUDED."deleted_at";
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "users" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "user_encryption_keys" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('user_id');
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "workspaces" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "members" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "connections" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "connections_resources" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "queries" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "chats" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "chats_messages" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "chats_messages_parts" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "shares" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
