CREATE TABLE "schema_notes" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"column" text,
	"connection_resource_id" uuid NOT NULL,
	"note" text NOT NULL,
	"schema" text,
	"table" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE INDEX "schema_notes_connection_resource_id_index" ON "schema_notes" ("connection_resource_id");--> statement-breakpoint
ALTER TABLE "schema_notes" ADD CONSTRAINT "schema_notes_0ndn0IPWN4AN_fkey" FOREIGN KEY ("connection_resource_id") REFERENCES "connections_resources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schema_notes" ADD CONSTRAINT "schema_notes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;