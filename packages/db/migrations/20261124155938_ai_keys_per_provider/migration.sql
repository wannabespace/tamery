ALTER TABLE "ai_keys" DROP CONSTRAINT "ai_keys_user_id_key";--> statement-breakpoint
ALTER TABLE "ai_keys" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_user_id_provider_unique" UNIQUE("user_id","provider");