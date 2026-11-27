UPDATE "connection_machines" SET "machine_id" = '00000000-0000-0000-0000-000000000000' WHERE "machine_id" IS NULL;--> statement-breakpoint
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "connection_machines" ALTER COLUMN "machine_id" SET NOT NULL;
