CREATE TABLE "workspace_encryption_keys" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"secret" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" uuid PRIMARY KEY
);
--> statement-breakpoint
-- Every workspace inherits its owner's key, so the strings already encrypted under it stay readable.
INSERT INTO "workspace_encryption_keys" ("created_at", "secret", "updated_at", "workspace_id")
SELECT DISTINCT ON ("members"."workspace_id") "user_encryption_keys"."created_at", "user_encryption_keys"."secret", "user_encryption_keys"."updated_at", "members"."workspace_id"
FROM "members"
INNER JOIN "user_encryption_keys" ON "user_encryption_keys"."user_id" = "members"."user_id"
WHERE "members"."role" = 'owner'
ORDER BY "members"."workspace_id", "members"."created_at";
--> statement-breakpoint
ALTER TABLE "connections" DROP CONSTRAINT "connections_user_id_users_id_fk";--> statement-breakpoint
DROP TABLE "user_encryption_keys";--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workspace_encryption_keys" ADD CONSTRAINT "workspace_encryption_keys_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Synced workspace rows now carry the member's role; a newer updatedAt makes every device's catch-up fetch it.
UPDATE "workspaces" SET "updated_at" = now();
