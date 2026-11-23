CREATE TABLE "connection_machines" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connection_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "connection_machines_user_id_connection_id_unique" UNIQUE("user_id","connection_id")
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"urls" text[] NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE INDEX "machines_user_id_index" ON "machines" ("user_id");--> statement-breakpoint
ALTER TABLE "connection_machines" ADD CONSTRAINT "connection_machines_connection_id_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_machines" ADD CONSTRAINT "connection_machines_machine_id_machines_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_machines" ADD CONSTRAINT "connection_machines_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "machines" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');--> statement-breakpoint
CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "connection_machines" FOR EACH ROW EXECUTE FUNCTION "keep_deleted_record"('id');
